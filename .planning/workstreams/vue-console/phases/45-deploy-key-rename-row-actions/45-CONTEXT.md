# Phase 45: Deploy Key Rename & Row Actions - Context

**Gathered:** 2026-10-13
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous), all 4 areas accepted by the operator

<domain>
## Phase Boundary

A user renames a deploy key without changing the key material, and manages each key from compact icon actions with a
confirmed, single-shot delete on a table that stays readable on small screens. The Phase 38 review items (FIX-04:
IN-01..IN-04, IN-06, IN-07) are closed.

In scope: KEY-04, KEY-05, KEY-06, POL-04, FIX-04. Parent API (`lib/router.rsakey.js`, `lib/thinx/rsakey.js`,
`lib/thinx/github_link.js`, `lib/thinx/util.js` if needed) and the Vue Deploy Keys page
(`services/console/vue/src/pages/Rsakeys/Rsakeys.vue`, `src/store/rsakeys.js`).

Out of scope: any Legacy console (`services/console/src`) change; private-key storage (vault-transit Phase 40); a
same-second sort tiebreak beyond what IN-07 needs (REQUIREMENTS out-of-scope list).

</domain>

<decisions>
## Implementation Decisions

### Rename API and fingerprint (KEY-04)
- **D-01:** The fingerprint becomes the OpenSSH standard `SHA256:<base64, no padding>` computed over the decoded key
  blob only (what `ssh-keygen -l` and GitHub show). The comment/name is not part of it, so a rename keeps it. Every
  existing key's displayed fingerprint changes once to this form (accepted). Today it is `sha256(pubkey line)`
  (`rsakey.js:96`), which includes the comment.
- **D-02:** Rename is `PATCH /api/v2/rsakey` with body `{filename, name}`: `Util.validateSession` (401), owner from
  `sanitka.owner(req.session.owner)`, `csrf.verifyCsrfToken`, key addressed by exact private filename matched against
  `getKeyPathsForOwner(owner)` (owner-bound; unknown or foreign filename is refused). Response envelope
  `{success, response}` like the other rsakey routes. Add the route to `spec/jasmine/ZZ-CSRFRouteGuardSpec.js`. No
  Legacy v1 rename route. List/create/revoke envelopes stay unchanged.
- **D-03:** A PEM-format `.pub` is converted to OpenSSH (`type base64 name`) on rename; key material and fingerprint
  unchanged.
- **D-04:** Rename writes only the `.pub` file, atomically (temp file in the same directory + rename), preserving the
  file mode. The private key file is never opened, read or written (vault-transit Phase 40 safety).

### Key name validation (IN-01, IN-02, IN-03)
- **D-05:** One shared `RSAKey.validateKeyName(name)` returning `{ok, reason}`, used by create, rename and the router
  (replaces the duplicate checks at `router.rsakey.js:17` and `rsakey.js:366`).
- **D-06:** Rejected: empty/whitespace-only (`empty`), longer than 120 characters after trim (`too_long`), C0 controls,
  DEL and C1 controls 0x80–0x9F (`control_chars`), U+2028/U+2029 (`line_separator`), bidi embeddings/overrides/isolates
  U+202A–U+202E, U+2066–U+2069 and marks U+200E/U+200F (`bidi`). Letters, emoji and punctuation of any script stay
  allowed.
- **D-07:** Invalid names answer HTTP 400 on create and rename with `{success: false, response: "invalid_key_name",
  reason: "<reason>"}`; `response` is unchanged for Legacy compatibility. Vue maps each reason to a sentence naming the
  problem (e.g. "The name contains a hidden direction-override character.").
- **D-08:** Display (IN-03): the stored comment is shown as the name only if the `.pub` is a single-line `ssh-…` key and
  the comment passes `validateKeyName`; otherwise the generated date is shown.

### Vue Deploy Keys page (KEY-05, KEY-06, POL-04)
- **D-09:** Each row uses the Phase 44 `IconButton`: eye (Show key, toggles the public key text), copy (Copy key),
  pencil (Rename), trash (Delete, danger). Label = aria-label = hover tip.
- **D-10:** Rename opens a small modal prefilled with the current name; client-side validation mirrors D-06 and shows the
  message under the field; Save disabled while pending; list reloads on success.
