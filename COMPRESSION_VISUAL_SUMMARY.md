# Compression Scenarios: Visual Summary

## 1. TRIGGER MECHANISMS

### Auto-Compression (Reactive)
```
API Response
    ↓
updateTokenCountAndCheckCompression()
    ↓
sessionTokenCount >= threshold?
    ├─ YES → needsCompression = true
    └─ NO  → continue normally

Next User Message
    ↓
sendMessageStream()
    ↓
needsCompression = true?
    ├─ YES → tryCompressChat(force=true)
    └─ NO  → Optional: tryCompressChat(force=false)
```

### /compress Command (Explicit)
```
User types: /compress
    ↓
compressCommand.action()
    ↓
Check Conditions:
├─ ui.pendingItem != null?
│  └─ YES → Show error, return
├─ isCompressionInProgress()?
│  └─ YES → Show error, return
└─ Continue
    ↓
Show pending spinner
    ↓
tryCompressChat(force=true)
    ↓
Show result or error
```

### Model Switch Compression (Adaptive)
```
User selects model: /model <name>
    ↓
switchModel(newModel)
    ↓
Check: isCompressing?
    ├─ YES → Return error
    └─ NO  → Continue

Set isCompressing = true
    ↓
compressToFit(currentModel → newModel)
    ├─ Get token count for history
    ├─ Get safe limit for target model
    ├─ Does history fit?
    │  ├─ YES → Skip compression, return skipReason
    │  └─ NO  → Continue
    ├─ Calculate dynamic compression ratio
    └─ compressHistory() with dynamic ratio
    ↓
Update config and model
    ↓
Release lock: isCompressing = false
```

---

## 2. COMPRESSION FLOW (SHARED)

```
┌─────────────────────────────────────┐
│ tryCompressChat() or compressToFit()│
└──────────────────┬──────────────────┘
                   ↓
        ┌──────────────────────┐
        │ Check shouldCompress │
        │ if not forced        │
        └──────────┬───────────┘
                   ↓
         Get current history
                   ↓
        ┌──────────────────────────────┐
        │ Get curated history (true)   │
        │ Remove internal/tool info    │
        └──────────┬───────────────────┘
                   ↓
        ┌──────────────────────────────┐
        │ Split History                │
        ├──────────────────────────────┤
        │ [env msg 1] [env msg 2]     │
        │ [history to compress]        │
        │ [history to keep - latest]  │
        └──────────┬───────────────────┘
                   ↓
        ┌──────────────────────────────┐
        │ Find compression boundary    │
        │ at tool call pair boundary   │
        └──────────┬───────────────────┘
                   ↓
        ┌──────────────────────────────┐
        │ Create temporary chat        │
        │ with compression model       │
        └──────────┬───────────────────┘
                   ↓
        ┌──────────────────────────────┐
        │ Set history for compression  │
        │ (exclude final user message) │
        └──────────┬───────────────────┘
                   ↓
        ┌──────────────────────────────┐
        │ Send compression request     │
        │ with system prompt           │
        └──────────┬───────────────────┘
                   ↓
        ┌──────────────────────────────┐
        │ Extract summary from response│
        │ (look in all response parts) │
        └──────────┬───────────────────┘
                   ↓
        ┌──────────────────────────────┐
        │ Build new history            │
        │ [env] [summary] [kept]       │
        └──────────┬───────────────────┘
                   ↓
        ┌──────────────────────────────┐
        │ Count tokens in new history  │
        │ using original model         │
        └──────────┬───────────────────┘
                   ↓
        ┌──────────────────────────────┐
        │ Return CompressionResult     │
        │ with info or error           │
        └──────────────────────────────┘
```

---

## 3. STATE MANAGEMENT

### Token Tracking State Machine

