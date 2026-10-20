# Phase 42: CI Trim, Login Page & Build Footer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-12
**Phase:** 42-ci-trim-login-page-build-footer
**Areas discussed:** Legacy build pause + bypass, Snyk on main: image sources, Footer format & fallback, Login layout details

---

## Legacy build pause + bypass

| Question | Options | Selected |
|----------|---------|----------|
| Gate mechanism | Pipeline parameter / Commented-out block | Pipeline parameter |
| CI-06 revert form | Remove the gate entirely / Keep parameter, flip default to true | Keep parameter, default true |
| Bypass trigger | CircleCI API on staging / Web UI / You decide | CircleCI API, staging only |
| Hub mirror gated too | Gate both / Gate staging only | Gate both |

## Snyk on main: image sources

| Question | Options | Selected |
|----------|---------|----------|
| console-vue monitor source | thinxcloud/console:vue after vue-console-hub / keep private registry | thinxcloud/console:vue |
| console-classic monitor | Move to main + Hub behind the gate / leave as is behind the gate | Move to main + Hub, gated |
| thinx-console dev branch | Main only everywhere / keep thinx-console monitoring | Main only |
| Validation | circleci validate + MCP validate_config / You decide | circleci validate + MCP |

## Footer format & fallback

| Question | Options | Selected |
|----------|---------|----------|
| Text | One line `· {hash}` / two lines / labelled "build" | One line `· {hash}` |
| Hash length | 7 / 8 | 7 |
| No-commit fallback | Hide hash / show 'dev' | Hide |
| Year source | Build time in vue.config.js / commit date via CI | Build time |

## Login layout details

| Question | Options | Selected |
|----------|---------|----------|
| Logo | Above the widget, centred / inside the widget header | Above, centred |
| Darkening | Semi-opaque overlay / solid / You decide | Semi-opaque overlay |
| Social buttons | Side by side, wrapping / stacked full-width | Side by side |
| Other copy | Keep subtitle + Create link / drop subtitle | Keep both |

## Claude's Discretion

- How the CircleCI gate is structured (separate gated workflow vs. a `when` on the workflow), whether to extract a shared footer component, and the exact overlay alpha.

## Deferred Ideas

- "Create an Account" link points to `login` (itself): backlog.
