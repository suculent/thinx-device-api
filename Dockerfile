# Rebuild the Docker CLI with pinned x/net and grpc instead of relying on the
# copy inherited from thinxcloud/base:latest, so this image carries the fixed
# dependencies even when the base tag has not been republished yet.
# Keep in sync with base/Dockerfile and services/worker/Dockerfile.
FROM golang:1.26.8-alpine3.24 AS docker-cli

RUN apk add --no-cache ca-certificates curl git
WORKDIR /src/docker-cli

# Docker CLI v29.8.1, pinned by source commit and archive checksum.
RUN curl -fSL https://codeload.github.com/docker/cli/tar.gz/477f1252f2391a2b34fdce2e7bd03a0eee660005 -o /tmp/cli.tar.gz \
    && echo "4609135885a5afea23961dc07bb070febe3a9976165ff104b3138d46757006f8  /tmp/cli.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/cli.tar.gz --strip-components=1 \
    && rm /tmp/cli.tar.gz

# Upstream uses vendor.mod instead of go.mod. Build in module mode so the
# requested versions replace the vendored dependencies and remain auditable.
RUN cp vendor.mod go.mod && cp vendor.sum go.sum \
    && go get golang.org/x/net@v0.59.0 google.golang.org/grpc@v1.85.0-dev.0.20260825072537-93e31b48545e \
    && CGO_ENABLED=0 go build -mod=mod -trimpath -tags grpcnotrace \
       -ldflags "-s -w -X github.com/docker/cli/cli/version.Version=29.8.1 -X github.com/docker/cli/cli/version.GitCommit=477f125-deps" \
       -o /out/docker ./cmd/docker \
    && go version -m /out/docker | awk '\
       $1 == "dep" && $2 == "golang.org/x/net" { net = ($3 == "v0.59.0") } \
       $1 == "dep" && $2 == "google.golang.org/grpc" { grpc = ($3 == "v1.85.0-dev.0.20260825072537-93e31b48545e") } \
       END { exit !(net && grpc) }' \
    && /out/docker --version \
    && /out/docker run --help >/dev/null \
    && /out/docker service create --help >/dev/null

FROM thinxcloud/base:latest

LABEL maintainer="Matej Sychra <suculent@me.com>"
LABEL name="THiNX API" version="1.9.2866"

# Replaces the CLI inherited from thinxcloud/base (see the docker-cli stage above).
COPY --from=docker-cli /out/docker /usr/bin/docker

ARG DEBIAN_FRONTEND=noninteractive

ARG THINX_HOSTNAME
ENV THINX_HOSTNAME=${THINX_HOSTNAME}

ARG THINX_OWNER_EMAIL
ENV THINX_OWNER_EMAIL=${THINX_OWNER_EMAIL}

ARG COUCHDB_USER
ENV COUCHDB_USER=${COUCHDB_USER}

ARG ROLLBAR_ENVIRONMENT
ARG ROLLBAR_ENVIRONMENT=${ROLLBAR_ENVIRONMENT}

# No secret is declared as ENV in this image.
#
# ENV persists into the published layers of the final stage, so
# anything declared here is readable by anyone who pulls thinxcloud/api, which
# is public. Secrets reach the container at runtime instead, through
# docker-compose `environment:` and `env_file: .env`:
#
#   COUCHDB_PASS, REDIS_PASSWORD, ROLLBAR_ACCESS_TOKEN, GOOGLE_OAUTH_SECRET,
#   GITHUB_CLIENT_SECRET, GITHUB_ACCESS_TOKEN, SLACK_BOT_TOKEN,
#   SLACK_CLIENT_SECRET, SLACK_WEBHOOK, WORKER_SECRET, MAILGUN_API_KEY,
#   GIT_KEY_PASSPHRASE
#
# CODACY_PROJECT_TOKEN, AQUA_SEC_TOKEN and SNYK_TOKEN are CI-only and have no
# runtime use at all, so they are not declared in any form.

ARG ENVIRONMENT
ENV ENVIRONMENT=${ENVIRONMENT}

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

ARG REVISION
ENV REVISION=${REVISION}

# Full CI-commit SHA — Notifier.notifyAppStart() reads last 8 chars for the
# app-start Slack message so we can confirm which build is live.
ARG COMMIT_SHA
ENV COMMIT_SHA=${COMMIT_SHA}

ARG GOOGLE_OAUTH_ID
ENV GOOGLE_OAUTH_ID=${GOOGLE_OAUTH_ID}

ARG GITHUB_CLIENT_ID
ENV GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}

ARG SLACK_CLIENT_ID
ENV SLACK_CLIENT_ID=${SLACK_CLIENT_ID}

ARG ENTERPRISE
ENV ENTERPRISE=${ENTERPRISE}

# Create app directory
WORKDIR /opt/thinx/thinx-device-api

# Install app dependencies
COPY package.json ./

# npm is a build-time tool only and is removed in the same layer it was used
# in — a later `rm` would leave it in the earlier layer and save nothing.
#
# Safe because the production start path never calls it: docker-entrypoint.sh
# runs `node --trace-warnings thinx.js` for ENVIRONMENT=production (verified on
# the running swarm task), and nothing under lib/ shells out to npm — the only
# commands spawned there are `git rev-parse HEAD` and `hostname`. The
# entrypoint's `npm run test` branch is reached only when ENVIRONMENT=test, and
# that path builds from Dockerfile.test, which keeps npm.
#
# Both copies go: /usr/local (installed by the line above) and /usr/lib (from
# the base image). The ~/.npm cache is the bigger win at ~187 MB versus npm's
# own ~17 MB.
RUN npm install -g npm@10.2.3 \
 && npm install --omit=dev . \
 && npm cache clean --force \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /usr/lib/node_modules/npm /usr/bin/npm /usr/bin/npx \
           /root/.npm

# THiNX Web & Device API (HTTP)
EXPOSE 7442

# THiNX Device API (HTTPS)
EXPOSE 7443

# GitLab Webbook (optional, moved to HTTPS)
EXPOSE 9002

# Copy app source code
COPY . .

# API-served HTML must not depend on inline scripts. No test packages required.
RUN node --test spec/node/StaticCsp.test.js

# TODO: Implement Snyk Container Scanning here in addition to DockerHub manual scans...

COPY ./docker-entrypoint.sh /docker-entrypoint.sh

ENTRYPOINT [ "/docker-entrypoint.sh" ]
