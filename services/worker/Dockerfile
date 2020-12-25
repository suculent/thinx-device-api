# docker build -t suculent/thinx-worker .

FROM node:15-alpine

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

# RUN apk --no-cache add g++ gcc libgcc libstdc++ linux-headers make python curl git jq

# https://stackoverflow.com/questions/52196518/could-not-get-uid-gid-when-building-node-docker
# RUN npm config set unsafe-perm true

# allow building native extensions with alpine: https://github.com/nodejs/docker-node/issues/384
# RUN npm install -g node-gyp

RUN apk update && apk upgrade

RUN apk add \
    bash \
    curl \
    g++ \
    gcc \
    git \
    jq \
    libgcc \
    libc-dev \
    libstdc++ \ 
    linux-headers \
    make \
    zip

WORKDIR /opt/thinx/thinx-device-api

COPY . .
COPY ./devsec-src ./devsec-src
COPY ./platforms ./platforms

#    gcc libgcc linux-headers python
# --> DevSec Support (binary needs to be built for respective platform; requires g++)
RUN cd ./devsec-src && ls && ./build.sh && cd ..
RUN rm -rf ./devsec-src
RUN apk del \
    g++ \
    libstdc++ \
    libc-dev

# <-- DevSec

ENV VER="20.10.1"
RUN curl -sL -o /tmp/docker-$VER.tgz https://download.docker.com/linux/static/stable/x86_64/docker-$VER.tgz
RUN tar -xz -C /tmp -f /tmp/docker-$VER.tgz && \
    rm -rf /tmp/docker-$VER.tgz
RUN mv /tmp/docker/* /usr/bin

# set up subuid/subgid so that "--userns-remap=default" works out-of-the-box
RUN set -x \
	&& addgroup dockremap -G 65536 \
	&& adduser --system dockremap -G 65536 \
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
RUN chmod +x ./pre-builder
RUN chmod +x ./linter
RUN chmod +x ./pre-builder
RUN chmod +x ./devsec

# Switch to 'transformer' or 'node' user
USER worker

# Open the mapped port
EXPOSE 3000

RUN ls -la

CMD [ "node", "index.js" ]
