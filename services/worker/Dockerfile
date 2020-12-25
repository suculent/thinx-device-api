# docker build -t suculent/thinx-worker .

FROM node:15-alpine

RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/testing" >> /etc/apk/repositories

ARG SQREEN_TOKEN
ARG THINX_SERVER
ARG ROLLBAR_ACCESS_TOKEN
ARG ROLLBAR_ENVIRONMENT
ARG WORKER_SECRET
ARG REVISION

ENV THINX_SERVER=${THINX_SERVER}
ENV SQREEN_TOKEN=${SQREEN_TOKEN}
ENV ROLLBAR_ACCESS_TOKEN=${ROLLBAR_ACCESS_TOKEN}
ENV ROLLBAR_ENVIRONMENT=${ROLLBAR_ENVIRONMENT}
ENV WORKER_SECRET=${WORKER_SECRET}
ENV REVISION=${REVISION}
ENV WORKER=1

# RUN apk --no-cache add g++ gcc libgcc libstdc++ linux-headers make python curl git jq

# https://stackoverflow.com/questions/52196518/could-not-get-uid-gid-when-building-node-docker
# RUN npm config set unsafe-perm true

# allow building native extensions with alpine: https://github.com/nodejs/docker-node/issues/384
# RUN npm install -g node-gyp

WORKDIR /opt/thinx/thinx-device-api

COPY . .
COPY ./devsec-src ./devsec-src
COPY ./platforms ./platforms

RUN apk update && apk upgrade

RUN apk add --no-cache \
    autoreconf \
    bash \
    curl \
    g++ \
    gcc \
    git \
    jq \
    jo \
    libgcc \
    libc-dev \
    libstdc++ \ 
    linux-headers \
    make \
    perl-utils \
    zip \
    && cd ./devsec-src && ./build.sh && cd .. \
    && rm -rf ./devsec-src \
    && apk del \
    g++ \
    libstdc++ \
    libc-dev \
    libgcc \
    gcc

RUN git clone git://github.com/jpmens/jo.git && \
cd jo && \
autoreconf -i && \
./configure && \
make check && \
make install

# <-- DevSec

ENV VER="20.10.1"
RUN curl -sL -o /tmp/docker-$VER.tgz https://download.docker.com/linux/static/stable/x86_64/docker-$VER.tgz
RUN tar -xz -C /tmp -f /tmp/docker-$VER.tgz && \
    rm -rf /tmp/docker-$VER.tgz
RUN mv /tmp/docker/* /usr/bin

# set up subuid/subgid so that "--userns-remap=default" works out-of-the-box
RUN set -x \
	&& addgroup dockremap -g 65536 \
	&& adduser --system dockremap -g 65536 \
	&& echo 'dockremap:165536:65536' >> /etc/subuid \
	&& echo 'dockremap:165536:65536' >> /etc/subgid

# https://github.com/docker/docker/tree/master/hack/dind is this really needed now?
ENV DIND_COMMIT 37498f009d8bf25fbb6199e8ccd34bed84f2874b

RUN set -eux; \
	wget -O /usr/local/bin/dind "https://raw.githubusercontent.com/docker/docker/${DIND_COMMIT}/hack/dind"; \
	chmod +x /usr/local/bin/dind

VOLUME /var/lib/docker

# Running npm install for production purpose will not run dev dependencies.
RUN ls -la && npm install . --only-prod

# Create a user group 'thinx'
RUN addgroup -S thinx

# Create a user 'transformer' under 'thinx'
RUN adduser -S -D -h /opt/thinx/thinx-device-api worker thinx

# Chown all the files to the app user.
RUN chown -R worker:thinx /opt/thinx/thinx-device-api

# Make sure all production shell-scripts are executable
RUN chmod +x ./pre-builder \
 && chmod +x ./linter \
 && chmod +x ./pre-builder \
 && chmod +x ./devsec

# Switch to 'transformer' or 'node' user
USER worker

# Open the mapped port
EXPOSE 3000

CMD [ "node", "index.js" ]
