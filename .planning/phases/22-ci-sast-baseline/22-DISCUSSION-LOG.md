# Phase 22: CI & SAST Baseline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-25
**Phase:** 22-ci-sast-baseline
**Areas discussed:** Test-job registry login, CodeQL workflow shape, Vue hostname verification, Dead env removal reach

---

## Test-job registry login

| Option | Description | Selected |
|--------|-------------|----------|
| Verify, then delete | Confirm nothing in the test job pulls from the private registry, then delete; fall back to registry-login | ✓ |
| Route via registry-login | Follow the requirement literally | |

| Option | Description | Selected |
|--------|-------------|----------|
| Leave as is | docker.io/dhi.io logins are out of CI-02 scope | ✓ |
| Parametrise registry-login | One retrying path for all logins | |

| Option | Description | Selected |
|--------|-------------|----------|
| No, defer | Push retry / serial-group not in CI-02 | ✓ |
| Add bounded push retry | Wrap docker push in a retry loop | |
| Add serial-group | Serialise publish jobs | |

---

## CodeQL workflow shape

| Question | Options | Selected |
|----------|---------|----------|
| Schedule | Keep weekly cron / Push-PR only | Keep weekly cron |
| Query suite | security-extended / default / security-and-quality | security-extended |
| paths-ignore | Vendored/minified + tests / Vendored/minified only / You decide | Vendored/minified + tests |
| Alert triage | Record baseline only / + dismiss FPs / + fix trivial | Record baseline only |
| Main/PR trigger proof | Open PR staging→main / Staging run + config review / Full proof in-phase | Open PR staging→main |

---

## Vue hostname verification

| Question | Options | Selected |
|----------|---------|----------|
| Target host | https://app.thinx.cloud / https://console.thinx.cloud / whatever VUE_HOSTNAME is | https://console.thinx.cloud |
| Proof | Chain + bundle + clicks / Bundle grep only | Chain + bundle + clicks |
| If broken | Fix the var/chain / Drop the build arg | Fix the var/chain |

---

## Dead env removal reach

| Option | Description | Selected |
|--------|-------------|----------|
| Repo + gluster + live | Edit both files + `service update --env-rm` on one service | ✓ |
| Repo + gluster file only | Leave running service until next redeploy | |
| Repo only | Only docker-swarm.yml | |

**Notes:** After the answer, Claude found that the env at `docker-swarm.yml:343` belongs to the classic `console` service (line 316), not the Vue service. The user was told. The decision stands, and the env-rm now targets the classic console service.

---

## Claude's Discretion

- paths-ignore glob list, matrix vs single job, cron time, baseline artifact format.

## Deferred Ideas

- docker push retry / serial-group
- registry-login parametrisation for docker.io/dhi.io
- CodeQL FP dismissal / trivial fixes (Phase 23+)
- Other dead VUE_APP_* envs on the classic console service
