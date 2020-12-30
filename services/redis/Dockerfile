FROM redis

ARG REDIS_PASSWORD
ENV REDIS_PASSWORD=${REDIS_PASSWORD}

ARG ALLOW_EMPTY_PASSWORD=no
ENV ALLOW_EMPTY_PASSWORD=${ALLOW_EMPTY_PASSWORD}

ARG REDIS_DISABLE_COMMANDS=FLUSHALL
ENV REDIS_DISABLE_COMMANDS=${REDIS_DISABLE_COMMANDS}

RUN echo "REDIS_PASSWORD ON BUILD: ${REDIS_PASSWORD}"

RUN apt-get update -qq && apt-get install -qq -y ca-certificates apt-transport-https cron && \
    rm -rf /etc/apt/sources.list && apt-get update

# adduser --system --disabled-password --shell /bin/bash redis

COPY ./bgsave-cron /bgsave-cron
COPY ./redis_bgsave.sh /redis_bgsave.sh
RUN crontab /bgsave-cron

EXPOSE 6379

COPY ./docker-entrypoint.sh /docker-entrypoint.sh

RUN echo "export REDIS_PASSWORD=${REDIS_PASSWORD}" > /redis-password

ENTRYPOINT [ "/docker-entrypoint.sh" ]
