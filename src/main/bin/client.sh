#!/bin/sh

# Usage:
# ./client.sh   to connect to localhost, default port
# ./client.sh some.host.net   connect to some.host.net, default port
# ./client.sh some.host.net 8888  connect to some.host.net, port 8888

# xtitle "Sammys-Settlers of Catan client"

HOST=localhost
PORT=8880

if [ ! -z $1 ]; then
	HOST=$1
	if [ ! -z $2 ]; then
		PORT=$2
	fi
fi

echo "Starting Sammys-Settlers of Catan Client..."

java -jar Sammys-Settlers.jar $HOST $PORT