```
INITIAL STATE
│
└─→ [sessionTokenCount = 0, needsCompression = false]
    │
    ├─ User sends message
    │  └─→ Model responds with tokens
    │      └─→ updateTokenCountAndCheckCompression()
    │          ├─ sessionTokenCount += input + output
    │          ├─ Check: sessionTokenCount >= threshold?
    │          │  ├─ YES → [sessionTokenCount = X, needsCompression = true]
    │          │  └─ NO  → [sessionTokenCount = X, needsCompression = false]
    │          └─ Continue
    │
    ├─ User types /compress
    │  └─→ [isCompressing = true]
    │      └─→ tryCompressChat() called
    │          ├─ Compress successfully
    │          │  └─→ [sessionTokenCount unchanged, needsCompression unchanged]
    │          │      └─→ [isCompressing = false]
    │          └─ Compress fails
    │             └─→ [sessionTokenCount unchanged, needsCompression unchanged]
    │                 └─→ [isCompressing = false]
    │
    ├─ User types next message
    │  └─→ sendMessageStream() called
    │      ├─ Check: needsCompression = true?
    │      │  ├─ YES → [isCompressing = true]
    │      │  │         └─→ tryCompressChat(force=true)
    │      │  │             ├─ Success → [sessionTokenCount = 0, needsCompression = false, isCompressing = false]
    │      │  │             └─ Fail    → [sessionTokenCount = X, needsCompression = true, isCompressing = false]
    │      │  └─ NO  → [isCompressing = true]
    │      │           └─→ tryCompressChat(force=false)
    │      │               └─ If succeeds → [isCompressing = false, needsCompression = false]
    │      └─ Continue with new message
    │
    └─ User selects new model
       └─→ switchModel(newModel) called
           ├─ Check: isCompressing?
           │  └─ YES → Return error
           ├─ Set [isCompressing = true]
           ├─ Call compressToFit()
           │  ├─ Success → Update history, config
           │  │            → [isCompressing = false, needsCompression = false]
           │  └─ Fail    → [isCompressing = false, error returned]
           └─ Continue
```

### Compression Lock (isCompressing)

```
Lock State Machine:

UNLOCKED [isCompressing = false]
   ↓
   ├─→ Check Before Compress
   │   ├─ isCompressionInProgress() → false ✓
   │   ├─ Set isCompressing = true
   │   └─ LOCKED
   │
   └─→ Check Before /compress
       ├─ isCompressionInProgress() → false ✓
       ├─ Proceed
       └─ Lock acquired in tryCompressChat()

LOCKED [isCompressing = true]
   ├─→ Attempt During Auto-Compression
   │   └─ Can't acquire lock in sendMessageStream()
   │       └─ Wait for unlock
   │
   ├─→ Attempt /compress
   │   └─ isCompressionInProgress() → true ✗
   │       └─ Show error: "already in progress"
   │
   ├─→ Attempt Model Switch
   │   └─ switchModel() sees isCompressing = true ✗
   │       └─ Return error: "can't switch while compressing"
   │
   └─→ Compression Completes (finally block)
       └─ Set isCompressing = false
           └─ UNLOCKED
```

---

## 4. DECISION TREES

### Should We Compress? (Auto-Compression)

```
New message arrives
    ↓
    └─→ shouldCompress(history, model, contentGenerator, force=false)
        │
        ├─ history.length = 0?
        │  └─ YES → return false (nothing to compress)
        │
        ├─ force = true?
        │  └─ YES → return true (forced compression)
        │
        ├─ countTokens(history)
        │  ├─ Fails? → return false
        │  └─ Success → tokenCount = X
        │
        └─ Check threshold
           ├─ tokenCount >= (0.8 * tokenLimit)?
           │  └─ YES → return true (exceeds threshold)
           └─ NO  → return false (below threshold)
```

### Should We Fit? (Model Switch)

```
Model switch requested
    ↓
compressToFit(currentModel → targetModel)
    │
    ├─ tokenLimit(targetModel) = TL
    ├─ safeLimit = TL * 0.9
    │
    ├─ countTokens(history, currentModel) = TC
    │  └─ Fails? → return skipReason: "can't count"
    │
    └─ Check fit
       ├─ TC <= safeLimit?
       │  └─ YES → return skipReason (no compression needed)
       │           └─ Proceed with model switch
       │
       └─ TC > safeLimit?
          └─ YES → Calculate dynamic ratio
                   └─ requiredRatio = (safeLimit - overhead) / TC
                   └─ Perform compressHistory(ratio)
```

