#!/usr/bin/env sh
set -eu

: "${JS_WEB_PORT:=8080}"
: "${JS_TCP_PORT:=8880}"
: "${JS_WS_PORT:=8888}"
: "${JS_BOTS:=7}"
: "${JS_MAX_CONNECTIONS:=50}"
: "${JAVA_OPTS:=}"
: "${JS_EXTRA_ARGS:=}"

envsubst '${JS_WEB_PORT} ${JS_WS_PORT}' \
    < /etc/nginx/templates/jsettlers.conf.template \
    > /etc/nginx/conf.d/jsettlers.conf

java ${JAVA_OPTS} -jar /app/server/Sammys-SettlersServer.jar \
    "-Djsettlers.port=${JS_TCP_PORT}" \
    "-Djsettlers.websocket.port=${JS_WS_PORT}" \
    "-Djsettlers.startrobots=${JS_BOTS}" \
    "-Djsettlers.connections=${JS_MAX_CONNECTIONS}" \
    ${JS_EXTRA_ARGS} &
server_pid=$!

nginx -g 'daemon off;' &
nginx_pid=$!

stop_children()
{
    trap - INT TERM
    kill -TERM "$server_pid" "$nginx_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
    wait "$nginx_pid" 2>/dev/null || true
    exit 143
}

trap stop_children INT TERM

while true
do
    if ! kill -0 "$server_pid" 2>/dev/null
    then
        wait "$server_pid"
        exit $?
    fi

    if ! kill -0 "$nginx_pid" 2>/dev/null
    then
        wait "$nginx_pid"
        exit $?
    fi

    sleep 1
done
