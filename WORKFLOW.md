# Build Start Workflow - Detailed Flow

## Main Queue Processing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ MAIN QUEUE: Message Processing                                              │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────┐
    │ Receive Message  │
    │ (prefetch=20)    │
    └────────┬─────────┘
             │
             ├─────────────────────────────────────────────────────────┐
             │                                                         │
    ┌────────▼─────────┐                                    ┌─────────▼─────────┐
    │ Start Timeout    │                                    │ Spawn Thread      │
    │ (5 min timer)    │                                    │ Call _start()     │
    └──────────────────┘                                    └─────────┬─────────┘
             │                                                         │
             │                                              ┌──────────▼──────────┐
             │                                              │ Try Create K8s Pod  │
             │                                              │ (POST to K8s API)   │
             │                                              └──────────┬──────────┘
             │                                                         │
             │                                    ┌────────────────────┼───────────────┐
             │                                    │                    │               │
             │                         ┌──────────▼─────────┐  ┌──────▼─────────────────────┐
             │                         │ Success (201)      │  │ API Error (500/503/etc)    │
             │                         │ Pod Created!       │  │ Network error, K8s down    │
             │                         └──────────┬─────────┘  └──────┬─────────────────────┘
             │                                    │                    │
             │                         ┌──────────▼──────────────┐  ┌─▼──────────────────────┐
             │                         │ Check Pod Status        │  │ THROW EXCEPTION        │
             │                         │ (GET pod/status)        │  │ "Failed to create pod" │
             │                         └──────────┬──────────────┘  └─┬──────────────────────┘
             │                                    │                    │
             │                      ┌─────────────┼─────────────┐      │ .on('error')
             │                      │             │             │      │
             │           ┌──────────▼─────┐  ┌───▼───┐  ┌─────▼──────┐▼──────────────────┐
             │           │ Pod Status:    │  │ Pod:  │  │ Pod Status:││ Retry < 5?       │
             │           │ pending/running│  │failed │  │ unknown    ││ YES: NACK (retry)│
             │           └──────────┬─────┘  └───┬───┘  └─────┬──────┘│ NO: FAILURE+ACK  │
             │                      │            │             │       └──────────────────┘
             │           ┌──────────▼─────┐  ┌───▼─────────────▼───┐
             │           │ Return TRUE    │  │ Return FALSE         │
             │           │ "Pod OK"       │  │ "Status check failed"│
             │           └──────────┬─────┘  └───┬──────────────────┘
             │                      │            │
             │           ┌──────────▼─────┐  ┌───▼──────────────┐
             │           │ ACK message    │  │ Clear timeout    │
             │           │ (free prefetch)│  │ ACK message      │
             │           └──────────┬─────┘  │ Push to RETRY    │
             │                      │        │ QUEUE (verify)   │
             │           ┌──────────▼─────┐  └───┬──────────────┘
             │           │ DON'T clear    │      │
             │           │ timeout!       │      │
             │           │ (keep monitor) │      │
             │           └──────────┬─────┘      │
             │                      │            │
             │◄─────────────────────┘            │
             │                                   │
    ┌────────▼─────────┐                        │
    │ Wait 5 minutes   │                        │
    └────────┬─────────┘                        │
             │                                   │
    ┌────────▼───────────────────────┐          │
    │ Timeout Fires!                 │          │
    │ Update build statusmessage:    │          │
    │ "Build initialization delayed" │          │
    └────────┬───────────────────────┘          │
             │                                   │
    ┌────────▼─────────┐                        │
    │ Push to          │◄───────────────────────┘
    │ RETRY QUEUE      │
    └────────┬─────────┘
             │
             │
┌────────────▼─────────────────────────────────────────────────────────────────┐
│ RETRY QUEUE: Pod Verification                                                │
└──────────────────────────────────────────────────────────────────────────────┘

    ┌────────────────────┐
    │ Receive Message    │
    │ from Retry Queue   │
    └─────────┬──────────┘
              │
    ┌─────────▼──────────┐
    │ Spawn Thread       │
    │ Call _verify()     │
    └─────────┬──────────┘
              │
    ┌─────────▼────────────────┐
    │ Try Get Pod Status       │
    │ (GET pods?labelSelector) │
    └─────────┬────────────────┘
              │
    ┌─────────┼────────────────────────────┐
    │         │                            │
┌───▼─────────────┐              ┌─────────▼────────────────┐
│ Success         │              │ API Error (K8s API down) │
│ Got pod status  │              │ Network issue            │
└───┬─────────────┘              └─────────┬────────────────┘
    │                                      │
    │                            ┌─────────▼────────────────┐
    │                            │ THROW EXCEPTION          │
    │                            │ .on('error')             │
    │                            └─────────┬────────────────┘
    │                                      │
    │                            ┌─────────▼────────────────┐
    │                            │ Retry < 5?               │
    │                            │ YES: NACK (retry verify) │
    │                            │ NO: FAILURE + ACK        │
    │                            └──────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Check Pod Status & Container Waiting Reason                     │
└─────────┬────────────────────────────────────────────────────────┘
          │
    ┌─────┴──────────┬────────────────┬───────────────┬─────────────────┐
    │                │                │               │                 │
┌───▼────────────┐  ┌▼──────────┐  ┌─▼────────────┐ ┌▼───────────────┐ ┌▼──────────────┐
│ Pod Status:    │  │ Pod:      │  │ Pod:         │ │ Pod:           │ │ Pod:          │
│ running/       │  │ failed/   │  │ pending +    │ │ pending +      │ │ pending +     │
│ succeeded      │  │ unknown   │  │ ErrImagePull │ │ CrashLoopBack  │ │ PodInitializing│
└───┬────────────┘  └┬──────────┘  └─┬────────────┘ └┬───────────────┘ └┬──────────────┘
    │                │                │               │                  │
┌───▼────────────┐  ┌▼────────────────────────────────▼──────────────────▼──────────────┐
│ Return EMPTY   │  │ Return ERROR MESSAGE                                               │
│ (success)      │  │ "Build failed to start..."                                         │
└───┬────────────┘  └┬───────────────────────────────────────────────────────────────────┘
    │                │                                   │
┌───▼────────────┐  ┌▼────────────────┐      ┌─────────▼──────────┐
│ ACK message    │  │ Update build to │      │ Return EMPTY       │
│ (build OK)     │  │ FAILURE         │      │ (allow more time   │
└────────────────┘  │ ACK message     │      │ for image pull)    │
                    └─────────────────┘      └─────────┬──────────┘
                                                       │
                                             ┌─────────▼──────────┐
                                             │ ACK message        │
                                             │ (pod still healthy │
                                             │ may take 10+ min)  │
                                             └────────────────────┘
```

## Key Points

### Main Queue Retries (NACK):
- **When**: Pod creation throws exception (K8s API error, network issue)
- **Why**: Pod was never created, safe to retry
- **How many**: Up to 5 times via RabbitMQ requeue
- **After max retries**: Update build to FAILURE and ACK

### Retry Queue Retries (NACK):
- **When**: _verify() throws exception (can't get pod status from K8s)
- **Why**: Transient API issue, pod might be fine
- **How many**: Up to 5 times via RabbitMQ requeue
- **After max retries**: Update build to FAILURE and ACK

### No Retries (ACK immediately):
- Pod created successfully (pending/running status) → main queue
- Pod status check failed (pod exists but failed/unknown) → main queue → retry queue
- Verify detects failed pod (returns error message) → retry queue
- Verify detects healthy pod (returns empty) → retry queue
