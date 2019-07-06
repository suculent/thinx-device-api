FROM redis

ENV REDIS_PASSWORD=f1nall7s3curE

#RUN echo never > /sys/kernel/mm/transparent_hugepage/enabled
#RUN echo "vm.overcommit_memory = 1" > /etc/sysctl.conf

EXPOSE 6379

#COPY ./redis/redis.conf /etc/redis.conf

COPY ./docker-entrypoint.sh /docker-entrypoint.sh
ENTRYPOINT [ "/docker-entrypoint.sh" ]

RUN echo "export REDIS_PASSWORD=${REDIS_PASSWORD}" > /redis-password

