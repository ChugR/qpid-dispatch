so it is - aaron smith test setup

System TAJ:

    green router
        5672 - normal listener
        20001 - inter-router listener

System RATCHET:

   blue router
        5672 - normal listener
        connector to green

   collectd router
        15672 - normal listener
        connector to green

Failing test (seems to be):

   Start receiver on TAJ:5672
   Start receiver on RATCHET:5672
   Start sender on COLLECTD:15672

   Receivers have credit of 1000
   Senders send 500-byte payloads. And plenty of 'em.





                              
