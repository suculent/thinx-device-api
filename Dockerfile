# ./update.sh

FROM suculent/thinx-base-image:latest

ARG ROLLBAR_ENVIRONMENT
ARG THINX_HOSTNAME
ARG THINX_OWNER_EMAIL
ARG REVISION
ARG ROLLBAR_ACCESS_TOKEN
ARG ROLLBAR_ENVIRONMENT
ARG COUCHDB_USER
ARG COUCHDB_PASSWORD

ARG ENVIRONMENT
ENV ENVIRONMENT=${ENVIRONMENT}

ENV COUCHDB_USER=${COUCHDB_USER}
ENV COUCHDB_PASSWORD=${COUCHDB_PASSWORD}

ARG DEBIAN_FRONTEND=noninteractive

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

ARG SQREEN_APP_NAME
ENV SQREEN_APP_NAME=${SQREEN_APP_NAME}

ARG SQREEN_TOKEN
ENV SQREEN_TOKEN=${SQREEN_TOKEN}

ENV THINX_HOSTNAME=${THINX_HOSTNAME}
RUN echo ${THINX_HOSTNAME}

ENV THINX_OWNER_EMAIL=${THINX_OWNER_EMAIL}
RUN echo ${THINX_OWNER_EMAIL}

ENV REVISION=${REVISION}
RUN echo ${REVISION}

ARG AQUA_SEC_TOKEN
ENV AQUA_SEC_TOKEN=${AQUA_SEC_TOKEN}

ARG SNYK_TOKEN
ENV SNYK_TOKEN=${SNYK_TOKEN}

# Create app directory
WORKDIR /opt/thinx/thinx-device-api

# second npm install is using package_lock to fix pinned transient dependencies
RUN npm update \
 && npm install --unsafe-perm . --only-prod \
 npm audit fix
# && npm audit fix --force # fails because of unfixable vulnerabilities

# THiNX Web & Device API (HTTP)
EXPOSE 7442

# THiNX Device API (HTTPS)
EXPOSE 7443

# GitLab Webbook (optional, moved to HTTPS)
EXPOSE 9002

# Copy app source code
COPY . .

RUN apt-get remove -y \
    && apt-get autoremove -y \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

#ADD https://get.aquasec.com/microscanner .
#RUN chmod +x microscanner && mkdir artifacts
#RUN ./microscanner ${AQUA_SEC_TOKEN} --html --continue-on-failure > ./artifacts/microscanner.html \
#    && cp ./artifacts/microscanner.html ./static/microscanner.html
#RUN rm -rf ./microscanner

RUN mkdir -p ./.nyc_output

COPY ./docker-entrypoint.sh /docker-entrypoint.sh

ENTRYPOINT [ "/docker-entrypoint.sh" ]
