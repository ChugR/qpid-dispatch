#!/bin/bash

DEVROOT=/home/chug/git/qpid-dispatch

# launch
${DEVROOT}/build/router/qdrouterd -c `pwd`/COLLECTD.conf -I ${DEVROOT}/python &
pidB=$!

echo  to shut down routers execute: kill $pidB
