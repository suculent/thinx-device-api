---
created: 2026-10-15T11:57:29.703Z
title: Route rtm and console 404s to the error-pages landing page
area: infra
severity: minor
files:
  - thinx-swarm/thinx.yml:300
  - thinx-swarm/thinx.yml:372
  - thinx-swarm/thinx.yml:422
  - thinx-swarm/traefik.yml:67
  - thinx-swarm/errorpage.yml:27
---

## Problem

Unknown paths on rtm.thinx.cloud and console.thinx.cloud return the backend's bare 404 instead of the errorpage stack
landing page. `error-pages-middleware` (defined in traefik.yml:67-69, `status=400-599`, service `errorpage`) is
attached only to the db and influx routers (thinx.yml:149, :506). `thinx-api-https` has only `sslheaders@swarm`
(:300); `thinx-console-https` (:372) and `thinx-vue-console-https` (:422) have no middleware.

## Solution

Do NOT attach the existing 400-599 middleware to `thinx-api-https` / `thinx-api-ws`: it would replace the API's
JSON 401/403/404 envelopes with HTML and break the console and devices. Define a separate middleware (e.g.
`error-pages-404`, `status=404` and maybe `502-504`) and attach it to the console routers (Legacy on rtm =
`thinx-console-https`, Vue = `thinx-vue-console-https`) only; check whether the Vue SPA's history-mode fallback
already serves index.html for unknown paths (then a 404 never reaches Traefik). Edge rules (AGENTS.md): repo first in
thinx-swarm, then one `docker service update --label-add` per service, never `docker stack deploy` / `restart.sh`;
verify with the loopback API gate (routers status filter must print nothing). Port 7442 is untouched.
