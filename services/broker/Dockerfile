FROM alpine:3.7

RUN apk update && apk add --no-cache incron mosquitto-clients

COPY ./config/mosquitto.conf /etc/mosquitto/conf.d/mosquitto.conf
COPY ./mqtt_restart.sh /mqtt_restart.sh

RUN echo "mosquitto" >> /etc/incron.allow && \
    echo "root" >> /etc/incron.allow && \
    mkdir -p /var/spool/incron && \
    chmod +x /mqtt_restart.sh

COPY ./incron.cfg /var/spool/incron/root

RUN incrontab -l

EXPOSE 1883 8883 9001

COPY  ./docker-entrypoint.sh /docker-entrypoint.sh

ENTRYPOINT [ "/docker-entrypoint.sh" ]
