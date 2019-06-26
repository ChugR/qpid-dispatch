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

#include <stdint.h>


// nanoseconds per second
#define QD_HW_CLOCK_SECOND 1000000000


/**
 * Return the current value of the system hardware clock in nanoseconds.
 *
 * Note: This clock's starting value is RANDOM and has no relationship to time of day.
 * Its intended use is for precise interval timing.
 * It cannot be compared across systems.
 */
int64_t qd_hw_clock_nsec(void);

/**
 * Set of statistics
 *
 * For N samples keep track of min, max, and average values.
 *
 * A stats object is 'started' and 'stopped' to produce a timer interval value.
 * When the timer is stopped the interval value is accumulated.
 * Accumulated values may be reported as a string.
 */
typedef struct qd_hw_clock_stats_s {
int64_t total_time;
int64_t min_time;
int64_t max_time;
int64_t total_ct;

int64_t start_time;
} qd_hw_clock_stats_t;

#define QD_HW_CLOCK_STATS_ZERO {0,987654321,0,0,0}

/**
 * Initialize a new clock stats object
 */
void qd_hw_clock_init(qd_hw_clock_stats_t* stats);

/**
 * Start a timing interval
 */
void qd_hw_clock_start(qd_hw_clock_stats_t* stats);

/**
 * Stop and accumulate a timing interval
 */
void qd_hw_clock_stop(qd_hw_clock_stats_t* stats);

/**
 * Report accumulated statistics
 */
void qd_hw_clock_report(qd_hw_clock_stats_t* stats, char * bufptr, int bufsize);
