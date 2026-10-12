---
phase: 38-deploy-key-management
reviewed: 2026-10-12T14:32:17Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - lib/thinx/rsakey.js
  - lib/router.rsakey.js
  - spec/node/DeployKeyNames.test.js
findings:
  critical: 0
  warning: 6
  info: 7
  total: 13
status: issues_found
---

# Phase 38: Code Review Report

**Reviewed:** 2026-10-12T14:32:17Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Scope: the phase-38 backend diff (`git diff 58027c18^ HEAD`): optional key-name validation,
name persisted in the OpenSSH public-key comment, newest-first list, exact-filename deletion,
and the 666e5bf5 `reserveIdentifier` name claim. The console side (Rsakeys.vue, rsakeys
store, legacy DeploykeyController) was reviewed in 35-REVIEW and is not re-reported. The
review also checked the consumers `lib/thinx/github_link.js` and `lib/thinx/git.js`
(`keyNamesForOwner`), and the console callers, to confirm the API contract.

`npm run -s test:deploykeys`: 6/6 pass.

The core changes hold up. Exact-filename deletion is owner-scoped through
`getKeyPathsForOwner` and rejects traversal names. Names never reach a path. The `wx` claim
does prevent the same-millisecond overwrite.

I found six warnings and no blockers:

- "Newest first" is not guaranteed. The sort compares second-precision `Date.toString()`
  strings, and `reserveIdentifier`'s +1 ms bump creates exactly the case it gets wrong.
- The async key-generation callback still has throwing fs calls outside any `try`. With no
  `uncaughtException` handler, a disk error there takes down the API process and leaks the
  claim.
- A partial or failed private-key write can leave a visible but broken pair.
- `filenames` is iterated with `for…of` without an array check, so malformed bodies return
  500.
- Claim files stranded by a restart during generation are never purged, not even by GDPR
  `revokeAllForOwner`.
- `create()`'s response `filename` is an absolute server path ending in `.pub`. That shape
  can never match the exact-filename delete contract this phase introduced.

## Warnings

### WR-01: "Newest first" sort compares second-precision dates; keys created in the same second keep readdir order

**File:** `lib/thinx/rsakey.js:75,97`
**Issue:** `date` is `new Date(ts).toString()`, which drops milliseconds. The comparator
`new Date(b.date) - new Date(a.date)` therefore returns 0 for any two keys created within
the same second. `Array.prototype.sort` is stable, so those keys keep `fs.readdirSync`
order. That order is unspecified on ext4/GlusterFS (hash order) and ascending on others.
Verified: keys at `…000100` and `…000900` ms sort as `['older', 'newer']`.

`reserveIdentifier` (line 254) produces this case on purpose: a clash moves the timestamp
on by 1 ms. Two concurrent creates therefore always land in the same second, and the newer
key can be listed second. `github_link.js:54` pushes `list[0]`, so it can also pick the
older key. The Vue store (`rsakeys.js` `saveItems`) re-sorts with the same lossy comparator,
so it does not correct the order.
**Fix:** Sort on the numeric timestamp from the filename, not on the display string:
```js
const ts = (f) => Number(f.slice(owner.length + 1));
return exportedKeys.sort((a, b) => ts(b.filename) - ts(a.filename));
```
Alternatively, expose a numeric/ISO `created` field and sort on that. Add a test with two
keys 1 ms apart.

### WR-02: Throwing fs calls in the async generateKeyPair callback crash the process and leak the claim

**File:** `lib/thinx/rsakey.js:301-306,313`
**Issue:** This phase wrapped the private write in `try`, but `toOpenSSH(...)`,
`fs.writeFileSync(public_path, …)`, `fs.chmodSync(public_path, …)` and
`fs.chmodSync(private_path, …)` still run unguarded inside the `generateKeyPair` callback.
A throw there (ENOSPC, EACCES, EIO, or a gluster hiccup on `/mnt/data/ssh_keys`) is an
uncaught exception in an async callback. The repository has no
`process.on('uncaughtException')` handler (grep of `lib/` and `thinx-core.js`), so the API
process exits. `create()`'s callback never runs, so `releaseIdentifier` never runs either,
and the empty claimed `.pub` stays on disk (see WR-04).
**Fix:** Guard the whole write sequence and always report through the callback:
```js
}, (err, publicKey, privateKey) => {
  if (err) return callback(err);
  let openssh_key;
  try {
    openssh_key = RSAKey.toOpenSSH(publicKey, name || "thinx-" + date) + "\n";
    fs.writeFileSync(public_path, openssh_key, { mode: 0o644 });
    fs.chmodSync(public_path, 0o644);
    fs.writeFileSync(private_path, privateKey, { flag: "wx", mode: 0o600 });
    fs.chmodSync(private_path, 0o600);
  } catch (e) {
    return callback(e);
  }
  callback(null, openssh_key, privateKey);
});
```

### WR-03: A failed or partial private-key write leaves a visible, broken key pair

