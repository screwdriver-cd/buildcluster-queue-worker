# Build Messages Processing Workflow

## Overview

This document describes the **queue-based retry mechanism** for build pod initialization with **progressive backoff** and **smart status distinction**. The system uses RabbitMQ's native message TTL and dead-letter exchange features with per-message TTL for variable delays
and simulate delayed queue behavior for message verification.

### Key Features

- **Status Code Distinction**: Separates pod scheduling issues (`waiting`) from image pull delays (`initializing`)
- **Progressive Backoff**: Increasing retry delays for large image downloads (30s → 80s)
- **Timeout Tracking**: Only pod scheduling delays count against the 3-minute SLO
- **Per-Message TTL**: Allows different retry delays for different scenarios
- **Two-Queue Pattern**: Wait queue (`sdRetryQueue-wait`) with TTL → Ready queue (`sdRetryQueue`)

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ QUEUE TOPOLOGY                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

    queue-service (Redis/Resque)
            │
            ▼
    ┌───────────────────────────────────────────────────────┐
    │ RabbitMQ Exchange: "build" (topic)                    │
    └───────────────────────────────────────────────────────┘
            │
            ├─────────────────┬──────────────────┬──────────────────┬──────────────────┐
            │                 │                  │                  │                  │
            ▼                 ▼                  ▼                  ▼                  ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ sd           │  │ sdRetry      │  │sdRetry-wait  │  │ sddlr        │  │ default      │
    │ (main queue) │  │ (ready queue)│  │ (wait queue) │  │ (delay/retry)│  │ (catch-all)  │
    └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
    │                 │                  │                  │
    │ start/stop      │ verify           │ per-msg TTL      │ delay 5s
    │ TTL: 8hr        │ NO queue TTL     │ 30s-80s          │ then → sd
    │ DLX → gq1dlr    │ (consumers)      │ DLX → sdretry   │
    └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
                                         │
                                         │ (after per-msg TTL expires)
                                         └────────► sdretry
```

## Main Queue Processing (sd)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ MAIN QUEUE: Start/Stop Job Processing                                       │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐
    │ Receive Message  │
    │ from sd          │
    │ (prefetch=20)    │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ Parse Message    │
    │ jobType: start   │
    │         stop     │
    │         clear    │
    └────────┬─────────┘
             │
             ├──────────────────────────────────────┐
             │                                      │
    ┌────────▼─────────┐                  ┌────────▼─────────┐
    │ jobType=start    │                  │ jobType=stop     │
    │                  │                  │ jobType=clear    │
    └────────┬─────────┘                  └────────┬─────────┘
             │                                      │
    ┌────────▼─────────┐                  ┌────────▼─────────┐
    │ Spawn Thread     │                  │ Spawn Thread     │
    │ Call _start()    │                  │ Execute job      │
    └────────┬─────────┘                  └────────┬─────────┘
             │                                     │
    ┌────────▼────────────────┐                    │
    │ Create K8s Pod          │                    │
    │ (POST to K8s API)       │                    │
    └────────┬────────────────┘                    │
             │                                     │
    ┌────────┼──────────────────┐                  │
    │        │                  │                  │
    ▼        ▼                  ▼                  │
┌─────────────┐  ┌──────────────────┐              │
│ Success     │  │ K8s API Error    │              │
│ (201)       │  │ Network timeout  │              │ 
└─────┬───────┘  └──────────┬───────┘              │
      │                     │                      │
      │                     ▼                      │
      │          ┌────────────────────┐            │
      │          │ .on('error')       │            │
      │          │ retryCount < 3?    │            │
      │          │ YES: NACK (retry)  │            │
      │          │ NO: FAILURE + ACK  │            │
      │          └────────────────────┘            │
      │                                            │
      ▼                                            │
┌──────────────────────────────┐                   │
│ Pod created successfully     │                   │
│ .on('message')               │                   │
└──────────┬───────────────────┘                   │
           │                                       │
           ▼                                       │
┌──────────────────────────────┐                   │
│ ACK message immediately      │◄──────────────────┘
│ (free up prefetch slot)      │
└──────────┬───────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│ Push to sdretry-wait for verification                      │
│ - Add header: x-build-start-time = Date.now()               │
│ - Add header: x-retry-count = 0                             │
│ - Set per-message TTL: 30 seconds (expiration property)     │
│ - Publishes to: sdretry-wait (not sdretry directly!)      │
└──────────┬──────────────────────────────────────────────────┘
           │
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│ WAIT QUEUE: sdretry-wait (waits for TTL to expire)         │
│ - Message sits here for TTL duration (30s default)          │
│ - When TTL expires → Dead-letter to sdretry                │
└─────────────────────────────────────────────────────────────┘
           │
           │ (after TTL expires)
           ▼
┌─────────────────────────────────────────────────────────────┐
│ RETRY QUEUE: sdretry (ready for consumption)               │
│ - Consumer picks up message for pod verification            │
└─────────────────────────────────────────────────────────────┘
```

