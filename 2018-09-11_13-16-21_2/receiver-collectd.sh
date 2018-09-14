#!/bin/bash

/home/chug/git/qpid-proton/build/cpp/examples/simple_recv -a amqp://127.0.0.1:5672/collectd/telemetry -m 100000000
