FROM node:14.11.0-alpine

ARG SQREEN_APP_NAME
ARG SQREEN_TOKEN
ARG ROLLBAR_ACCESS_TOKEN
ARG ROLLBAR_ENVIRONMENT
ARG REVISION=${REVISION}

ENV ROLLBAR_ACCESS_TOKEN=${ROLLBAR_ACCESS_TOKEN}
ENV ROLLBAR_ENVIRONMENT=${ROLLBAR_ENVIRONMENT}

RUN echo "ROLLBAR_ACCESS_TOKEN: ${ROLLBAR_ACCESS_TOKEN}"

RUN apk --no-cache add g++ gcc libgcc libstdc++ linux-headers make python curl git jq

# remove offending node_modules from development environment (may not be compatible with alpine)
RUN rm -rf ./node_modules

# https://stackoverflow.com/questions/52196518/could-not-get-uid-gid-when-building-node-docker
RUN npm config set unsafe-perm true

# allow building native extensions with alpine: https://github.com/nodejs/docker-node/issues/384
RUN npm install -g node-gyp

# Sqreen.io token is inside a JSON file /app/sqreen.json
RUN mkdir -p /home/node/app
COPY ./app/** /home/node/app

WORKDIR /home/node/app

# Running npm install for production purpose will not run dev dependencies.
RUN ls -la && npm install . --only-prod

# Create a user group 'thinx'
RUN addgroup -S thinx

# Create a user 'transformer' under 'thinx'
RUN adduser -S -D -h /home/node/app transformer thinx

# Chown all the files to the app user.
RUN chown -R transformer:thinx /home/node/app

# Switch to 'transformer' or 'node' user
USER transformer

# Open the mapped port
EXPOSE 7474

CMD [ "node", "transformer.js" ]
