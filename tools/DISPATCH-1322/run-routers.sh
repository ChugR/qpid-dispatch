#!/bin/bash

echo running INT.A
qdrouterd -c INT.A.conf -I /home/chug/git/qpid-dispatch/python &

echo running EA1
qdrouterd -c EA1.conf -I /home/chug/git/qpid-dispatch/python &
