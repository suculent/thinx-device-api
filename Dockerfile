FROM thinxcloud/base:latest

LABEL maintainer="Matej Sychra <suculent@me.com>"
LABEL name="THiNX API" version="1.9.2866"

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
# ENV persists into the published layers and this build is single-stage, so
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

RUN npm install -g npm@10.2.3 \
 && npm install --omit=dev .

# THiNX Web & Device API (HTTP)
EXPOSE 7442

# THiNX Device API (HTTPS)
EXPOSE 7443

# GitLab Webbook (optional, moved to HTTPS)
EXPOSE 9002

# Copy app source code
COPY . .

# TODO: Implement Snyk Container Scanning here in addition to DockerHub manual scans...

COPY ./docker-entrypoint.sh /docker-entrypoint.sh

ENTRYPOINT [ "/docker-entrypoint.sh" ]