### What Preserve Ratio? (Preserve Strategy)

```
Determine preserve ratio:
    │
    ├─ Auto-Compression or /compress?
    │  └─ Use: 0.3 (keep latest 30%)
    │
    └─ Model Switch Compression?
       └─ Calculate: requiredRatio = (available space) / (current tokens)
          │
          └─ Clamp to range:
             ├─ MIN: 0.05 (keep at least 5%)
             ├─ MAX: 0.3  (don't keep more than 30% unless not needed)
             └─ Final ratio = requiredRatio
```

---

## 5. CONFLICT RESOLUTION MATRIX

```
            │ Auto-Comp | /compress | Model Switch │
────────────┼───────────┼───────────┼──────────────┤
Auto-Comp   │     X     │    WAIT   │     WAIT     │
            │  (can't   │  (/comp   │  (switch    │
            │ have 2)   │ backs off)│ backs off)   │
────────────┼───────────┼───────────┼──────────────┤
/compress   │   WAIT    │     X     │     WAIT     │
            │ (waits)   │  (can't   │  (/comp     │
            │           │  have 2)  │ backs off)   │
────────────┼───────────┼───────────┼──────────────┤
Model Swtch │   WAIT    │   WAIT    │      X       │
            │ (waits)   │  (/comp   │   (can't    │
            │           │ backs off)│   have 2)    │
────────────┴───────────┴───────────┴──────────────┘

Legend:
  X       = Cannot happen simultaneously (single operation)
  WAIT    = One waits for the other
  /comp   = /compress shows "already in progress" error
  switch  = switchModel returns error
```

---

## 6. HISTORY TRANSFORMATION

### Before Compression
```
Time ────────────────────────────────────→

[env]  [user 1] [model 1] [user 2] [model 2] ... [user 50] [model 50]
 ↓                                                           ↓
2% 0.5%   0.5%   0.5%     0.5%     0.5%           0.5%       2%
Preserved                 TO BE COMPRESSED                Preserved
```

### After Compression
```
[env]  [SUMMARY_USER_MSG]  [user 40] [model 40] ... [user 50] [model 50]
 ↓              ↓              ↓                                  ↓
2%         ~10%         ────  18% (recent kept) ────────────────────
Preserved  Generated    └─ Represents 50 messages as distilled summary
```

### Token Reduction Example
```
Before: 180,000 tokens
After:  60,000 tokens (33% reduction)

History size: 50 messages
Preserved: 15 recent messages + summary
Reduction: 35 messages compressed to 1 summary

Token efficiency: 35 → 1, ~1700 tokens/msg → 200 tokens/msg
```

---

## 7. ERROR RECOVERY PATHS

### Auto-Compression Failure
```
Token threshold exceeded (needsCompression = true)
    ↓
sendMessageStream() attempts tryCompressChat(force=true)
    ↓
    ├─ Network error
    │  └─ Return null
    │      └─ Log warning
    │      └─ needsCompression stays true
    │      └─ User can proceed (flag will retry next turn)
    │
    ├─ Insufficient history
    │  └─ Return error
    │      └─ Log warning
    │      └─ needsCompression stays true
    │      └─ User proceeds (retry on next turn)
    │
    └─ Success
       └─ Return compressionInfo
           └─ resetCompressionFlag()
           └─ Yield ChatCompressed event
```

### /compress Failure
```
/compress command executed
    ↓
    ├─ Already compressing
    │  └─ Show error: "already compressing"
    │  └─ User can retry
    │
    ├─ Network error during compression
    │  └─ Show error message
    │  └─ User can retry /compress
    │
    └─ Success
       └─ Show results with token savings
           └─ User sees feedback
```

### Model Switch Failure
```
Model switch requested
    ├─ Compression fails
    │  └─ Return error
    │  └─ Block model switch
    │  └─ User stays on current model
    │  └─ User can retry switch with /model
    │
    └─ Success
       └─ Model switched
           └─ History updated
           └─ User can proceed on new model
```

