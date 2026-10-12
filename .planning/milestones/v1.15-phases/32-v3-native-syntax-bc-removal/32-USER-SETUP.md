# Phase 32: User Setup Required

**Generated:** 2026-10-08
**Phase:** 32-v3-native-syntax-bc-removal
**Status:** Complete

Claude automated everything possible; the single item below required operator access to the
production manager and the Traefik dashboard credential (D-12), and it was already in place when
Plan 32-01 started.

## Environment Variables

None — nothing in this phase reads a new environment variable.

## Account Setup

None.

## Dashboard Configuration

- [x] **Stage the Traefik dashboard `admin-auth` password on micro (D-12)**
  - Location: `ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020` — operator-only, BEFORE `/gsd-execute-phase 32`
  - Set to: `/root/.p32-traefik-admin` containing only the `admin-auth` password, mode `600`, owner `root` (`umask 077`)
  - Notes: the router status filter reads `/api/http/routers` behind the `admin-auth` basicauth middleware; the
    live apr1 hash cannot be inverted, so the executor cannot derive the password itself. The executor reads the
    file only into a shell variable on micro, verifies it against the live hash (`openssl passwd -apr1 -salt … -stdin`
    -> `HASH=MATCH`, `/api/overview` -> `200`), never prints or commits it, and shreds the file at the end of
    Plan 32-03. **Verified present and correct by Plan 32-01 Task 1 at 2026-10-08 13:44Z** (`600 root`, 8 bytes,
    `HASH=MATCH`, `overview=200`).

## Verification

After completing setup, verify with:

```bash
ssh root@188.166.23.244 -i ~/.ssh/DOKey2 -p2020 "stat -c '%a %U %s' /root/.p32-traefik-admin"
```

Expected results:
- `600 root <nonzero>` — Plan 32-01 observed `600 root 8`; the apr1 check printed `HASH=MATCH` and `overview=200`.

---

**Once all items complete:** Mark status as "Complete" at top of file. (Marked Complete by Plan 32-01 — the
credential stays in place for Plans 32-02 and 32-03; Plan 32-03 shreds it.)
