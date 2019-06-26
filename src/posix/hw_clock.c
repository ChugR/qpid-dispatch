/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

// access the monotonic system clock

#include <qpid/dispatch/hw_clock.h>
#include <qpid/dispatch/ctools.h>
#include <time.h>
#include <stdio.h>
#include <inttypes.h>


int64_t qd_hw_clock_nsec(void)
{
    struct timespec ts;
    int rc = clock_gettime(CLOCK_MONOTONIC, &ts);
    if (rc) {
        perror("clock_gettime failed");
        return 0;
    }

    return (QD_HW_CLOCK_SECOND * (int64_t)ts.tv_sec) + (ts.tv_nsec);
}

void qd_hw_clock_init(qd_hw_clock_stats_t* stats)
{
    stats->total_time = 0;
    stats->min_time   = 123456789;
    stats->max_time   = 0;
    stats->total_ct   = 0;
    stats->start_time = 0;
}

/**
 * Start a timing interval
 */
void qd_hw_clock_start(qd_hw_clock_stats_t* stats)
{
    if (stats->start_time != 0) {
        fprintf(stderr, "clock start reentered\n");
        fflush(stderr);
    }
    stats->start_time = qd_hw_clock_nsec();
}

/**
 * Stop and accumulate a timing interval
 */
void qd_hw_clock_stop(qd_hw_clock_stats_t* stats)
{
    int64_t interval = qd_hw_clock_nsec() - stats->start_time;
    if (interval == 0) {
        fprintf(stderr, "min time zero!!\n");
        fflush(stderr);
    }
    stats->total_time += interval;
    stats->total_ct   += 1;
    stats->min_time    = MIN(interval, stats->min_time);
    if (stats->min_time == 0) {
        fprintf(stderr, "Set min time to zero\n");
        fflush(stderr);
    }
    stats->max_time    = MAX(interval, stats->max_time);
    stats->start_time  = 0;
}

/**
 * Report accumulated statistics
 */
void qd_hw_clock_report(qd_hw_clock_stats_t* stats, char * bufptr, int bufsize)
{
    if (stats->total_ct == 0) {
        *bufptr = '\0';
    } else {
        size_t j = 0;
        j += snprintf(bufptr + j, bufsize - j, "%s", " (nS): avg: ");
        j += snprintf(bufptr + j, bufsize - j, "%11"PRId64, stats->total_time/stats->total_ct);

        j += snprintf(bufptr + j, bufsize - j, "%s", ", min: ");
        j += snprintf(bufptr + j, bufsize - j, "%11"PRId64, stats->min_time);

        j += snprintf(bufptr + j, bufsize - j, "%s", ", max: ");
        j += snprintf(bufptr + j, bufsize - j, "%11"PRId64, stats->max_time);

        j += snprintf(bufptr + j, bufsize - j, "%s", ", n_samples: ");
        j += snprintf(bufptr + j, bufsize - j, "%11"PRId64, stats->total_ct);
    }
}