- **D-11:** Per-row Delete confirms with `$bvModal.msgBoxConfirm` naming the key; that row's buttons are disabled while
  pending; no double submit. The checkbox bulk Delete moves out of the generate `<b-form>` into its own toolbar with the
  same confirm and pending guard.
- **D-12:** Name column truncated with ellipsis and the full name as `title`; Generated and Public Key columns
  `white-space: nowrap`; table inside `.table-responsive`. A failed list reload clears the rows and shows exactly one
  error message (no second empty-row error text).

### GitHub key, revoke duplicates, coordination, shipping (IN-04, IN-06, IN-07)
- **D-13:** GitHub linking (`lib/thinx/github_link.js:53-55`) pushes the owner's oldest key by filename timestamp,
  independent of list order; with no key it creates one as today.
- **D-14:** Revoke de-duplicates requested filenames (`new Set`) so each key is reported once; envelope unchanged.
- **D-15:** Phase 45 lands before vault-transit Phase 40 (not started). Record a note in
  `.planning/workstreams/vault-transit/STATE.md` about the new `.pub` writer, `validateKeyName` and the D-01 fingerprint
  so Phase 40 builds on them.
- **D-16:** Tests: IN-06 gaps (named generate → `list()` round-trip, router name selection from `req.query`/`req.body`
  and its 400, two keys created 1 ms apart, `filenames` null / 5 / `{}`, invalid-name callback counts) plus rename,
  validator and fingerprint specs (`spec/node/DeployKeyNames.test.js` via `npm run test:deploykeys`,
  `spec/jasmine/03-RsakeySpec.js`, `ZZ-RouterRSAKeySpec.js`, `GitHubLinkSpec.js`, `ZZ-CSRFRouteGuardSpec.js`) and Vue unit
  tests appended to `test:unit`. API and Vue ship together via `thinx-staging` (console submodule first, then parent).
  No Legacy change; operator UAT confirms the live Legacy console still lists, creates and revokes keys.

### Claude's Discretion
- File layout of the rename helper and the fingerprint function inside `rsakey.js`.
- Exact Vue copy for each validation reason, following the UI-SPEC copywriting rules.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `services/console/vue/src/components/IconButton/IconButton.vue` (Phase 44; props icon/label/variant/disabled, title on a
  wrapper span, `data-cy` passthrough; usage pattern `Devices.vue:135-136`; styles in `src/styles/_platforms.scss`).
- `rsakey.js`: `KEY_FILENAME` (:14), `getKeyPathsForOwner` (:46), `revokeUserKeys` (:55-68), `exportKeysForList`
  (:70-109; comment parse :93, name :95, PEM conversion :87, raw fallback :89), `toOpenSSH` (:345), `create` (:365).
- `Util.hasControlChars` (`lib/thinx/util.js:151`, C0 + DEL only).

### Established Patterns
- Router handlers: `Util.validateSession` → `sanitka.owner` → `Util.responder(res, success, response)`; CSRF on mutating
  routes (`router.rsakey.js:61,69,79,89`).
- Vue store `src/store/rsakeys.js`: `fetchItems` (throws if `!success`), `createItem`, `deleteItems`; `saveItems` re-sorts
  by `new Date(b.date)` (whole seconds).
- Vue page `Rsakeys.vue`: Delete inside the generate form (:9), text buttons Show/Copy (:22-23), `loadData` keeps stale
  rows on failure (:86-91); unit tests in `vue/tests/unit/milestone-v116.cjs`.

### Integration Points
- Legacy: `DeploykeyController.js`, `views/deploykey.html`, `thinx-api.js:1016-1057` (v1 list/create/revoke) — must keep
  working unchanged.
- `lib/thinx/git.js:451-460` uses `getKeyPathsForOwner` order (not `list()`).
- Phase 38 review: `.planning/milestones/v1.16-phases/38-deploy-key-management/38-REVIEW.md:198-275`,
  disposition `38-REVIEW-DISPOSITION.md:73-79`.

</code_context>

<specifics>
## Specific Ideas

- Fingerprint display may add a short "SHA256:" prefix exactly as OpenSSH prints it.
- The rename modal and per-row actions reuse Phase 44 copy conventions (single-verb labels accepted in 44-UI-SPEC).

</specifics>

<deferred>
## Deferred Ideas

- Legacy console rename UI (none planned; Legacy keeps list/create/revoke).
- Same-second ordering tiebreak beyond IN-07 (REQUIREMENTS out of scope).

</deferred>
