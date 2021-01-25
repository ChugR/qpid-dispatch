#!/bin/bash

echo To use the setup: telnet localhost 9191

podman run -it -p9090:9090 quay.io/skupper/tcp-echo
