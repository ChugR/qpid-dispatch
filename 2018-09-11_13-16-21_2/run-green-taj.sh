#!/bin/bash

# Environment for python/proton/n/stuff
#source ~/bin/dispatch-setup.sh

DEVROOT=/home/chug/git/qpid-dispatch

# launch
${DEVROOT}/build/router/qdrouterd -c `pwd`/GRN.conf -I ${DEVROOT}/python &
pidA=$!

echo  to shut down routers execute: kill $pidA