## Retry Queue Processing (sdretry)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ RETRY QUEUE: Pod Verification & Status Check                                │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────┐
    │ Consumer picks up message        │
    │ from sdretry                    │
    │ Headers: x-build-start-time      │
    │          x-retry-count           │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌──────────────────────────────────┐
    │ Check retry count                │
    │ retryCount = x-retry-count || 0  │
    │ if retryCount >= 6: FAIL         │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌──────────────────────────────────┐
    │ Spawn Thread                     │
    │ Call _verify()                   │
    └──────────┬───────────────────────┘
               │
    ┌──────────▼──────────────┐
    │ Get Pod Status          │
    │ (GET pods?labelSelector)│
    └──────────┬──────────────┘
               │
    ┌──────────┼────────────────────────────────┐
    │          │                                │
    ▼          ▼                                ▼
┌─────────────────────┐  ┌──────────────────────────┐
│ Status: 'waiting'   │  │ Status: 'initializing'   │
│ (pod not scheduled) │  │ (pod pulling image)      │
└──────────┬──────────┘  └──────────┬───────────────┘
           │                        │
           ▼                        ▼
┌────────────────────────────────────────────────────┐
│ Check Init Timeout                                 │
│ ONLY for 'waiting'                                 │
│ elapsed = now - x-build-start-time                 │
│ if elapsed >= 3min: TIMEOUT                        │
└────────────┬───────────────────────────────────────┘
             │
    ┌────────┼─────────┐
    │        │         │
    ▼        ▼         ▼
┌─────────────┐  ┌──────────────┐
│ Timeout!    │  │ Within time  │
│ elapsed>=3m │  │ elapsed<3m   │
└─────┬───────┘  └──────┬───────┘
      │                 │
      ▼                 ▼
┌──────────────────┐  ┌────────────────────────────────┐
│ FAIL BUILD       │  │ Retry with appropriate delay   │
│ "Pod scheduling  │  │                                │
│ timeout exceeded"│  │ 'waiting': Fixed 30s delay     │
│ ACK + Stop       │  │ 'initializing': Progressive    │
└──────────────────┘  │   30s + (retryCount × 10s)     │
                      └─────────┬──────────────────────┘
                                │
                                ▼
                      ┌───────────────────────────────┐
                      │ ACK current message           │
                      │ Publish to sdretry-wait      │
                      │ with new TTL (expiration)     │
                      │ and x-retry-count += 1        │
                      └───────────┬───────────────────┘
                                  │
                                  ▼
                      ┌───────────────────────────────┐
                      │ Message waits in sdretry-wait│
                      │ for TTL duration              │
                      │ Then dead-letter → sdretry   │
                      └───────────────────────────────┘

Other status codes:
    '' (empty string)  → ACK (success, pod running)
    Error message      → ACK + Update build → FAILURE
