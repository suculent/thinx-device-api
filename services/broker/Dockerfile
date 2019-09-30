FROM debian:jessie-slim

ARG MOSQUITTO_PASSWORD
ARG MOSQUITTO_USERNAME

ENV MOSQUITTO_PASSWORD=${MOSQUITTO_PASSWORD}
ENV MOSQUITTO_USERNAME=${MOSQUITTO_USERNAME}

RUN apt-get update -qq && apt-get install -qq -y ca-certificates apt-transport-https incron cron wget && \
    wget -q --no-check-certificate -O - https://repo.mosquitto.org/debian/mosquitto-repo.gpg.key | gpg --import && \
    gpg -a --export 8277CCB49EC5B595F2D2C71361611AE430993623 | apt-key add - && \
    wget -q --no-check-certificate -O /etc/apt/sources.list.d/mosquitto-jessie.list https://repo.mosquitto.org/debian/mosquitto-jessie.list && \
    apt-get update -qq && apt-get install -qq -y mosquitto mosquitto-clients && \
    adduser --system --disabled-password --shell /bin/bash mosquitto && \
    rm -rf /etc/apt/sources.list && apt-get update

COPY ./config/mosquitto.conf /etc/mosquitto/conf.d/mosquitto.conf

COPY ./mqtt_restart.sh /mqtt_restart.sh
COPY ./docker-entrypoint.sh /docker-entrypoint.sh
COPY ./incron.cfg /var/spool/incron/root
COPY ./reload-cron /reload-cron

RUN echo "export MOSQUITTO_USERNAME=${MOSQUITTO_USERNAME}" > /mqtt_username
RUN echo "export MOSQUITTO_PASSWORD=${MOSQUITTO_PASSWORD}" > /mqtt_password

RUN echo "mosquitto" >> /etc/incron.allow && \
    echo "root" >> /etc/incron.allow && \
    mkdir -p /var/spool/incron && \
    chmod +x /mqtt_restart.sh

RUN chown root:incron /var/spool/incron/root && \
    incrontab -l

RUN crontab /reload-cron

EXPOSE 1883 8883 9001

RUN echo "ENV check: ${MOSQUITTO_USERNAME} ${MOSQUITTO_PASSWORD}"

ENTRYPOINT [ "/docker-entrypoint.sh" ]
