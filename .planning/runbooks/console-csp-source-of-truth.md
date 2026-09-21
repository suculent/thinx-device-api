# Console CSP — Source of Truth

**Established 2026-09-21** while reconciling Phase 21 (SEC-CSP-01) against deployed reality.

## The one thing to know

**The console images' nginx configs are NOT used in production.** Both console services bind-mount a
single shared host file over them, read-only:

```
/mnt/gluster/deployment/swarm/console/default.conf  ->  /etc/nginx/conf.d/default.conf   (ro)
```

This mount is declared on **both** `thinx_vue` and `thinx_console`
(`docker service inspect <svc> --format '{{json .Spec.TaskTemplate.ContainerSpec.Mounts}}'`).

Consequences:

- Editing `services/console/src/default.conf` or `services/console/vue/default.conf` changes
  **nothing** in production until the image is redeployed *and* the mount is removed.
- Because one file serves both consoles, `rtm.thinx.cloud` and `console.thinx.cloud` necessarily
  return an **identical** CSP. Per-console policy does not exist today.
- Phase 21 Plan 21-03 edited both image configs. Those edits are inert. SEC-CSP-01's live effect came
  from hand-editing the gluster file on **2026-09-19 20:16** (its mtime), during the inline-script
  session — not from the plan's changes.

The gluster path lives inside its own git repo on the swarm (`/mnt/glusterfs/deployment/swarm`),
separate from this repo and from the `services/console` submodule.

## How this was proven

A throwaway container from the deployed `:vue` image vs. the running container:

| | lines | Permissions-Policy | Strict-Transport | cloudfront |
|---|---|---|---|---|
| `:vue` image baseline | 95 | 1 | 0 | 0 |
| `services/console/vue/default.conf` @ HEAD | 95 | 1 | 0 | 0 |
| **Running container** | 103 | 0 | 1 | 1 |
| `/mnt/gluster/.../console/default.conf` | 103 | 0 | 1 | 1 |

The image matches the repo exactly; the container matches the mount (4634 bytes both). CI,
`vue/Dockerfile:94` and the build context were never at fault.

A verbatim snapshot of the production file is kept at
`.planning/runbooks/swarm-configs/console-default.conf.prod`.

## Three-way divergence (as of 2026-09-21)

Non-CSP security headers, production vs. what the repo intends:

| Header | Production (gluster) | Repo `src` / `vue` | Verdict |
|---|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | **absent** | repo is behind |
| `Referrer-Policy` | **absent** | `strict-origin-when-cross-origin` | production is behind |
| `Permissions-Policy` | **absent** | `camera=(), microphone=(), geolocation=()` | production is behind |
| `X-Permitted-Cross-Domain-Policies` | `all` | `none` | **production is weaker** |
| `X-Frame-Options` / `X-Content-Type-Options` / `X-XSS-Protection` / `X-Download-Options` | same | same | aligned |

`Referrer-Policy` and `Permissions-Policy` were added to the repo configs on 2026-06-16
(`2014b01`, "reduce browser security foot-guns"). Because of the mount, they never reached
production.

CSP itself: production carries the pinned host list plus `script-src-attr 'none'` and a `script-src`
with no `'unsafe-inline'` (it retains `'unsafe-eval'` — SEC-CSP-02, deferred). It additionally pins
`app.thinx.cloud`, `cloudfront.net`, `cdnjs.cloudflare.com`, `*.gravatar.com` and
`avatars.githubusercontent.com`, which the repo's `vue/default.conf` does not.

## Latent risk if the mount is ever removed

`services/console/vue/default.conf`'s `connect-src` omits `https://app.thinx.cloud` and
`wss://app.thinx.cloud`. The Vue console calls the API cross-origin at `app.thinx.cloud`, so if that
config ever takes effect, the priming `GET /api/v2/csrf-token` is CSP-blocked and a cold Vue session
cannot log in once CSRF enforcement is on. (`app.thinx.cloud` *was* present in that `connect-src` at
`cd2731f`/`b793bb8` and was dropped later — a regression, not an original oversight.)

**Do not remove the bind mount before reconciling the image configs.**

## Retirement path (recommended order)

1. Bring the repo configs up to production parity: add `Strict-Transport-Security`, restore
   `app.thinx.cloud` + `wss://app.thinx.cloud` to `vue/default.conf`'s `connect-src`, and align the
   pinned host list with the production file.
2. Bring production up to repo parity: add `Referrer-Policy` and `Permissions-Policy`, and change
   `X-Permitted-Cross-Domain-Policies` from `all` to `none`. This edits the gluster file and is a
   live header change — operator action, with the rollback being `git checkout` of that file in
   `/mnt/glusterfs/deployment/swarm`.
3. Only once 1 and 2 agree, drop the bind mount from both service specs so the image config becomes
   authoritative and CSP returns to being reviewable in code review.

Until step 3 lands, **any CSP change intended to reach production must edit the gluster file**, and
any verification of SEC-CSP-01 must target it.
