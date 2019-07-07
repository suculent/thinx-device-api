FROM redis

ARG REDIS_PASSWORD

EXPOSE 6379

COPY ./redis.conf /etc/redis.conf

COPY ./docker-entrypoint.sh /docker-entrypoint.sh
ENTRYPOINT [ "/docker-entrypoint.sh" ]

RUN echo "export REDIS_PASSWORD=${REDIS_PASSWORD}" > /redis-password
