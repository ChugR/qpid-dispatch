#!/bin/bash

/home/chug/git/qpid-proton/build/cpp/examples/simple_send -a amqp://ratchet.localdomain:15672/collectd/telemetry -m 100000000
