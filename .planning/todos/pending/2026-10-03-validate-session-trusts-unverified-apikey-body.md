---
created: 2026-10-03T19:00:00.000Z
title: Util.validateSession trusts an unverified owner_id + api_key body (mesh create/delete)
area: api
severity: critical
files:
  - lib/thinx/util.js:71-76 (validateSession body branch returns true without verifying the key)
  - lib/router.mesh.js:10-35 (deleteMesh takes owner_id from the body)
  - lib/router.mesh.js:68-90 (createMesh takes owner_id from the body)
  - lib/router.js:178-200 (body owner/api_key middleware verifies only bodies carrying `owner`)
---

## Problem

`Util.validateSession` returns `true` for any request body that carries both `owner_id` and
`api_key`. The comment says the pair "has been previously validated", but nothing validates it.
The `lib/router.js` POST middleware verifies the key only when the body carries `owner`, not
`owner_id`, so a body with `owner_id` + `api_key` skips verification entirely.

`lib/router.mesh.js` `createMesh` and `deleteMesh` gate on `validateSession`, then act on
`sanitka.owner(req.body.owner_id)`. These routes are not wrapped in `csrf.verifyCsrfToken`.
Result: an unauthenticated POST to `/api/mesh/create` or `/api/mesh/delete` with
`{"owner_id": "<any owner>", "api_key": "x", ...}` can create or delete meshes for any owner id.
Owner ids are not secret (they appear in firmware and MQTT topics).

Found during quick task 261003-s59 (CR-01 API-key substring fix); deliberately not fixed there
(threat T-s59-09, disposition: transfer).

## Fix

Either verify the key in the body branch (`apikey.verify(sanitka.owner(owner_id),
sanitka.apiKey(api_key), true, ...)`, which makes `validateSession` async), or drop the body
branch and let callers authenticate through the session/JWT or the router.js `owner` body path.
Add a spec: an unauthenticated mesh create/delete with a fake `api_key` must answer 401.
