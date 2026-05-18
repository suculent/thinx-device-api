# THiNX Migration Tasklist

This document tracks migration and container-hardening work for the THiNX
deployment stack. Each row should be actionable without needing to infer the
next owner decision from older notes.

## Container Security Review

| Container | State | Owner | Status | Next action | Acceptance criteria |
|:----------|:------|:------|:-------|:------------|:--------------------|
| `api` | Published | THiNX | Needs vulnerability follow-up | Review the 3 reported dependency issues and decide whether each is patched, accepted, or blocked by a base image update. | Scan result is linked, each issue has a disposition, and the API image rebuilds from the documented base image. |
| `alpine-gulp` | Published | THiNX | Accepted | Keep current image published and include it in scheduled image scans. | Latest scan remains clean or new findings are tracked in the backlog. |
| `base` | Published | THiNX | High-risk dependency backlog | Identify the packages behind the 165 reported issues and decide whether to rebuild the base image or replace it. | A new base image digest or accepted-risk record is documented before downstream images are rebuilt. |
| `broker` | Published | OSS | Vendor image risk | Track vendor base image updates and confirm whether THiNX can override the base safely. | Broker deployment references a patched vendor image, a THiNX-maintained derivative, or a documented risk acceptance. |
| `console` | Custom-built | User | Namespace and publication decision needed | Decide whether the console should remain private under `thinx/` or move to a documented THiNX image namespace. | Build source, image name, registry namespace, and deployment reference are documented and reproducible. |
| `couchdb` | Published | OSS | Vendor image risk | Track vendor updates for the 92 reported issues and confirm compatibility with the current CouchDB data volume. | Target image version is documented with migration and rollback notes. |
| `redis` | Published | OSS | Vendor image risk | Track vendor updates for the 69 reported issues and confirm session compatibility with Redis 5 client behavior. | Target image version is documented, staging starts cleanly, and session storage smoke tests pass. |
| `transformer` | Published | THiNX | Accepted | Keep image in scheduled scans and rebuild when the base image changes. | Latest scan remains clean or new findings are tracked in the backlog. |
| `worker` | Published | THiNX | Accepted with builder dependency | Keep worker image in scheduled scans and validate any builder contract changes against it. | Worker can dispatch builds to every supported builder image in staging. |
| `builders` | Published | THiNX | Inventory incomplete | List each one-shot builder image, Dockerfile path, base image, command contract, and security scan result. | Builder inventory is complete and every supported firmware target has a documented image owner and rebuild path. |

## Migration Tasks

| ID | Task | Owner | Status | Next action | Acceptance criteria |
|:---|:-----|:------|:-------|:------------|:--------------------|
| MIG-001 | Builder image inventory | THiNX | Open | Map all one-shot builder containers used by the worker, including Arduino and PlatformIO variants. | The inventory includes image name, registry, Dockerfile path, base image, supported target, command entrypoint, scan status, and current deployment consumer. |
| MIG-002 | Builder image hardening plan | THiNX | Open | For each builder image, decide whether to pin the base image, rebuild from a patched base, or retire the image. | Every builder image has an owner decision, target base digest or tag, and validation command. |
| MIG-003 | Console image publication decision | THiNX/User | Open | Decide whether the custom console image remains user-built or becomes a published THiNX image. | Deployment docs name the registry namespace, tag policy, build command, and rollback image for the console. |
| MIG-004 | Base image refresh | THiNX | Open | Review whether `thinxcloud/base:alpine` should be rebuilt, pinned, or replaced. | Downstream API, worker, transformer, and builder rebuild plans reference the selected base image digest or tag. |
| MIG-005 | Compose and Swarm deployment parity | THiNX | Open | Validate that Docker Compose and Docker Swarm use the same image names, environment variables, and health checks where applicable. | A staging deployment can be recreated from documented Compose or Swarm files without manual image substitutions. |
| MIG-006 | Vendor image update review | THiNX | Open | Review broker, CouchDB, and Redis vendor image upgrades against data compatibility and runtime configuration. | Each vendor image has an upgrade target, compatibility note, and rollback instruction. |

## Architecture Components

THiNX can be deployed with Docker Compose or Docker Swarm using extended
deployment tags for Swarmpit. Bare Docker container deployment has not been
validated recently. Kubernetes and other orchestrators are outside the current
migration scope until a deployment owner requests and defines that work.

| Service name | Purpose | Migration note |
|:-------------|:--------|:---------------|
| Traefik | Ingress router and SSL manager | Keep routing and TLS behavior aligned between Compose and Swarm. |
| Swarmpit | Container orchestrator and monitoring UI | Used for task rollout monitoring in the current deployment flow. |
| API | REST API | Rebuild after base image and dependency changes. |
| Console | Single-page UI app | Clarify image namespace and publication ownership. |
| Broker | Message queue | Track vendor image security updates. |
| Transformer | Lambda execution sandbox | Rebuild when the base image changes. |
| Worker | Build dispatcher | Validate builder image contracts after any builder migration. |
| Redis | High-speed user data and session storage | Validate sessions after image or client upgrades. |
| CouchDB | Medium-speed user data storage | Validate data volume compatibility before image upgrades. |
| Builders | One-shot firmware build containers | Inventory and harden each supported builder image. |