**File:** `lib/thinx/rsakey.js:305-312` with `releaseIdentifier` at `267-271`
**Issue:** The new public key is written into the claimed `.pub` before the private `wx`
write. Two failure paths are mishandled:
1. **Partial write (ENOSPC/EIO mid-write).** `writeFileSync(..., {flag:"wx"})` has already
   created the private file when the write fails. `releaseIdentifier` sees
   `fs.existsSync(keyname)` and returns "a real pair; never touch it". A truncated private
   key and its `.pub` are left behind. `list()` shows the key, and `git.js`
   `keyNamesForOwner` offers it to `ssh-add` on every fetch.
2. **EEXIST.** The comment says an existing private key "is never replaced". But its `.pub`
   has already been overwritten with a different public key, and the release step keeps it.
   The listed `pubkey` then no longer matches the private key, so the user would paste a
   key into GitHub that can never authenticate. This is unlikely: only a non-`create()`
   writer, such as an older replica during rollout, can produce it.
**Fix:** Write the private key to a temporary name (or use the `wx` claim on the private
file itself), then write the `.pub`. On any failure, unlink only the files this call
created: track `createdPrivate` / `createdPub` booleans instead of probing `existsSync` in
`releaseIdentifier`. Example: write the private key with `wx` first and record success. If
the `.pub` write then fails, unlink both. If the private write fails after `open`, unlink
the private file too.

### WR-04: Stranded claim files are never cleaned up, not even by GDPR `revokeAllForOwner` or `purgeOrphanedKeys`