```

## Pod Status Decision Tree

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ POD VERIFICATION LOGIC (_verify in executor-k8s/index.js)                   │
└─────────────────────────────────────────────────────────────────────────────┘

    Check Pod Status
         │
    ┌────┴──────────────────────────────────────────────────┐
    │                                                       │
    ▼                                                       ▼
Container Waiting Reason?                              Pod Phase?
    │                                                       │
    ├─ ErrImagePull ──────────┐                             │
    ├─ ImagePullBackOff ───────┼────► FAIL FAST             │
    ├─ InvalidImageName ────────┘     "Check your image"    │
    │                                                       │
    ├─ CrashLoopBackOff ───────┐                            │
    ├─ CreateContainerError ────┼────► FAIL FAST            │
    ├─ StartError ──────────────┘     "Contact admin"       │
    │                                                       │
    └─ (none/other) ────────────────────────────────────────┼──► Check phase
                                                            │
                                                            ├─ Running ──────► SUCCESS ('')
                                                            ├─ Succeeded ────► SUCCESS ('')
                                                            ├─ Failed ───────► FAILURE (error msg)
                                                            ├─ Unknown ──────► FAILURE (error msg)
                                                            │
                                                            └─ Pending ──┐
                                                                         │
                                                         ┌───────────────▼──────────────┐
                                                         │ Has nodeName assigned?       │
                                                         └───────────────┬──────────────┘
                                                                         │
                                                    ┌────────────────────┼────────────────────┐
                                                    │                    │                    │
                                                    ▼                    ▼                    ▼
                                            ┌───────────────┐  ┌─────────────────┐  ┌──────────────┐
                                            │ nodeName: NO  │  │ nodeName: YES   │  │ Other cases  │
                                            │ (not sched)   │  │ (initializing)  │  │              │
                                            └───────┬───────┘  └────────┬────────┘  └──────┬───────┘
                                                    │                   │                  │
                                                    ▼                   ▼                  ▼
                                            ┌───────────────┐  ┌─────────────────┐  ┌──────────────┐
                                            │ Return        │  │ Return          │  │ Fail or      │
                                            │ 'waiting'     │  │ 'initializing'  │  │ other status │
                                            │               │  │                 │  │              │
                                            │ (pod waiting  │  │ (pod pulling    │  └──────────────┘
                                            │  to schedule) │  │  image)         │
                                            └───────────────┘  └─────────────────┘

Status Code Meanings:
  - '' (empty string)    → Pod is running successfully
  - 'waiting'            → Pod not scheduled (counts against 3min timeout)
  - 'initializing'       → Pod pulling image (progressive backoff, no timeout)
  - Error message string → Immediate failure (ImagePullBackOff, CrashLoopBackOff, etc.)
```

## Queue Configuration

### RabbitMQ Queue Definitions

**sdQueue** (main queue for consumers):
```json
{
    "name": "sdQueue",
    "vhost": "screwdriver",
    "durable": true,
    "auto_delete": false,
    "arguments": {
      "x-dead-letter-exchange": "build",
      "x-dead-letter-routing-key": "sdQueuedlr",
      "x-max-priority": 3,
      "x-message-ttl": 28800000
    }
}
```
**sdQueue** (DLR queue for consumers, for messages that fail to be ACK'd):
```json
{
    "name": "sdQueuedlr",
    "vhost": "screwdriver",
    "durable": true,
    "auto_delete": false,
    "arguments": {
      "x-dead-letter-exchange": "build",
      "x-dead-letter-routing-key": "sdQueue",
      "x-max-priority": 3,
      "x-message-ttl": 5000,
      "x-queue-mode": "lazy"
    }
}
```

**sdRetryQueue** (ready queue for consumers):
```json
{
    "name": "sdRetryQueue",
    "vhost": "screwdriver",
    "durable": true,
    "auto_delete": false,
    "arguments": {
        "x-max-priority": 3,
        "x-queue-type": "classic"
    }
}
```

**IMPORTANT**: `sdRetryQueue` must NOT have `x-message-ttl` to allow per-message TTL!

**sdRetryQueue-wait** (wait queue with dead-letter routing):
```json
{
    "name": "sdretry-wait",
    "vhost": "screwdriver",
    "durable": true,
    "auto_delete": false,
    "arguments": {
        "x-dead-letter-exchange": "build",
        "x-dead-letter-routing-key": "sdretry",
        "x-max-priority": 3,
        "x-queue-type": "classic"
    }
}
```

# TODO: Use Delayed queue plugin https://github.com/rabbitmq/rabbitmq-delayed-message-exchange