---

## 8. TIMING DIAGRAMS

### Scenario 1: Auto-Compression During Conversation
```
User:        "send message"
             ↓
Client:  sendMessageStream()
             ├─ Wait for any ongoing compression
             ├─ Check needsCompression flag
             ├─ YES: tryCompressChat(force=true) [2-5 sec]
             │   ├─ countTokens: 100-500ms
             │   ├─ API call: 2-5 sec
             │   ├─ Return compressionInfo
             │   └─ resetCompressionFlag()
             ├─ Send message to API
             └─ Stream response
                 ├─ Update sessionTokenCount
                 └─ Check if new threshold exceeded

Time: ~2-10 seconds before user gets response
```

### Scenario 2: User Explicit /compress
```
User:    "/compress"
         ↓
Client:  compressCommand.action()
         ├─ Check conditions (instant)
         ├─ Show "Compressing..." spinner
         ├─ tryCompressChat(force=true) [2-5 sec]
         │  ├─ countTokens: 100-500ms
         │  ├─ API call: 2-5 sec
         │  └─ Return compressionInfo
         └─ Show results
            "Compressed from 180k → 60k tokens"

Time: ~2-5 seconds, user sees progress
```

### Scenario 3: Model Switch
```
User:     "/model claude-3-haiku"
          ↓
Client:   switchModel("claude-3-haiku")
          ├─ Check if compressing → no
          ├─ Set isCompressing = true
          ├─ compressToFit() [2-5 sec if needed]
          │  ├─ countTokens: 100-500ms
          │  ├─ Determine if compression needed
          │  ├─ If needed: API call 2-5 sec
          │  └─ Return result
          ├─ Update config and model
          ├─ Set isCompressing = false
          └─ Return success

UI:       Show "Context compressed: X → Y" (if needed)
          or "Context sufficient" (if skipped)

Time: ~2-5 seconds for compressed, instant for sufficient
```

---

## 9. KEY SAFE INVARIANTS

### Invariant 1: History Atomicity
```
✓ History is ONLY updated on successful compression
✓ Failed compression leaves history UNCHANGED
✓ No partial updates possible
✓ Either old or new, never corrupted
```

### Invariant 2: Mutual Exclusion
```
✓ Only ONE compression operation at a time
✓ Others wait or fail gracefully
✓ Lock always released (finally blocks)
✓ Deadlock impossible (linear wait)
```

### Invariant 3: Token Accuracy
```
✓ Tokens always counted with original model
✓ Thresholds use consistent model limits
✓ Compression comparison is apples-to-apples
✓ No cross-model token confusion
```

### Invariant 4: Error Recovery
```
✓ Failed compression doesn't block user
✓ Auto-compression retries automatically
✓ User can manually /compress after failure
✓ No state corruption on errors
```

---

## 10. QUICK REFERENCE

### When Does Compression Happen?

| Trigger | Condition | Force? | UI Feedback |
|---------|-----------|--------|-------------|
| **Auto** | sessionTokenCount ≥ 160k (0.8×limit) | Yes | Event stream |
| **Auto** | Optional attempt | No | Silent |
| **/compress** | User command | Yes | Spinner + result |
| **Switch** | New model needs more space | Yes | Skip reason or info |

### What Gets Preserved?

| Component | Always? | Amount | Reason |
|-----------|---------|--------|--------|
| Environment | Yes | First 2 msgs | System state |
| Compressed Summary | Yes | ~1 msg | Context distillation |
| Recent History | Yes | Latest 30%+ | Recency bias |
| Full History | No | N/A | Compression goal |

### What Can Fail?

| Operation | Can Fail? | Consequence |
|-----------|-----------|-------------|
| Token counting | Yes | Return error/skip |
| Compression API | Yes | Return null/error |
| History update | No | Only on success |
| Lock release | No | Finally block |

### How to Recover?

| Scenario | Recovery |
|----------|----------|
| Auto-compression fails | Automatic retry next message |
| /compress fails | Manual retry of /compress |
| Model switch fails | Stays on current model, can retry |
| All scenarios | History never corrupted |