**File:** `lib/thinx/rsakey.js:252-265` (claim), `109-126` (`revokeAllForOwner`), `129-141` / `174-181` (purge)
**Issue:** `reserveIdentifier` creates an empty `<owner>-<ts>.pub` before a 4096-bit
generation that takes seconds. If the process dies in that window, the claim file stays
forever. Causes include a swarm rolling update or Swarmpit autoredeploy sending SIGTERM,
WR-02, or an OOM. `getKeyPathsForOwner` (line 49) excludes `.pub` files, so
`revokeAllForOwner` (GDPR #353 account deletion) never deletes a lone `.pub`. The same
applies to any `.pub` whose private half is gone.

`listOwnersOnDisk` matches `.pub` names (`KEY_FILENAME` allows `(\.pub)?`), so
`purgeOrphanedKeys` reports such owners as orphaned with `keys: 0` on every run and never
removes anything. Before 666e5bf5, empty `.pub` files could not exist. Since phase 38, a
`.pub` that survives a failed private write (WR-03) can also carry the user-entered name.
**Fix:** Make `revokeAllForOwner` delete every `KEY_FILENAME` match for the owner, `.pub`
included:
```js
const files = fs.readdirSync(this.ssh_keys).filter(f => { const m = KEY_FILENAME.exec(f); return m && m[1] === owner; });
for (const f of files) fs.removeSync(this.ssh_keys + "/" + f);
```
Also have `purgeOrphanedKeys` (or a startup sweep) remove zero-byte `.pub` claims older
than a few minutes that have no private file.

### WR-05: `filenames` is iterated with `for…of` without an array check, so non-array bodies return 500

**File:** `lib/thinx/rsakey.js:59` and `lib/router.rsakey.js:43-44`
**Issue:** The router only rejects `filenames === undefined`. This phase replaced
`for (var kindex in revoked_filenames)` with `for (const filename of revoked_filenames)`.
That throws `TypeError: … is not iterable` for `null`, numbers, booleans and plain objects
(verified: `for (const x of 5)` gives "5 is not iterable"). The throw happens synchronously
in the route handler, and Express 5's default handler turns it into a 500. Outside
`NODE_ENV=production`, that 500 is an HTML stack trace with server paths. A string such as
`"abc"` is iterated character by character. That is harmless, but it shows the input is
never type-checked.
**Fix:** Validate in the router before calling `revoke`, and guard the library as well:
```js
if (!Array.isArray(filenames) || !filenames.every(f => typeof f === "string"))
  return Util.failureResponse(res, 400, "invalid_filenames");
```
In `revokeUserKeys`: `if (!Array.isArray(revoked_filenames)) return [];`.

### WR-06: `create()` response shape does not match the list/delete contract

**File:** `lib/thinx/rsakey.js:333,340-345`
**Issue:** The create response's `filename` is `this.newNameWithOwner(...) + '.pub'`, an
absolute server path such as `/mnt/data/ssh_keys/<owner>-<ts>.pub`. It discloses the
server's storage layout, and it ends in `.pub`. With this phase's exact-filename deletion,
a client that revokes using the `filename` it got from create always fails. `revokeUserKeys`
returns `[]` and the response is `success: false`, because that value can never be in
`getKeyPathsForOwner`.

The other fields drift as well:
- `name` is a string when a name was given and a **number** (`date`) when not, while
  `list()` returns the `Date.toString()` string.
- `date` is ISO 8601 here and `Date.toString()` in `list()`.

The consoles currently work around this by re-fetching the list. The legacy controller uses
`key.date || key.name`.
**Fix:** Return the same shape as `exportKeysForList`:
```js
const base = sanitka.owner(i_owner) + "-" + date;
callback(true, { name: keyName || new Date(date).toString(), date: new Date(date).toString(), pubkey: pubKey, filename: base });
```
Better still, add a machine-readable `created` (ms or ISO) to both and keep `date` for
display. Do not leak the absolute path.

## Info

### IN-01: Name validation is duplicated verbatim in router and library

**File:** `lib/router.rsakey.js:17` and `lib/thinx/rsakey.js:319`
**Issue:** The same 120-character / control-character predicate is copy-pasted. Through the
router, the library branch is unreachable. If the two copies drift, the HTTP layer returns
400 while the library returns `callback(false, "invalid_key_name")`, which reaches
`Util.responder` as HTTP 200 with `success:false`.
**Fix:** Export a single `RSAKey.validateKeyName(name)` (or a constant regex/limit) and use
it in both places.

### IN-02: Name filter allows Unicode bidi overrides, line/paragraph separators and C1 controls

**File:** `lib/thinx/rsakey.js:319`, `lib/router.rsakey.js:17`
**Issue:** `/[\r\n\x00-\x1f\x7f]/` blocks only ASCII controls. U+202E (RTL override),
U+2028/U+2029, U+0085 (NEL) and other C1 controls pass, and they are written into the
`.pub` comment. Verified with forge: the output was `"… a b c\u202e"`. The name is shown
only to its owner, and `\n` is still blocked, so the `.pub` stays one line. Bidi characters
can still spoof the display name in the console, and in the GitHub key list when the key
is pushed.
**Fix:** Also reject `\u0080-\u009f`, `\u2028\u2029` and `\u202a-\u202e\u2066-\u2069`. A
simpler option is to allow-list `\p{L}\p{N}\p{P}\p{Zs}` with the `u` flag.

### IN-03: Unparseable stored public keys produce a garbage display name

**File:** `lib/thinx/rsakey.js:82-89`
**Issue:** If `toOpenSSH` throws, `pubkey` is the raw file. The comment regex then strips
the first two whitespace-separated tokens and uses the rest as the name. For a damaged PEM,
that is `KEY-----\nMIIC…` (multi-line key material). An empty claim `.pub` next to a real
private file gives `""`, which falls back to the date.
**Fix:** Derive the comment only when `pubkey` starts with `ssh-` and is a single line.
Otherwise use `date`.

### IN-04: Duplicate filenames in a revoke request are reported as revoked twice

**File:** `lib/thinx/rsakey.js:57-66`
**Issue:** `key_paths` is computed once, before deletion. `["x","x"]` passes the `includes`
check twice, and `revoked_keys` becomes `["x","x"]`.
**Fix:** Iterate `new Set(revoked_filenames)`, or remove each entry from `key_paths` after
it is unlinked.

### IN-05: Dead code and debug logging around the touched functions

**File:** `lib/thinx/rsakey.js:51,58,102,221`
**Issue:** `filter()` never returns `undefined` (line 51). Arrays have no `.count`, so
`list()`'s early return never fires (line 221). `keyPathsExist`'s `undefined` check is dead
(line 102). The `🔨 [debug] revokeUserKeys` log (line 58) prints every request body
filename to production logs.
**Fix:** Remove the dead branches. Use `key_paths.length` in `list()`. Drop or gate the
debug log.

### IN-06: Tests do not cover the real name round-trip, HTTP validation, sort precision or malformed filenames

**File:** `spec/node/DeployKeyNames.test.js:36-47,48-59`
**Issue:** The named-create test stubs `generate`, so nothing verifies that
`generate(…, name)` writes the name into the `.pub` comment and that `exportKeysForList`
reads it back. The only real-generate test (line 73) creates unnamed keys. The router's
`req.query.name` / `req.body.name` selection and its 400 response are untested.

Other gaps:
- No test has two keys in the same second (WR-01).
- No test sends non-array `filenames` (WR-05).
- The invalid-name loop (line 54) asserts only inside callbacks. If `create` stopped calling
  back for invalid names, only the `generated === 1` count would notice.

**Fix:** Add a real-generate test with a name, followed by `list()`. Add router tests with a
fake `req`/`res`. Add a 1 ms-apart ordering test and a `filenames: null/5/{}` test. Count
the invalid-name callbacks.

### IN-07: The newest-first sort changes which key GitHub linking pushes

**File:** `lib/thinx/rsakey.js:97` (consumer `lib/thinx/github_link.js:53-55`)
**Issue:** `GitHubLink.link` pushes `list[0].pubkey` to the user's GitHub account keys.
Before this phase, `list[0]` was the first key in readdir order, usually the oldest. Now it
is the newest. A repo-specific named key the user just created, for example "Firmware
Repository", becomes the account-wide key pushed at link time. Combined with WR-01, which
of two same-second keys gets picked is not deterministic.
**Fix:** If this is intended, document it. Otherwise have `github_link` pick
deterministically, for example an unnamed key or the oldest, or create a dedicated key.

---

_Reviewed: 2026-10-12T14:32:17Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
