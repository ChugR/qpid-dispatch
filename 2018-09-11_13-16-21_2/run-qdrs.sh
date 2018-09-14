#!/bin/bash

# Environment for python/proton/n/stuff
source ~/bin/dispatch-setup.sh

DEVROOT=/home/chug/git/qpid-dispatch

# launch
${DEVROOT}/build/router/qdrouterd -c `pwd`/GRN.conf -I ${DEVROOT}/python &
pidA=$!
${DEVROOT}/build/router/qdrouterd -c `pwd`/BLU.conf -I ${DEVROOT}/python &
pidB=$!

echo  to shut down routers execute: kill $pidA $pidB
echo To get perf data for router:
echo . A: perf record --pid=$pidA -g --output=A_perf.data
echo . B: perf record --pid=$pidB -g --output=B_perf.data
echo To analyze a perf data file:
echo . A: perf report -g --call-graph --stdio -i A_perf.data --header '>' A-perf-graph.txt
echo . B: perf report -g --call-graph --stdio -i B_perf.data --header '>' B-perf-graph.txt
echo To gdb the router:
echo .  gdb ${DEVROOT}/build/router/qdrouterd pid
