# docker build -t suculent/thinx-worker .

FROM node:15-alpine

ARG SQREEN_TOKEN
ARG THINX_SERVER
ARG ROLLBAR_ACCESS_TOKEN
ARG ROLLBAR_ENVIRONMENT
ARG WORKER_SECRET

ENV THINX_SERVER=${THINX_SERVER}
ENV SQREEN_TOKEN=${SQREEN_TOKEN}
ENV ROLLBAR_ACCESS_TOKEN=${ROLLBAR_ACCESS_TOKEN}
ENV ROLLBAR_ENVIRONMENT=${ROLLBAR_ENVIRONMENT}
ENV WORKER_SECRET=${WORKER_SECRET}

# RUN apk --no-cache add g++ gcc libgcc libstdc++ linux-headers make python curl git jq

# remove offending node_modules from development environment (may not be compatible with alpine)
RUN rm -rf ./node_modules

# https://stackoverflow.com/questions/52196518/could-not-get-uid-gid-when-building-node-docker
# RUN npm config set unsafe-perm true

# allow building native extensions with alpine: https://github.com/nodejs/docker-node/issues/384
# RUN npm install -g node-gyp

RUN apk add \
    git \
    jq \
    zip
#    g++ \
#    libstdc++ \


WORKDIR /home/node/worker

COPY . .

# Running npm install for production purpose will not run dev dependencies.
RUN ls -la && npm install . --only-prod

# Create a user group 'thinx'
RUN addgroup -S thinx

# Create a user 'transformer' under 'thinx'
RUN adduser -S -D -h /home/node/worker worker thinx

# Chown all the files to the app user.
RUN chown -R worker:thinx /home/node/worker

# Switch to 'transformer' or 'node' user
USER worker

# Open the mapped port
EXPOSE 3000

CMD [ "node", "index.js" ]
