#!/bin/bash

# ECHO_CLIENT is qpid-dispatch/tests/TCP_echo_client.py

while true; do ECHO_CLIENT --host localhost --port 9191 --size 0; done
