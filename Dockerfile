FROM node:10.16.3
# using LTS node an attempt to fix python missing

# docker build -t suculent/thinx-device-api .


ARG ROLLBAR_ENVIRONMENT
ARG THINX_HOSTNAME
ARG THINX_OWNER_EMAIL
ARG REVISION
ARG ROLLBAR_ACCESS_TOKEN
ARG ROLLBAR_ENVIRONMENT

ARG ENVIRONMENT
ENV ENVIRONMENT=${ENVIRONMENT}

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

# Create app directory
WORKDIR /opt/thinx/thinx-device-api

RUN adduser --system --disabled-password --shell /bin/bash thinx

# WHY? See blame.
RUN sh -c "echo 'Dir::Ignore-Files-Silently:: \"(.save|.distupgrade)$\";' > /etc/apt/apt.conf.d/99ignoresave"

# RUN sed -i 's/main/main contrib non-free/g' /etc/apt/sources.list && \
RUN apt-get update -qq && \
    apt-get install -qq -y --fix-missing --no-install-recommends \
    apt-transport-https \
    apt-utils \
    btrfs-progs \
    ca-certificates \
    cppcheck \
    curl \
    e2fsprogs \
    gnutls-bin \
    iptables \
    lxc \
    mosquitto \
    pigz \
    python \
    python-pip \
    xfsprogs \
    xz-utils \
    net-tools \
    git \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Docker
# RUN curl -sSL https://get.docker.com/ | sh

# Install Docker Client only (Docker is on the host) - fails with /bin/sh not found...
ENV VER="18.06.3-ce"
RUN curl -sL -o /tmp/docker-$VER.tgz https://download.docker.com/linux/static/stable/x86_64/docker-$VER.tgz
RUN tar -xz -C /tmp -f /tmp/docker-$VER.tgz && \
    rm -rf /tmp/docker-$VER.tgz
RUN mv /tmp/docker/* /usr/bin

# Install app dependencies
COPY package.json ./

RUN openssl version \
 && node -v \
 && npm install .

# Test modules
RUN npm install nyc mocha jasmine mocha-lcov-reporter coveralls codacy-coverage -g

# set up subuid/subgid so that "--userns-remap=default" works out-of-the-box
RUN set -x \
	&& addgroup dockremap --gid 65536 \
	&& adduser --system dockremap --gid 65536 \
	&& echo 'dockremap:165536:65536' >> /etc/subuid \
	&& echo 'dockremap:165536:65536' >> /etc/subgid

# https://github.com/docker/docker/tree/master/hack/dind is this really needed now?
ENV DIND_COMMIT 37498f009d8bf25fbb6199e8ccd34bed84f2874b

RUN set -eux; \
	wget -O /usr/local/bin/dind "https://raw.githubusercontent.com/docker/docker/${DIND_COMMIT}/hack/dind"; \
	chmod +x /usr/local/bin/dind

VOLUME /var/lib/docker

# THiNX Web & Device API (HTTP)
EXPOSE 7442

# THiNX Device API (HTTPS)
EXPOSE 7443

# THiNX Web API Notification Socket
EXPOSE 7444

# GitLab Webbook
EXPOSE 9002

# Copy app source code
COPY . .

RUN rm -rf ./.git

# this should be generated/overwritten with sed on entrypoint, entrypoint needs /.first_run file and all ENV_VARS
COPY ./.thinx_env ./.thinx_env
#COPY ./conf/.thx_prefix ./conf/.thx_prefix

#ADD https://get.aquasec.com/microscanner .
#RUN chmod +x microscanner
#RUN ./microscanner ${AQUA_SEC_TOKEN} --continue-on-failure

RUN mkdir -p ./.nyc_output

COPY ./docker-entrypoint.sh /docker-entrypoint.sh

ENTRYPOINT [ "/docker-entrypoint.sh" ]
