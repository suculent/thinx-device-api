FROM node:11-alpine

MAINTAINER Matej Sychra <suculent@me.com>

RUN apk --no-cache add g++ gcc libgcc libstdc++ linux-headers make python curl git jq \
    && npm --silent install --global --depth 0 pnpm

# remove offending node_modules from development environment (may not be compatible with alpine)
RUN rm -rf ./node_modules

# allow building native extensions with alpine: https://github.com/nodejs/docker-node/issues/384
RUN npm --silent install --quiet node-gyp -g

# Sqreen.io token is inside a JSON file /app/sqreen.json
COPY / /home/node

WORKDIR /home/node/app
COPY .env /home/node/app/.env

# Running npm install for production purpose will not run dev dependencies.
RUN npm install -only=production

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

CMD echo "Running Rollbar Deploy..." \
    && source .env \
    && curl -s https://api.rollbar.com/api/1/deploy/ -F access_token=$RollbarToken -F environment=production -F revision=$(git log -n 1 --pretty=format:\"%H\") -F local_username=$(whoami) \
    && echo "Running App..." \
    && node --version \
    && node transformer.js


