---
status: investigating
trigger: "Linking a GitHub token in Vue Profile shows 'GitHub rejected this token'; adding git@github.com:suculent/thinx-autoflood.git fails"
created: 2026-10-13
---

# GitHub token link and private repository add (operator report 2026-10-13)

## Evidence (thinx_api log, task started 2026-10-13T18:41Z; token values never logged)
- `[github] GET /user/keys 403` (twice): GitHub accepted the token but refused to list SSH keys → the token lacks the
  SSH-key scope. The API mapped this to 401 `github_token_invalid` ("GitHub rejected this token").
- Source add: `Prefetch with sanitized url git@github.com:suculent/thinx-autoflood.git and branch master`, then five
  `[git] git_fetch_exception clone_failed status=128` (one anonymous attempt + one per owner key), then
  `Adding source failed: "Git fetch failed."`. git's stderr was not logged, so the exact cause is unknown.
- `suculent/thinx-autoflood` is private (anonymous `GET /repos/...` 404, anonymous smart-HTTP 401).

## What THiNX does with the token
Only `GET /user/keys` (read the account's SSH keys) and `POST /user/keys` (add the THiNX deploy key). Private repos are
then cloned over SSH with that key, so the GitHub account the key lands on must be able to read the repo.
Required scopes: classic `admin:public_key` (or `read:public_key` + `write:public_key`); fine-grained account
permission "Git SSH keys: Read and write". No `repo` scope.

## Hypothesis
Token lacked the SSH-key scope → THiNX key never reached GitHub → keyed SSH clones of the private repo were refused
(expected cause `publickey_denied` or `repo_not_found_or_no_access`). Second possibility (operator): the THiNX account
`grammatyk` linked a GitHub account that is not `suculent` or not a collaborator on `suculent/thinx-autoflood`; a key
on that account cannot read the repo even with the right scope.

## Debug logging added (kept for this investigation)
- `[github] <METHOD> /user/keys <status> message=<code> token_scopes=… accepted_scopes=… accepted_permissions=…
  request_id=…` on any non-2xx (allow-listed values only; spec GitHubRequestLogSpec).
- `[git] git_fetch_exception … cause=<code>` per clone attempt: publickey_denied, repo_not_found_or_no_access,
  host_key_failed, branch_not_found, https_auth_required, network, key_unusable, other, no_stderr
  (spec GitFailureCauseSpec).
- 403 from GitHub now answers 403 `github_token_missing_scope`; the Vue panel lists the scopes.

## Next steps
1. After this deploy: re-link a token with `admin:public_key`; expect `[github] POST /user/keys 201` (or 422
   already_in_use on the same account).
2. Re-add the repo; read the `cause=` codes. `publickey_denied` with the key on GitHub → the linked GitHub account
   cannot read the repo (check which account `grammatyk` linked and its collaborator access).
3. Only `branch_not_found`: the repo's default branch may be `main`, not `master`.
