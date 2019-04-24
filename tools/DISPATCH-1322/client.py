#!/usr/bin/python
#
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
#

from __future__ import unicode_literals
from __future__ import division
from __future__ import absolute_import
from __future__ import print_function

from datetime import datetime

from proton import Message, Timeout
from proton.handlers import MessagingHandler
from proton.reactor import Container
from proton.utils import BlockingConnection

README = """
                    +------------+          +-------------+
                    |   INT.A    |          |     EA1     |
 +----------+   +-------+   +-------+  edge |       +-------+   +--------+
 | receiver |<--+ 21001 |   | 21000 |<--------*     | 21002 |<--+ sender |
 +----------+   +-------+   +-------+       |       +-------+   +--------+
                    |  interior  |          |    edge     |
                    +------------+          +-------------+
              ^                          ^                     ^
           CONN1                      CONN2                 CONN3

  Interior router INT.A
  Edge     router EA1
  sender connects to EA1
  receiver connects to INT.A

  sender sends N normal messages
  receiver accepts all normal messages
  sender waits until all normal messages are accepted
  receiver closes link but leaves connection open
  sender sends M extra messages

  Test success defined by
    * all normal messages are accepted
    * all extra messages are released

  The debug focus
    * Proton 0.27.x works as expected.
    * Proton master at commit 1d6e14f behaves unexpectedly:
      ** receiver gets on_settled events with RELEASED state
      ** sender times out waiting for all extra messages to be released

  Analysis method
    * run brokers
    * run client.py
    * save broker logs and client event files
    * Scraper splits and scrapes INT.A CONN1 detail for testX
    * Scraper splits and scrapes INT.A CONN2
    * Scraper splits and scrapes EA1   CONN2 possibly for cross check? Only INT.A should be necessary.
    * Scraper splits and scrapes EA1   CONN3 detail for testX
"""

class Logger(object):
    """
    Keep an in-memory list of timestamped messages.
    Print only on request successful tests are not encumbered
    with print detail.
    """
    PRINT_TO_CONSOLE = False
    def __init__(self):
        self.msgs = []

    def log(self, msg):
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S:%f")
        m = "%s %s" % (ts, msg)
        self.msgs.append(m)
        if Logger.PRINT_TO_CONSOLE:
            print(m)

    def __str__(self):
        return '\n'.join(self.msgs)


class RouterTest():
    def test_12_mobile_address_edge_to_interior(self):
        RECEIVER_URL = "0.0.0.0:21001"
        SENDER_URL   = "0.0.0.0:21002"
        N_TEST_LOOPS = 10
        tests = []

        for i in range(N_TEST_LOOPS):
            id = "test_12_%s" % i
            test = MobileAddressTest(RECEIVER_URL, SENDER_URL, id)
            test.run()
            tests.append(test)
            if test.error is not None:
                print("Test error: %s" % id)
                break
            elif test.warning:
                print("Test warning: %s" % id)
            else:
                print("Test ok: %s" % id)

        # gory trace details
        logged = False
        for i in range(len(tests)):
            test = tests[i]
            id = "test_12_%04d" % i
            with open(('client_log_%s.txt' % id), 'w') as client_log:
                if test.error is not None:
                    client_log.write("Error\n")
                elif test.warning:
                    client_log.write("Warning\n")
                client_log.write(str(test.logger))

        lasterror = None
        for test in tests:
            warn = test.warning
            errd = test.error is not None
            if errd:
                lasterror = test.error
            if warn or errd:
                print("%14s warning: %5s, error: %5s" % (test.address, warn, errd))
            else:
                print("%14s ok" % (test.address))


