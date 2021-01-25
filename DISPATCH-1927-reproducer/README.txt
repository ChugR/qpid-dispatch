Reproduce DISPATCH-1927

In separate windows run:

1. qdrouterd -c A.conf   # this is the router that crashes
2. qdrouterd -c B.conf

3. ./run-echo-server.sh  # podman or docker to run a server

4..N  ./run-open-close.sh  # processes that open/close socket
