
# docker build -t suculent/thinx-console .

FROM ellerbrock/alpine-gulp AS builder

ARG COMPOSE_PROJECT_NAME=keyguru
ARG WEB_HOSTNAME=console.staging.thinx.cloud
ARG API_HOSTNAME=staging.thinx.cloud
ARG API_BASEURL=https://staging.thinx.cloud:7443
ARG ENTERPRISE=true
ARG ENVIRONMENT=staging
ARG GOOGLE_ANALYTICS_ID=UA-104084480-1
ARG ROLLBAR_ACCESS_TOKEN=d041448fab6b429db22f8beacc5f99b3

ENV COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}
ENV WEB_HOSTNAME=${WEB_HOSTNAME}
ENV API_HOSTNAME=${API_HOSTNAME}
ENV API_BASEURL=${API_BASEURL}
ENV ENTERPRISE=${ENTERPRISE}
ENV ENVIRONMENT=${ENVIRONMENT}
ENV GOOGLE_ANALYTICS_ID=${GOOGLE_ANALYTICS_ID}
ENV ROLLBAR_ACCESS_TOKEN=${ROLLBAR_ACCESS_TOKEN}

ARG CACHEBUST=1
ENV CACHEBUST=${CACHEBUST}

#
# Builder Image
#

USER root

# Install, build, protect
RUN apk update \
    && apk add g++ gcc libgcc libstdc++ linux-headers make python \
    && apk add ca-certificates \
    && update-ca-certificates \
    && apk --no-cache add --virtual native-deps \
    && npm install node-gyp gulp eslint -g

# Create app directory
WORKDIR /home/node/build

# Install app dependencies & source code
COPY package*.json ./
COPY . .
RUN echo "SRC BEFORE BUILD: " && pwd && ls -la \
    && npm install . \
    && npm run build
#   && npm audit fix

RUN echo "SRC/HTML AFTER BUILD: " && cd ./html && pwd && ls -la

#
# Deployment Image
#

FROM nginx

WORKDIR /usr/share/nginx/html
COPY --from=0 /home/node/build/html .
RUN echo "SRC AFTER BUILD: " && pwd && ls -la

RUN apt-get update \
 && apt-get install -y curl

# Expose port (HOST:CONTAINER; nginx, may be configured from outside with docker-compose)
EXPOSE 7440:80
