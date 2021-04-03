# docker build -t suculent/thinx-console .

FROM suculent/alpine-gulp AS builder

ARG COMPOSE_PROJECT_NAME
ARG LANDING_HOSTNAME
ARG WEB_HOSTNAME
ARG API_HOSTNAME
ARG API_BASEURL
ARG ENTERPRISE
ARG ENVIRONMENT
ARG GOOGLE_ANALYTICS_ID
ARG ROLLBAR_ACCESS_TOKEN
ARG CRISP_WEBSITE_ID
ARG GOOGLE_MAPS_APIKEY
ARG NGINX_PORT
ARG NGINX_HOST

ENV COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}
ENV LANDING_HOSTNAME=${LANDING_HOSTNAME}
ENV WEB_HOSTNAME=${WEB_HOSTNAME}
ENV API_HOSTNAME=${API_HOSTNAME}
ENV API_BASEURL=${API_BASEURL}
ENV ENTERPRISE=${ENTERPRISE}
ENV ENVIRONMENT=${ENVIRONMENT}
ENV GOOGLE_ANALYTICS_ID=${GOOGLE_ANALYTICS_ID}
ENV ROLLBAR_ACCESS_TOKEN=${ROLLBAR_ACCESS_TOKEN}
ENV CRISP_WEBSITE_ID=${CRISP_WEBSITE_ID}
ENV GOOGLE_MAPS_APIKEY=${GOOGLE_MAPS_APIKEY}
ENV NGINX_PORT=${NGINX_PORT}
ENV NGINX_HOST=${NGINX_HOST}

ENV CACHEBUST=1

#
# Builder Image
#

USER root

# Install, build, protect
RUN apk update \
    && apk upgrade \
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
RUN npm install . --only-prod \
    && npm run build \
    && npm audit fix

RUN apk del g++ gcc make

#
# Deployment Image
#

#FROM nginx:1.19.2-alpine

FROM nginx:alpine

WORKDIR /usr/share/nginx/html
COPY --from=0 /home/node/build/html .

# COPY default.conf /etc/nginx/conf.d/default.conf

RUN apt-get update -qq \
 && apt-get upgrade -y

# Only for Alpine, but the nginx is somewhere else then?
#COPY harden.sh .
#RUN chmod +x ./harden.sh
#RUN ./harden.sh
#USER user

# Expose port (HOST:CONTAINER; nginx, may be configured from outside with docker-compose)
EXPOSE 7440:80