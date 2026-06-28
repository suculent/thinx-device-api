# Task: Fix device-transfer email rendering as raw HTML (#541)

**Type:** bug · **Effort:** XS (≈15 min) · **Risk:** low · **Priority:** quick win

## Problem
Device-transfer emails arrive showing literal `<!DOCTYPE html><p>Hello...` text
instead of rendered HTML. Root cause: the email bodies are placed in Mailgun's
`text:` field (plain text) instead of the `html:` field.

## Root cause (located)
`lib/thinx/transfer.js`:
- **Recipient email** — `recipientTransferEmail`, lines ~352–366: HTML string assigned to `text:`.
- **Sender email** — `senderTransferEmail`, lines ~372–383: HTML string assigned to `text:`.

Both embed a raw `<!DOCTYPE html>...</html>` in `text:`. The mailer wrapper
`sendMail()` (transfer.js:242–254) passes the object straight to
`mg.messages.create(...)`, so Mailgun treats it as plain text.

The correct pattern already exists in `lib/thinx/owner.js`:
- `html_mail_header` / `html_mail_footer` constants (owner.js:61–62)
- All owner.js mails set BOTH `text:` (plaintext fallback) AND `html:` (rendered).

## Scope of changes
- `lib/thinx/transfer.js` only. No API/route/schema changes.

## Implementation
For each of the two email objects:
1. Move the HTML markup from `text:` into a new `html:` field, wrapped with the
   shared `html_mail_header` / `html_mail_footer` (export them from owner.js or
   define matching local constants — prefer reusing owner.js to stay DRY).
2. Replace the inline `<!DOCTYPE html>...` / trailing `</html>` with the
   header/footer constants.
3. Provide a real plaintext `text:` fallback (strip tags — e.g. "Hello {to}.
   User {from} is transferring N device(s) to you. Accept: <url> Decline: <url>").
4. Keep the Accept/Decline links intact in both html and text variants.

## Acceptance criteria
- [ ] Both transfer emails set `html:` with proper header/footer; no `<!DOCTYPE>`
      string lands in a `text:` field.
- [ ] A plaintext `text:` fallback is present for both emails.
- [ ] Accept and Decline URLs render as clickable links in the HTML version.
- [ ] Manual/spec check: a sent transfer email renders as formatted HTML in a
      standard client (no visible tags).

## Verification
- Unit/spec: extend transfer spec (if present) to assert the email object has a
  non-empty `html` field and a `text` field without `<!DOCTYPE`.
- Grep guard: `grep -n "text:.*DOCTYPE" lib/thinx/transfer.js` returns nothing.

## Commit
`fix(transfer): send device-transfer emails as html instead of plaintext (#541)`