class MobileAddressTest(MessagingHandler):
    """
    Create a receiver over one connection and a sender over another.
    Send a batch of messages that should be accepted by the receiver.
    Close the receiver but not the receiver connection and then
      send an extra batch of messages that should be released or modified.
    Success is when message disposition counts add up correctly.
    """
    def __init__(self, receiver_host, sender_host, address):
        super(MobileAddressTest, self).__init__()
        self.receiver_host = receiver_host
        self.sender_host   = sender_host
        self.address       = address

        self.receiver_conn = None
        self.sender_conn   = None

        self.receiver      = None
        self.sender        = None

        self.logger        = Logger()

        self.normal_count  = 1
        self.extra_count   = 50
        self.n_rcvd        = 0
        self.n_sent        = 0
        self.n_accepted    = 0
        self.n_rel_or_mod  = 0
        self.error         = None
        self.warning       = False

    def fail_exit(self, title):
        self.error = title
        self.logger.log("MobileAddressTest result:ERROR: %s" % title)
        self.logger.log("address %s     " % self.address)
        self.logger.log("n_sent       = %d. Expected total:%d normal=%d, extra=%d" % \
            (self.n_sent, (self.normal_count + self.extra_count), self.normal_count, self.extra_count))
        self.logger.log("n_rcvd       = %d. Expected %d" % (self.n_rcvd,       self.normal_count))
        self.logger.log("n_accepted   = %d. Expected %d" % (self.n_accepted,   self.normal_count))
        self.logger.log("n_rel_or_mod = %d. Expected %d" % (self.n_rel_or_mod, self.extra_count))
        self.timer.cancel()
        self.receiver_conn.close()
        self.sender_conn.close()
        
    def on_timer_task(self, event):
        self.fail_exit("Timeout Expired")

    def on_start(self, event):
        self.logger.log("on_start address=%s" % self.address)
        self.timer         = event.reactor.schedule(5.0, self)
        self.receiver_conn = event.container.connect(self.receiver_host)
        self.sender_conn   = event.container.connect(self.sender_host)
        self.receiver      = event.container.create_receiver(self.receiver_conn, self.address)
        self.sender        = event.container.create_sender(self.sender_conn, self.address)

    def on_sendable(self, event):
        self.logger.log("on_sendable")
        if event.sender == self.sender:
            self.logger.log("on_sendable sender")
            while self.n_sent < self.normal_count:
                # send the normal messages
                message = Message(body="Message %d" % self.n_sent)
                self.sender.send(message)
                self.logger.log("on_sendable sender: send message %d: %s" % (self.n_sent, message))
                self.n_sent += 1
        elif event.receiver == self.receiver:
            self.logger.log("on_sendable receiver: WARNING unexpected callback for receiver")
            self.warning = True
        else:
            self.fail_exit("on_sendable not for sender nor for receiver")

    def on_message(self, event):
        self.logger.log("on_message")
        if event.receiver == self.receiver:
            self.n_rcvd += 1
            self.logger.log("on_message receiver: receiver message %d" % (self.n_rcvd))
        else:
            self.logger.log("on_message: WARNING callback not for test receiver.")

    def on_settled(self, event):
        # Expect all settlement events at sender as remote state
        self.logger.log("on_settled")
        rdisp = str(event.delivery.remote_state)
        ldisp = str(event.delivery.local_state)
        if event.sender == self.sender:
            if rdisp is None:
                self.logger.log("on_settled: WARNING: sender remote delivery state is None. Local state = %s." % ldisp)
            elif rdisp == "ACCEPTED":
                self.n_accepted += 1
                self.logger.log("on_settled sender: ACCEPTED %d (of %d)" % 
                                (self.n_accepted, self.normal_count))
            elif rdisp == "RELEASED" or rdisp == "MODIFIED":
                self.n_rel_or_mod += 1
                self.logger.log("on_settled sender: %s %d (of %d)" % 
                                (rdisp, self.n_rel_or_mod, self.extra_count))
            else:
                self.logger.log("on_settled sender: WARNING unexpected settlement: %s, n_accepted: %d, n_rel_or_mod: %d" %
                    (disp, self.n_accepted, self.n_rel_or_mod))
                self.warning = true
            
            if self.n_sent == self.normal_count and self.n_accepted == self.normal_count:
                # All normal messages are accounted. 
                # Close receiver and launch extra messages into the router network.
                self.logger.log("on_settled sender: normal messages all accounted. receiver.close() then send extra messages")
                self.receiver.close()
                for i in range(self.extra_count):
                    message = Message(body="Message %d" % self.n_sent)
                    self.sender.send(message)
                    # Messages must be blasted to get them into the network before news
                    # of the receiver closure is propagated back to EA1.
                    # self.logger.log("on_settled sender: send extra message %d: %s" % (self.n_sent, message))
                    self.n_sent += 1
            
            if self.n_accepted > self.normal_count:
                self.fail_exit("Too many messages were accepted")
            if self.n_rel_or_mod > self.extra_count:
                self.fail_exit("Too many messages were release or modified")
            
            if self.n_rel_or_mod == self.extra_count:
                # All extra messages are accounted. Exit with success.
                result = "SUCCESS" if not self.warning else "WARNING"
                self.logger.log("MobileAddressTest result:%s" % result)
                self.timer.cancel()
                self.receiver_conn.close()
                self.sender_conn.close()

        elif event.receiver == self.receiver:
            self.logger.log("on_settled receiver: WARNING unexpected on_settled. remote: %s, local: %s" % (rdisp, ldisp))
            self.warning = True

    def run(self):
        Container(self).run()

# main()
rt = RouterTest()
rt.test_12_mobile_address_edge_to_interior()
