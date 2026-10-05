# Phase 23: Build-Pipeline Sink Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-26
**Phase:** 23-build-pipeline-sink-hardening
**Areas discussed:** Worker job protocol, Private fetch contract, Refusal behaviour, core.symlinks & prod proof

---

## Worker job protocol

| Option | Description | Selected |
|--------|-------------|----------|
| argv + cmd transition | Job carries `argv` plus legacy `cmd`; deploy in either order | ✓ |
| argv only, coordinated | Replace `cmd`; worker deploys first | |
| API-side only | Build argv but still send a `cmd` string; worker untouched | |

| Option | Description | Selected |
|--------|-------------|----------|
| Worker change in this phase | Submodule commit + pointer bump | ✓ |
| Defer worker | API only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Run cmd-only job, log a warning | Keep existing check and shell path during transition | ✓ |
| Refuse it | Strict from day one | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Worker owns the binary path | argv = arguments only | ✓ |
| API sends argv[0] | | |

**User's choice:** All recommended options.

---

## Private fetch contract

| Option | Description | Selected |
|--------|-------------|----------|
| Share the public path | One argv clone/pull/basename routine; git.fetch supplies env only | ✓ |
| git.fetch takes {url, branch, path} | Separate sequence in git.js | |

| Option | Description | Selected |
|--------|-------------|----------|
| Exit code + basename.json | Blacklist kept for logging only | ✓ |
| Keep blacklist semantics | | |

| Option | Description | Selected |
|--------|-------------|----------|
| StrictHostKeyChecking=yes | Rely on seeded known_hosts | |
| accept-new | Trust on first use for unseeded hosts | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Keep try-all loop | No behaviour change | |
| Last-successful key first | Remember the working key | ✓ |

Follow-ups:

| Option | Description | Selected |
|--------|-------------|----------|
| In-process memory | Lost on restart | |
| Redis | Survives restarts, shared across replicas | ✓ |
| Source doc in CouchDB | Per repo | |

| Option | Description | Selected |
|--------|-------------|----------|
| Seeded ~/.ssh/known_hosts | Container-local, resets on redeploy | |
| Separate file on data volume | Persists across redeploys; volume is world-writable today | ✓ |

**Notes:** Claude added a constraint to the data-volume choice: 0700 directory / 0600 file, permissions and owner checked before use, with a fallback to the container-local file.

---

## Refusal behaviour

| Option | Description | Selected |
|--------|-------------|----------|
| Fail the build (thinx.yml) | Stop before read/credential write-back | ✓ |
| Ignore the file | Fall back to detected platform | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same rule for all repo files | One helper; cleanup unlink doesn't abort | ✓ |
| Fail on writes, skip on reads | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Reject with strict format | owner/udid regex + containment check | ✓ |
| Strip bad characters | | |

---

## core.symlinks & prod proof

| Option | Description | Selected |
|--------|-------------|----------|
| Accept silently | | |
| Warn in build log | Detect mode 120000 entries and log them | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated private test repo | | |
| An existing real device repo | User names it at verification | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Phase delta doc | `23-SAST-DELTA.md`, no GitHub dismissals | ✓ |
| Doc + dismiss in GitHub | | |
| Inline suppression comments | | |

---

## Claude's Discretion

- Reason strings, helper names and placement
- Redis key naming/TTL
- Worker per-element argv validation details
- Persistent known_hosts path

## Deferred Ideas

- Drop the legacy `cmd` field and the worker's shell path once no cmd-only jobs appear
- Refusing repos whose builds depend on symlinks (beyond the warning)
