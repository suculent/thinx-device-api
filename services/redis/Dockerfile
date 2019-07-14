
FROM redis

ARG REDIS_PASSWORD=default
ENV REDIS_PASSWORD=$REDIS_PASSWORD

RUN echo "REDIS_PASSWORD: " ${REDIS_PASSWORD}

EXPOSE 6379

COPY ./docker-entrypoint.sh /docker-entrypoint.sh

ENTRYPOINT [ "/docker-entrypoint.sh" ]
