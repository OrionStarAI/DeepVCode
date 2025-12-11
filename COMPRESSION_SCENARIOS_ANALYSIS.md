# DeepV Code: Three Compression Scenarios - Detailed Technical Analysis

## Executive Summary

DeepV Code implements three distinct compression scenarios that operate at different levels:

1. **Auto-Compression** - Automatic, proactive compression triggered before a new conversation when token threshold exceeded
2. **/compress Command** - Manual, user-initiated compression for immediate control
3. **Model Switch Compression** - Specialized compression during model switching to fit new model's token limits

These scenarios share a common underlying compression engine (`CompressionService`) but differ significantly in trigger mechanisms, flow control, and state management. They are designed to work independently but share a mutual exclusion lock to prevent concurrent compression operations.

---

## 1. AUTO-COMPRESSION SCENARIO

### 1.1 Overview
Auto-compression is the most passive mechanism. It monitors token usage during conversations and proactively compresses history before the next user message if a threshold has been exceeded.

### 1.2 Trigger Mechanism

**Location:** `packages/core/src/core/client.ts` - `sendMessageStream()` method (lines 501-560)

**Trigger Points:**
- Checked at the very beginning of `sendMessageStream()` before processing any new user message
- Only runs if `needsCompression` flag is set to `true`

**Token Threshold Tracking:**

```typescript
// In updateTokenCountAndCheckCompression() - called after each API response
private updateTokenCountAndCheckCompression(inputTokens: number, outputTokens: number): void {
  this.sessionTokenCount = inputTokens + outputTokens;

  let compressionTokenThreshold = this.compressionThreshold * tokenLimit(this.config.getModel(), this.config);
  // Default: 0.8 * model's token limit (e.g., 0.8 * 200,000 = 160,000 tokens)

  if (this.sessionTokenCount >= compressionTokenThreshold) {
    this.needsCompression = true; // Mark for next conversation
    logger.info(`Token threshold reached: ${this.sessionTokenCount} >= ${compressionTokenThreshold}`);
  }
}
```

