# `builder.thinx.dist.json` and `builder.thinx.json`

Both files live in the repository root and describe the **per-device firmware
header template** that the builder turns into `thinx.h` (or the platform
equivalent) at build time. Neither file is a deployment config: they contain no
server settings, and no value in them is read at API start-up.

## `builder.thinx.dist.json` — the template the builder actually reads

The only consumer in the codebase is `Builder.generate_thinx_json()` in
`lib/thinx/builder.js`. On every firmware build it:

1. reads the template from the repo root (relative to `lib/thinx/`), then
2. **overwrites every identity and version field** from live data before the
   JSON is handed to `JSON2H` and written into the build workspace:

| Field | Overwritten with |
|---|---|
| `THINX_ALIAS`, `THINX_UDID`, `THINX_PLATFORM` | the device record |
| `THINX_OWNER` | `device.owner` |
| `THINX_API_KEY` | the owner's most recent API key (`getLastAPIKey`) |
| `THINX_COMMIT_ID`, `THINX_FIRMWARE_VERSION*`, `THINX_APP_VERSION` | git commit / tag of the source |
| `THINX_CLOUD_URL`, `THINX_MQTT_URL`, `THINX_MQTT_PORT`, `THINX_API_PORT` | `app_config` |
| `LANGUAGE_NAME`, `THINX_ENV_*` | derived per platform / device environment |

Because owner and key are assigned unconditionally, the template does not
need to carry them at all. They were removed on 2026-09-15; the generated
header still contains both because the builder adds them. The fields that
*do* survive from the template are the `COMMENT_*` lines, `THINX_AUTO_UPDATE`,
`THINX_PROXY`, and the `%%PLACEHOLDER%%` markers that `JSON2H` substitutes.

## `builder.thinx.json` — unused sample

Nothing in `lib/`, `services/`, `spec/`, the Dockerfiles, or CI reads this
file. It is listed in `.gitignore` but was committed before that entry was
added, so git still tracks it. It differs from the `.dist` file only by an
extra `THINX_APP_VERSION` line. Treat it as a stale sample: it can be
untracked with `git rm --cached builder.thinx.json` at any time without
affecting builds.

## Deployment impact

The API image is built by CircleCI from the repository (`COPY . .` in the
`Dockerfile`), so the `.dist` template ships **inside** `thinxcloud/api`.
The production swarm stack (`/mnt/gluster/deployment/swarm/thinx.yml` on
`micro`, reached with the `thx` alias) does not bind-mount either file and
does not reference them; `thinx_api`, `thinx_worker` and `thinx_transformer`
only mount the `/mnt/gluster/thinx/*` data directories. Changing the
template therefore takes effect on the next image deploy and cannot break a
running stack: the builder only needs the file to exist and parse.

## Related

- `docs/PII-EXPOSURE-SCAN-REPORT.md`, finding ES-3, which flagged the
  hard-coded owner hash and API key that this change removed.
- `spec/jasmine/JSON2HSpec.js` uses a copy of the template as a fixture with
  dummy identity values.