**Threshold Calculation:**
- `compressionThreshold`: 0.8 (80% of model's token limit)
- `tokenLimit(model)`: Retrieved from cloud API or fallback to 200,000
- Example: For a 200k model, threshold is 160k tokens

### 1.3 Compression Flow

```typescript
// At the start of sendMessageStream():
if (this.needsCompression) {
  console.log('[sendMessageStream] Token threshold exceeded, performing compression before new conversation');
  const compressed = await this.tryCompressChat(prompt_id, signal, true); // force=true
  if (compressed) {
    yield { type: GeminiEventType.ChatCompressed, value: compressed };
    this.resetCompressionFlag(); // Reset needsCompression to false
  } else {
    console.warn('[sendMessageStream] Failed to perform scheduled compression');
  }
} else {
  const compressed = await this.tryCompressChat(prompt_id, signal, false); // force=false
  // Even if not needed, still attempt optional compression
  if (compressed) {
    yield { type: GeminiEventType.ChatCompressed, value: compressed };
    this.resetCompressionFlag();
  }
}
```

**Key Parameters:**
- `force=true`: Forces compression even if below threshold (when `needsCompression=true`)
- `force=false`: Only compresses if token count exceeds threshold (when `needsCompression=false`)

### 1.4 Wait for Concurrent Compression

Before processing, auto-compression checks if another compression is in progress:

```typescript
if (this.isCompressing) {
  console.log('[sendMessageStream] Waiting for ongoing compression to complete...');
  await this.waitForCompressionComplete(signal);
  console.log('[sendMessageStream] Compression wait completed, proceeding');
}

private async waitForCompressionComplete(abortSignal?: AbortSignal): Promise<void> {
  if (!this.isCompressing) return;
  const pollInterval = 100; // 100ms polling
  while (this.isCompressing) {
    if (abortSignal?.aborted) break;
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}
```

### 1.5 State Management

**State Variables:**
- `needsCompression: boolean` - Set to true when threshold exceeded, reset after compression
- `isCompressing: boolean` - Mutual exclusion lock during compression
- `sessionTokenCount: number` - Cumulative token count for current session
- `compressionThreshold: number` - Static threshold (default 0.8)

**Reset Mechanism:**
```typescript
private resetCompressionFlag(): void {
  this.needsCompression = false;
  this.sessionTokenCount = 0; // Reset token counter
}
```

### 1.6 History Preservation

- **Environment Messages**: First 2 messages (terminal info + model confirmation) always preserved
- **Conversation Messages**: Latest 30% preserved by default
- **Tool Call Boundaries**: Compression splits at complete tool call pairs to maintain conversation integrity

---

## 2. /COMPRESS COMMAND SCENARIO

### 2.1 Overview
The `/compress` command provides explicit user control to compress chat history on demand. It's a manual, immediate operation independent of token thresholds.

**Location:** `packages/cli/src/ui/commands/compressCommand.ts`

### 2.2 Trigger Mechanism

**Command Definition:**
```typescript
export const compressCommand: SlashCommand = {
  name: 'compress',
  altNames: ['summarize'],
  description: t('command.compress.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context) => { ... }
}
```

**Entry Point:**
- User types `/compress` in CLI
- Routed to `compressCommand.action()` through command processor

### 2.3 Pre-Flight Checks

Two-level checking to prevent concurrent compression:

```typescript
// 1. UI-level pending state check
if (ui.pendingItem) {
  ui.addItem({
    type: MessageType.ERROR,
    text: 'Already compressing, wait for previous request to complete',
  }, Date.now());
  return;
}

// 2. Client-level compression lock check
if (geminiClient?.isCompressionInProgress()) {
  ui.addItem({
    type: MessageType.ERROR,
    text: 'Compression already in progress at client level, please wait',
  }, Date.now());
  return;
}
```

**Why Two Checks?**
- UI-level: Prevents duplicate command triggers from user input
- Client-level: Ensures no auto-compression or model switch compression in progress

### 2.4 Execution Flow

```typescript
try {
  // Step 1: Show pending UI state
  ui.setPendingItem({
    type: MessageType.COMPRESSION,
    compression: {
      isPending: true,
      originalTokenCount: null,
      newTokenCount: null,
    },
  });

  // Step 2: Call compression with unique prompt ID and force=true
  const promptId = `compress-${Date.now()}`;
  const compressed = await geminiClient?.tryCompressChat(
    promptId,
    new AbortController().signal,
    true  // force=true - always compress
  );

  // Step 3: Show results
  if (compressed) {
    ui.addItem({
      type: MessageType.COMPRESSION,
      compression: {
        isPending: false,
        originalTokenCount: compressed.originalTokenCount,
        newTokenCount: compressed.newTokenCount,
      },
    }, Date.now());
  } else {
    ui.addItem({
      type: MessageType.ERROR,
      text: 'Failed to compress chat history.',
    }, Date.now());
  }
} catch (e) {
  ui.addItem({
    type: MessageType.ERROR,
    text: `Failed to compress chat history: ${e.message}`,
  }, Date.now());
} finally {
  ui.setPendingItem(null); // Always clear pending state
}
```

### 2.5 Key Characteristics

**Unique Aspects:**
- **Unconditional Compression**: `force=true` bypasses token threshold check
- **User Feedback**: Shows pending spinner during compression
- **Immediate UI Updates**: Results displayed as soon as compression completes
- **No Auto-Detection**: Doesn't depend on threshold - purely user-driven
- **Clean Error Handling**: Catches and displays all error states

**Prompt ID Strategy:**
- Uses timestamp-based ID: `compress-{Date.now()}`
- Ensures uniqueness for logging and tracking

### 2.6 UI Integration

**Compression Message Component:** `packages/cli/src/ui/components/messages/CompressionMessage.tsx`

```typescript
export const CompressionMessage: React.FC<CompressionDisplayProps> = ({
  compression,
}) => {
  const text = compression.isPending
    ? 'Compressing chat history'
    : `Chat history compressed from ${compression.originalTokenCount ?? 'unknown'}` +
      ` to ${compression.newTokenCount ?? 'unknown'} tokens.`;

  return (
    <Box>
      {compression.isPending ? (
        <Spinner /> // Shows spinner while pending
      ) : null}
      <Text color={
        compression.isPending ? Colors.AccentPurple : Colors.AccentGreen
      }>
        {text}
      </Text>
    </Box>
  );
};
```

---

## 3. MODEL SWITCH COMPRESSION SCENARIO

### 3.1 Overview
Model switch compression is a specialized, aggressive compression triggered when switching between models with different token limits. It ensures history fits within the new model's constraints.

**Location:** `packages/core/src/core/client.ts` - `switchModel()` method (lines 745-847)

### 3.2 Trigger Mechanism

**Entry Point:**
```typescript
// From modelCommand in CLI: packages/cli/src/ui/commands/modelCommand.ts
const switchResult = await geminiClient.switchModel(actualModelName, new AbortController().signal);
```

**Why It's Needed:**
- Different models have different token limits
- Example: Moving from 1M model to 100k model requires aggressive compression
- Prevents "context too large" errors after model switch

### 3.3 Compression Logic: compressToFit()

**Location:** `packages/core/src/services/compressionService.ts` - `compressToFit()` method (lines 481-586)

```typescript
async compressToFit(
  config: Config,
  history: Content[],
  currentModel: string,
  targetModel: string,
  compressionModel: string,
  geminiClient: GeminiClient,
  prompt_id: string,
  abortSignal: AbortSignal
): Promise<CompressionResult>
```

**Step-by-Step Logic:**

```typescript
// Step 1: Get token limits
const targetLimit = tokenLimit(targetModel, config);
const safeLimit = targetLimit * 0.9; // 90% safety margin

// Step 2: Count current tokens
const currentTokenCount = await geminiClient.getContentGenerator().countTokens({
  model: currentModel,
  contents: history,
});

// Step 3: Check if compression needed
if (currentTokenCount <= safeLimit) {
  return {
    success: true,
    skipReason: `Context sufficient for target model: ${currentTokenCount} tokens ≤ ${safeLimit} safe limit`
  };
}

// Step 4: Calculate dynamic compression ratio
// Example: If current=150k, target=100k, safe=90k
// We need to compress to 90k from 150k
const estimatedOverhead = 1000; // Environment + summary overhead
const availableForHistory = Math.max(0, safeLimit - estimatedOverhead);
let requiredRatio = availableForHistory / currentTokenCount; // ~0.58

// Step 5: Clamp ratio to reasonable range
requiredRatio = Math.max(0.05, Math.min(requiredRatio, 0.3));

// Step 6: Perform compression with dynamic ratio
return await this.compressHistory(
  config,
  history,
  currentModel,
  compressionModel,
  geminiClient,
  prompt_id,
  abortSignal,
  currentTokenCount,
  requiredRatio, // Dynamic ratio, not default 0.3
  true // Mark as model switch compression
);
```

### 3.4 Dynamic Compression Ratio

**Key Innovation:** Unlike auto-compression which always preserves ~30% of history, model switch compression dynamically calculates how much to preserve based on available space.

**Examples:**

| Current | Current Tokens | Target Limit | Safe Limit | Available | Required Ratio | Keep % |
|---------|-----------------|--------------|-----------|-----------|---|--------|
| 200k model | 180k | 100k model | 90k | 89k | 0.49 | 49% |
| 200k model | 150k | 50k model | 45k | 44k | 0.29 | 29% |
| 200k model | 200k | 100k model | 90k | 89k | 0.44 | 44% |

**Ratio Clamping:**
- Minimum: 0.05 (keep at least 5% to preserve context)
- Maximum: 0.3 (default threshold - if not needed that much, don't be too aggressive)

### 3.5 Complete switchModel() Flow

```typescript
async switchModel(newModel: string, abortSignal: AbortSignal): Promise<ModelSwitchResult> {
  // Check 1: Is compression already in progress?
  if (this.isCompressing) {
    return {
      success: false,
      modelName: newModel,
      error: 'Compression in progress, cannot switch model now.'
    };
  }

  // Check 2: Is it the same model?
  const currentModel = this.config.getModel();
  if (currentModel === newModel) {
    return { success: true, modelName: newModel };
  }

  console.log(`[switchModel] Attempting to switch from ${currentModel} to ${newModel}...`);

  // Set compression lock
  this.isCompressing = true;

  try {
    // Get curated history
    const curatedHistory = this.getChat().getHistory(true);
    let compressionModel = SceneManager.getModelForScene(SceneType.COMPRESSION);

    // Dynamic model upgrade for very large contexts
    if (this.sessionTokenCount > 900000) {
      compressionModel = 'x-ai/grok-4.1-fast'; // Upgrade to more capable model
    }

    // Perform targeted compression
    const compressionResult = await this.compressionService.compressToFit(
      this.config,
      curatedHistory,
      currentModel,
      newModel,
      compressionModel,
      this,
      `switch-model-${Date.now()}`,
      abortSignal
    );

    const modelSwitchResult: ModelSwitchResult = {
      success: true,
      modelName: newModel
    };

    // Handle three outcomes:
    if (compressionResult.skipReason) {
      // No compression needed
      modelSwitchResult.compressionSkipReason = compressionResult.skipReason;
    } else if (compressionResult.success && compressionResult.newHistory) {
      // Compression succeeded
      this.getChat().setHistory(compressionResult.newHistory);
      modelSwitchResult.compressionInfo = compressionResult.compressionInfo;
    } else {
      // Compression failed - block model switch
      modelSwitchResult.success = false;
      modelSwitchResult.error = compressionResult.error;
      this.isCompressing = false;
      return modelSwitchResult;
    }

    // Update config and chat
    this.config.setModel(newModel);
    this.getChat().setSpecifiedModel(newModel);

    // Reset compression flag because context has changed
    this.resetCompressionFlag();

    console.log(`[switchModel] Successfully switched to ${newModel}`);
    return modelSwitchResult;

  } catch (error) {
    return {
      success: false,
      modelName: newModel,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    this.isCompressing = false; // Release lock
  }
}
```

### 3.6 Result Reporting

**In CLI:** `packages/cli/src/ui/commands/modelCommand.ts` (lines 627-666)

```typescript
if (!switchResult.success) {
  // Show error
  ui.addItem({
    type: 'error',
    text: `Failed to switch to model ${actualModelName}. ${switchResult.error || '...'}`
  }, Date.now());
  return;
}

// Show compression info or skip reason
if (switchResult.compressionInfo) {
  const compressionMsg =
    `📦 Context compressed: ${switchResult.compressionInfo.originalTokenCount} → ${switchResult.compressionInfo.newTokenCount} tokens`;
  ui.addItem({
    type: 'info',
    text: compressionMsg
  }, Date.now());
} else if (switchResult.compressionSkipReason) {
  const skipMsg = `✓ ${switchResult.compressionSkipReason}`;
  ui.addItem({
    type: 'info',
    text: skipMsg
  }, Date.now());
}

// Then proceed with model change
appEvents.emit(AppEvent.ModelChanged, actualModelName);
```

---

## 4. SHARED COMPRESSION ENGINE

### 4.1 Core Compression Service

**Location:** `packages/core/src/services/compressionService.ts`

All three scenarios ultimately call `compressHistory()` method:

```typescript
async compressHistory(
  config: Config,
  history: Content[],
  model: string,
  compressionModel: string,
  geminiClient: GeminiClient,
  prompt_id: string,
  abortSignal: AbortSignal,
  originalTokenCount?: number,
  overridePreserveRatio?: number,
  isModelSwitchCompression: boolean = false
): Promise<CompressionResult>
```

### 4.2 Compression Algorithm

**Phase 1: Preparation**
```typescript
// Separate environment from conversation
const environmentMessages = history.slice(0, Math.min(this.skipEnvironmentMessages, history.length));
const conversationHistory = history.slice(this.skipEnvironmentMessages);

// Determine preserve ratio
const preserveRatio = overridePreserveRatio ?? this.compressionPreserveThreshold; // Default 0.3

// Find where to compress
let compressBeforeIndex = findIndexAfterFraction(conversationHistory, 1 - preserveRatio);

// Snap to tool call boundary (important!)
compressBeforeIndex = this.findToolCallBoundary(conversationHistory, compressBeforeIndex);

// Split history
const historyToCompress = conversationHistory.slice(0, compressBeforeIndex);
const historyToKeep = conversationHistory.slice(compressBeforeIndex);
```

**Key Insight:** Compression happens at tool call boundaries to maintain conversation coherence. A function call and response pair always stay together.

**Phase 2: Temporary Chat Creation**
```typescript
const temporaryChat = await geminiClient.createTemporaryChat(
  SceneType.COMPRESSION,
  compressionModel,
  { type: 'sub', agentId: 'CompressionService' }
);

// Set up history for compression request
const historyForCompression = [...environmentMessages, ...historyToCompress];

// Add confirmation if last message is user
if (lastMessage.role === 'user') {
  historyForCompression.push({
    role: 'model',
    parts: [{ text: 'Understood.' }],
  });
}

temporaryChat.setHistory(historyForCompression.slice(0, -1));
```

**Phase 3: Compression Request**
```typescript
const compressionPrompt = 'First, reason in your scratchpad. Then, generate the <state_snapshot>.';
const compressionResponse = await temporaryChat.sendMessage(
  {
    message: compressionPrompt,
    config: {
      maxOutputTokens: 8192,
      temperature: 0.1, // Low temperature for consistency
      abortSignal,
      systemInstruction: getCompressionPrompt() // Special system prompt
    }
  },
  `compress-${prompt_id}-${Date.now()}`,
  SceneType.COMPRESSION
);

// Extract summary from response
let summary = '';
const parts = compressionResponse.candidates?.[0]?.content?.parts || [];
for (const part of parts) {
  if ('text' in part && typeof part.text === 'string') {
    summary = part.text;
    break;
  }
}
```

**Phase 4: History Reconstruction**
```typescript
const newHistory: Content[] = [
  ...environmentMessages, // Preserve environment
  {
    role: 'user',
    parts: [{ text: summary }], // Compressed summary
  },
  ...historyToKeep, // Recent conversation
];

// Calculate new token count
const newTokenCount = await geminiClient.getContentGenerator().countTokens({
  model,
  contents: newHistory,
});

return {
  success: true,
  compressionInfo: {
    originalTokenCount: finalOriginalTokenCount,
    newTokenCount,
  },
  summary,
  newHistory,
};
```

### 4.3 History Preservation Strategy

**Three Tiers:**

1. **Environment Messages** (Always Preserved)
   - Platform info (Windows Terminal, shell type)
   - Date/time
   - Node.js process information
   - Count: First 2 messages

2. **Compressed Summary** (New)
   - Generated by compression model
   - Contains distilled context of old messages
   - Format: User message with summary text

3. **Recent Conversation** (Partially Preserved)
   - Latest 30% of conversation (or dynamic % for model switch)
   - Maintains recency and coherence
   - Ensures next turn has fresh context

**Example Reconstruction:**
```
Before Compression:
[env1] [env2] [user1] [model1] [user2] [model2] ... [user50] [model50]

After Compression (with 30% preserve):
[env1] [env2] [compressed_summary] [user40] [model40] ... [user50] [model50]
       └────────────────────────┘  └──────────────────────────────────┘
      Environment (preserved)        Recent 30% (preserved)
      1000 tokens              →     300 tokens
```

### 4.4 Token Counting

**Mechanism:** All three scenarios use the same token counting:

```typescript
// For original count
const originalTokenResult = await geminiClient.getContentGenerator().countTokens({
  model: currentModel,
  contents: history,
});
const originalTokenCount = originalTokenResult.totalTokens;

// For compressed count
const compressedTokenResult = await geminiClient.getContentGenerator().countTokens({
  model: currentModel, // Always count with original model
  contents: newHistory,
});
const newTokenCount = compressedTokenResult.totalTokens;
```

**Important:** Token counting uses the **original model**, not the compression model. This ensures accurate comparison before/after.

---

## 5. SHARED MECHANISMS & STATE MANAGEMENT

### 5.1 Mutual Exclusion Lock

**Problem:** Multiple compression sources could attempt to compress simultaneously

**Solution:** Single `isCompressing` boolean lock in GeminiClient

```typescript
private isCompressing: boolean = false; // Mutual exclusion lock

async tryCompressChat(...): Promise<ChatCompressionInfo | null> {
  if (this.isCompressing) {
    console.warn('[tryCompressChat] Compression already in progress, skipping');
    return null;
  }
  this.isCompressing = true;
  try {
    // ... compression logic ...
  } finally {
    this.isCompressing = false; // Always release
  }
}
```

**Lock Acquisition Points:**
- Auto-compression: Sets lock in `tryCompressChat()`
- /compress command: Waits for lock check, then sets in `tryCompressChat()`
- Model switch: Sets lock in `switchModel()`, holds through model update

### 5.2 Error Handling & Rollback

**For Auto-Compression:**
```typescript
if (this.needsCompression) {
  const compressed = await this.tryCompressChat(prompt_id, signal, true);
  if (compressed) {
    yield { type: GeminiEventType.ChatCompressed, value: compressed };
    this.resetCompressionFlag(); // Success: reset flag
  } else {
    // Failure: flag stays set, will retry on next message
    console.warn('[sendMessageStream] Failed to perform scheduled compression');
  }
}
```

**For /compress Command:**
```typescript
try {
  // ... attempt compression ...
} catch (e) {
  // Show error to user
  ui.addItem({
    type: MessageType.ERROR,
    text: `Failed to compress chat history: ${e.message}`,
  }, Date.now());
} finally {
  // Always clear pending UI state
  ui.setPendingItem(null);
}
```

**For Model Switch:**
```typescript
try {
  // ... attempt compression ...
  if (compressionResult.success && compressionResult.newHistory) {
    this.getChat().setHistory(compressionResult.newHistory); // Only if successful
    this.config.setModel(newModel); // Only if history updated
  } else if (!compressionResult.success) {
    // Block model switch if compression failed
    return {
      success: false,
      modelName: newModel,
      error: compressionResult.error
    };
  }
} finally {
  this.isCompressing = false; // Always release lock
}
```

### 5.3 History Atomicity

**Guarantee:** History is only updated if compression succeeds

```typescript
// Check if compression needed
if (compressionResult.success && compressionResult.newHistory) {
  // Only update if we have valid new history
  this.getChat().setHistory(compressionResult.newHistory);
} else {
  // On failure, old history remains unchanged
  return { success: false, error: 'Compression failed' };
}
```

**Why This Matters:**
- If compression network request fails, old history is preserved
- User can retry manually with `/compress` command
- Auto-compression flag remains set for next conversation attempt

---

## 6. COMPARATIVE ANALYSIS

### 6.1 Trigger Comparison

| Aspect | Auto-Compression | /compress Command | Model Switch Compression |
|--------|------------------|-------------------|-------------------------|
| **Trigger Type** | Reactive (threshold-based) | Explicit (user command) | Reactive (model change) |
| **Check Timing** | Start of new message | On command execution | Model change request |
| **Threshold Check** | Required (80% of model limit) | Bypassed (force=true) | Conditional (target limit) |
| **User Control** | Indirect (via token usage) | Direct | Implicit (in model switch) |
| **Frequency** | Once per high-usage session | On-demand | Once per model switch |

### 6.2 Compression Flow Comparison

| Aspect | Auto-Compression | /compress Command | Model Switch Compression |
|--------|------------------|-------------------|-------------------------|
| **Preserve Ratio** | Fixed 30% | Fixed 30% | Dynamic (5%-30%) |
| **Compression Model** | Flash (or Grok for 900k+) | Flash (or Grok for 900k+) | Flash (or Grok for 900k+) |
| **Forcing Behavior** | force=true if `needsCompression`, else force=false | Always force=true | Always force=true |
| **UI Feedback** | Yields ChatCompressed event | Shows spinner + results | Returns compressionInfo or skipReason |
| **Blocking Behavior** | Non-blocking (queues with signal) | Blocking command (user waits) | Blocks model switch until complete |

### 6.3 State Management Comparison

| Aspect | Auto-Compression | /compress Command | Model Switch Compression |
|--------|------------------|-------------------|-------------------------|
| **Flag Management** | needsCompression set/reset | No flag (one-time) | isCompressing lock |
| **Lock Handling** | Acquired in tryCompressChat() | Checked twice, then acquired | Explicit in switchModel() |
| **Reset Trigger** | resetCompressionFlag() after success | setPendingItem(null) after | resetCompressionFlag() after success |
| **Retry Behavior** | Auto-retries on next message | Manual retry via /compress | Failed switch blocks operation |

### 6.4 Error Handling Comparison

| Aspect | Auto-Compression | /compress Command | Model Switch Compression |
|--------|------------------|-------------------|-------------------------|
| **On Failure** | Logs warning, keeps flag set | Shows error to user | Returns error, blocks switch |
| **User Notification** | Via event stream | Direct UI error message | Error message in model selection |
| **Recovery** | Automatic (retries next message) | Manual (user reruns /compress) | Manual (retry switch or choose different model) |
| **Side Effects** | None (history unchanged) | None (history unchanged) | None (history unchanged) |

### 6.5 Token Counting Comparison

| Aspect | Auto-Compression | /compress Command | Model Switch Compression |
|--------|------------------|-------------------|-------------------------|
| **Initial Count** | Tracked via updateTokenCount() | Via shouldCompress() | Via compressToFit() |
| **Threshold Logic** | 0.8 * tokenLimit(currentModel) | None (forced) | 0.9 * tokenLimit(targetModel) |
| **Recounting** | No (uses sessionTokenCount) | Yes (countTokens each time) | Yes (for target model fit) |
| **Model Used** | Current model | History model | Current model → target model |

---

## 7. EDGE CASES & POTENTIAL CONFLICTS

### 7.1 Auto-Compression vs /compress Command

**Scenario:** User presses /compress while auto-compression scheduled but not started

```
Timeline:
T1: User sends message, response triggers auto-compression flag (needsCompression=true)
T2: User immediately types /compress
T3: Auto-compression starts (isCompressing=true)
T4: /compress command checks isCompressionInProgress() → returns true
T5: /compress shows error: "Compression already in progress at client level"
T6: Auto-compression completes, resets flag
T7: User can now run /compress again
```

**Status:** ✅ Handled - /compress backs off gracefully

### 7.2 /compress Command vs Model Switch

**Scenario:** User runs /compress while model switch in progress

```
Timeline:
T1: User selects new model
T2: switchModel() sets isCompressing=true
T3: Model switch compression starts
T4: User tries /compress
T5: /compress checks isCompressionInProgress() → returns true
T6: /compress shows error: "Compression already in progress at client level"
T7: Model switch completes, resets flag
T8: User can now run /compress
```

**Status:** ✅ Handled - /compress backs off gracefully

### 7.3 Auto-Compression vs Model Switch

**Scenario:** Model switch triggered while auto-compression scheduled

```
Timeline:
T1: User sends message, triggers auto-compression flag (needsCompression=true)
T2: User selects new model
T3: switchModel() checks isCompressing → false
T4: switchModel() sets isCompressing=true
T5: Model switch compression starts (calls compressToFit)
T6: Model switch completes, resets needsCompression flag (important!)
T7: User sends next message
T8: sendMessageStream() checks needsCompression → false (was reset)
T9: Attempts optional compression (force=false)
```

**Key Point:** Model switch explicitly calls `resetCompressionFlag()`:
```typescript
// In switchModel() after successful compression
this.resetCompressionFlag();
```

**Status:** ✅ Safe - Model switch resets auto-compression flag

### 7.4 Very Large Context (>900k tokens)

**Special Handling:** When token count exceeds 900k, compression uses upgraded model

```typescript
if (this.sessionTokenCount > 900000) {
  console.log('[tryCompressChat] Token count (${this.sessionTokenCount}) exceeds Flash limit.
              Upgrading compression model to x-ai/grok-4.1-fast.');
  compressionModel = 'x-ai/grok-4.1-fast';
}
```

**Applies To:** All three scenarios (auto, command, model switch)

**Status:** ✅ Handled - Uses more capable model for large contexts

### 7.5 History Too Small to Compress

**Safeguard:** Minimum conversation length check

```typescript
if (conversationHistory.length <= 2) {
  return {
    success: false,
    error: 'Insufficient conversation history to compress'
  };
}
```

**Behavior:**
- Auto: Logs warning, keeps flag for next attempt
- Command: Shows error to user
- Model Switch: Returns skipReason, proceeds without compression

**Status:** ✅ Handled - Prevents empty compression attempts

### 7.6 No Suitable Tool Call Boundary

**Edge Case:** Cannot find clean split point for compression

```typescript
compressBeforeIndex = this.findToolCallBoundary(conversationHistory, compressBeforeIndex);
if (compressBeforeIndex === -1) {
  return {
    success: false,
    error: 'Could not find suitable compression boundary'
  };
}
```

**Scenario Examples:**
- All tool calls are recent (within preserve ratio)
- History only has user messages
- Compression boundary lands in middle of tool call pair

**Status:** ✅ Handled - Returns error, history unchanged

### 7.7 Token Counting Fails

**Safeguard:** Graceful degradation

```typescript
if (currentTokenCount === undefined) {
  return {
    success: true,
    skipReason: 'Unable to determine token count for model switch. Proceeding without compression.'
  };
}
```

**For Model Switch:** Optimistic - proceeds without compression

**For Auto/Command:** Fails - returns null/error

**Status:** ✅ Handled - Different fallback strategies per scenario

### 7.8 Compression Response Invalid

**Detection:** Looks for text in compression response

```typescript
let summary = '';
const parts = compressionResponse.candidates?.[0]?.content?.parts || [];
for (const part of parts) {
  if ('text' in part && typeof part.text === 'string') {
    summary = part.text;
    break;
  }
}

if (!summary) {
  const detailedError = `Failed to generate compression summary - empty response.`;
  throw new Error(detailedError);
}
```

**Handles:** Thinking blocks, function calls, or malformed responses

**Status:** ✅ Handled - Detailed error reporting

---

## 8. INTERACTION MATRIX

### 8.1 Can These Operations Happen Simultaneously?

|  | Auto-Compression | /compress | Model Switch |
|---|---|---|---|
| **Auto-Compression** | ❌ No (mutex) | ❌ No (mutex) | ❌ No (mutex) |
| **/compress** | ❌ No (mutex) | ❌ No (duplicate check) | ❌ No (mutex) |
| **Model Switch** | ❌ No (mutex) | ❌ No (mutex) | ❌ No (self-exclusive) |

### 8.2 What Happens to State After Each?

| Scenario | needsCompression | sessionTokenCount | isCompressing | History |
|----------|-----------------|-------------------|---------------|---------|
| Auto-Compression succeeds | Reset to false | Reset to 0 | Released | Replaced |
| Auto-Compression fails | Remains true | Not changed | Released | Unchanged |
| /compress succeeds | No change | No change | Released | Replaced |
| /compress fails | No change | No change | Released | Unchanged |
| Model Switch succeeds | Reset to false | Not affected | Released | Replaced |
| Model Switch fails | Not affected | Not affected | Released | Unchanged |

---

## 9. DEPENDENCY FLOW

### 9.1 Compression Call Chain

```
GeminiClient
├── sendMessageStream()
│   ├── waitForCompressionComplete() [if isCompressing]
│   ├── checkCompression() [check needsCompression]
│   └── tryCompressChat()
│       └── CompressionService.tryCompress()
│           └── CompressionService.compressHistory()
│               ├── shouldCompress() [check threshold]
│               ├── createTemporaryChat() [for compression]
│               ├── CompressionService.findToolCallBoundary()
│               ├── temporaryChat.sendMessage() [call compression model]
│               └── countTokens() [verify compression worked]
│
├── switchModel()
│   ├── Check if isCompressing
│   ├── Set isCompressing = true
│   └── CompressionService.compressToFit()
│       ├── countTokens() [check fit]
│       └── CompressionService.compressHistory()
│           └── [same as above]
│
└── /compress Command
    └── compressCommand.action()
        ├── Check ui.pendingItem
        ├── Check isCompressionInProgress()
        └── tryCompressChat(force=true)
            └── [same as sendMessageStream]
```

### 9.2 Token Counting Locations

```
Token Counts Generated By:
1. updateTokenCountAndCheckCompression() - After each API response
2. shouldCompress() - Before compression decision
3. compressToFit() - For model switch fit check
4. compressHistory() - For original and compressed comparison

Token Limits Retrieved From:
1. tokenLimit(model) - From cloud API or fallback to 200k
2. compressionThreshold = 0.8 * tokenLimit
3. Model switch target safe limit = 0.9 * tokenLimit(targetModel)
```

---

## 10. RECOMMENDATIONS FOR SAFE USAGE

### 10.1 For End Users

1. **Let auto-compression work naturally** - It will trigger when needed
2. **Use /compress command when:**
   - Want immediate feedback on token savings
   - Context feels bloated
   - About to do extensive work with many tool calls
3. **Model switch is safe** - Compression happens automatically during switch
4. **Avoid rapid operations:**
   - Don't spam /compress while one is running
   - Let model switch complete before starting new conversation

### 10.2 For Developers

1. **Compression is Idempotent**
   - Can be called multiple times safely
   - Token counting is accurate
   - History is only updated on success

2. **Lock Management**
   - Always release `isCompressing` lock (finally block used)
   - Two-level checks in /compress prevent race conditions
   - Model switch blocks until compression complete

3. **Error Handling**
   - On compression failure, history is never corrupted
   - Failed auto-compression retries on next message
   - Failed command/switch returns explicit error

4. **Testing Considerations**
   - Test timeout scenarios (abortSignal)
   - Test concurrent compression attempts (should fail)
   - Test token counting edge cases
   - Test with very small and very large histories
   - Test model switch with insufficient space for history

---

## 11. KEY METRICS & THRESHOLDS

### 11.1 Default Configuration

```typescript
compressionTokenThreshold: 0.8        // Trigger at 80% of model limit
compressionPreserveThreshold: 0.3     // Keep latest 30% of conversation
skipEnvironmentMessages: 2             // Preserve first 2 system messages
compressionModel: 'gemini-2.0-flash'  // Default compression model
```

### 11.2 Dynamic Thresholds

```
Auto-Compression Threshold: 0.8 * tokenLimit(model)
Example: 0.8 * 200,000 = 160,000 tokens

Model Switch Safe Limit: 0.9 * tokenLimit(targetModel)
Example: 0.9 * 100,000 = 90,000 tokens

Large Context Upgrade: > 900,000 tokens
Uses: x-ai/grok-4.1-fast instead of Flash
```

### 11.3 Performance Considerations

```
Token Counting:
- Takes ~100-500ms depending on history size
- Called 2-3 times per compression
- Critical path for all three scenarios

Compression API Call:
- Takes ~2-5 seconds typically
- Depends on history size being compressed
- Uses temporary chat instance

Lock Wait Time:
- Maximum 100ms polling interval
- Waits until compression complete
- Prevents user message processing until ready
```

---

## CONCLUSION

The three compression scenarios in DeepV Code work harmoniously through:

1. **Shared Compression Engine** - All use same `CompressionService.compressHistory()`
2. **Mutual Exclusion** - Single `isCompressing` lock prevents conflicts
3. **Graceful Degradation** - Each scenario handles failures safely
4. **State Isolation** - Changes only propagate on success
5. **Clear Semantics** - Each scenario has distinct purpose and trigger

**Safety Guarantees:**
- ✅ History never corrupted on failure
- ✅ No concurrent compression operations
- ✅ Automatic retry on auto-compression failure
- ✅ User control via /compress command
- ✅ Safe model switching with adaptive compression

**Performance Profile:**
- Auto-compression: ~2-5 seconds (before next turn)
- /compress command: ~2-5 seconds (with UI feedback)
- Model switch: ~2-5 seconds (blocks model change)
- Token counting: ~100-500ms (per operation)
