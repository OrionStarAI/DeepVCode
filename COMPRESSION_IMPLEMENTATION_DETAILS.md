# Compression Scenarios: Implementation Details & Code Locations

## 1. FILE STRUCTURE

### Core Files
```
packages/core/src/core/
├── client.ts                    # GeminiClient - Main compression orchestrator
│   ├── updateTokenCountAndCheckCompression() - Line 218
│   ├── checkCompression() - Line 230
│   ├── resetCompressionFlag() - Line 243
│   ├── waitForCompressionComplete() - Line 254
│   ├── sendMessageStream() - Line 501 (Auto-compression trigger)
│   ├── tryCompressChat() - Line 675
│   └── switchModel() - Line 745 (Model switch compression)
│
└── turn.ts                      # Event types and interfaces
    ├── ChatCompressionInfo interface - Line 140
    ├── ModelSwitchResult interface - Line 145
    └── TokenUsageInfo interface - Line 157

packages/core/src/services/
└── compressionService.ts        # Shared compression logic
    ├── CompressionService class - Line 97
    ├── findIndexAfterFraction() - Line 50
    ├── shouldCompress() - Line 148
    ├── compressHistory() - Line 200
    ├── tryCompress() - Line 433
    ├── compressToFit() - Line 481
    └── findToolCallBoundary() - Line 143

packages/cli/src/ui/commands/
├── compressCommand.ts           # /compress command
│   ├── compressCommand definition - Line 11
│   └── command.action() - Line 21
│
└── modelCommand.ts              # /model command (triggers switch)
    └── Model switch handling - Line 600

packages/cli/src/ui/
├── types.ts
│   ├── CompressionProps - Line 58
│   ├── HistoryItemCompression - Line 132
│   └── MessageType.COMPRESSION - Line 169
│
└── components/messages/
    └── CompressionMessage.tsx   # UI for compression display
        └── Compression display component - Line 21
```

---

## 2. KEY INTERFACES & TYPES

### ChatCompressionInfo
**File:** `packages/core/src/core/turn.ts` (Line 140)

```typescript
export interface ChatCompressionInfo {
  originalTokenCount: number;  // Token count before compression
  newTokenCount: number;        // Token count after compression
}
```

**Used By:**
- `GeminiClient.tryCompressChat()` - Returns ChatCompressionInfo | null
- `CompressionService.compressHistory()` - Sets in result
- `/compress` command - Displays in UI
- Model switch - Returns in ModelSwitchResult

---

### ModelSwitchResult
**File:** `packages/core/src/core/turn.ts` (Line 145)

```typescript
export interface ModelSwitchResult {
  success: boolean;                        // Whether switch succeeded
  modelName: string;                       // Target model name
  compressionInfo?: ChatCompressionInfo;   // If compression happened
  compressionSkipReason?: string;          // If compression skipped
  error?: string;                          // Error message if failed
}
```

**Returned By:**
- `GeminiClient.switchModel()` - Main result object

**Three Outcomes:**
1. `{ success: true, compressionInfo: {...} }` - Compressed
2. `{ success: true, compressionSkipReason: "..." }` - Skipped
3. `{ success: false, error: "..." }` - Failed

---

### CompressionResult
**File:** `packages/core/src/services/compressionService.ts` (Line 47)

```typescript
export interface CompressionResult {
  success: boolean;              // Compression succeeded
  compressionInfo?: ChatCompressionInfo; // Token stats
  error?: string;                // Error message if failed
  summary?: string;              // Generated summary text
  newHistory?: Content[];        // New history after compression
  skipReason?: string;           // Why compression was skipped
}
```

**Returned By:**
- `CompressionService.tryCompress()`
- `CompressionService.compressHistory()`
- `CompressionService.compressToFit()`

---

## 3. COMPRESSION ENTRY POINTS

### 3.1 Auto-Compression Entry Point

**Location:** `packages/core/src/core/client.ts` - `sendMessageStream()` (Line 501)

```typescript
async *sendMessageStream(
  request: PartListUnion,
  signal: AbortSignal,
  prompt_id: string,
  turns: number = this.MAX_TURNS,
  originalModel?: string,
): AsyncGenerator<ServerGeminiStreamEvent, Turn>
```

**Compression Logic:**
```typescript
// Line 530-535: Wait for ongoing compression
if (this.isCompressing) {
  console.log('[sendMessageStream] Waiting for ongoing compression to complete...');
  await this.waitForCompressionComplete(signal);
  console.log('[sendMessageStream] Compression wait completed, proceeding');
}

// Line 539-560: Check and perform compression
this.checkCompression();
if (this.needsCompression) {
  console.log('[sendMessageStream] Token threshold exceeded, performing compression before new conversation');
  const compressed = await this.tryCompressChat(prompt_id, signal, true); // force=true
  if (compressed) {
    yield { type: GeminiEventType.ChatCompressed, value: compressed };
    this.resetCompressionFlag();
  } else {
    console.warn('[sendMessageStream] Failed to perform scheduled compression');
  }
} else {
  const compressed = await this.tryCompressChat(prompt_id, signal, false); // force=false
  if (compressed) {
    yield { type: GeminiEventType.ChatCompressed, value: compressed };
    this.resetCompressionFlag();
  }
}
```

**Token Counting Hook:**
```typescript
// Line 619-628: Update token count after response
if (event.type === GeminiEventType.TokenUsage) {
  const tokenInfo = event.value;
  this.updateTokenCountAndCheckCompression(
    tokenInfo.inputTokens,
    tokenInfo.outputTokens
  );
  yield event;
}
```

---

### 3.2 /compress Command Entry Point

**Location:** `packages/cli/src/ui/commands/compressCommand.ts` (Line 11)

```typescript
export const compressCommand: SlashCommand = {
  name: 'compress',
  altNames: ['summarize'],
  description: t('command.compress.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const { ui } = context;
    const geminiClient = context.services.config?.getGeminiClient();

    // Check 1: UI-level pending state
    if (ui.pendingItem) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Already compressing, wait for previous request to complete',
        },
        Date.now(),
      );
      return;
    }

    // Check 2: Client-level compression lock
    if (geminiClient?.isCompressionInProgress()) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Compression already in progress at client level, please wait',
        },
        Date.now(),
      );
      return;
    }

    const pendingMessage: HistoryItemCompression = {
      type: MessageType.COMPRESSION,
      compression: {
        isPending: true,
        originalTokenCount: null,
        newTokenCount: null,
      },
    };

    try {
      ui.setPendingItem(pendingMessage);
      const promptId = `compress-${Date.now()}`;
      const compressed = await geminiClient?.tryCompressChat(promptId, new AbortController().signal, true);
      if (compressed) {
        ui.addItem(
          {
            type: MessageType.COMPRESSION,
            compression: {
              isPending: false,
              originalTokenCount: compressed.originalTokenCount,
              newTokenCount: compressed.newTokenCount,
            },
          } as HistoryItemCompression,
          Date.now(),
        );
      } else {
        ui.addItem(
          {
            type: MessageType.ERROR,
            text: 'Failed to compress chat history.',
          },
          Date.now(),
        );
      }
    } catch (e) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Failed to compress chat history: ${
            e instanceof Error ? e.message : String(e)
          }`,
        },
        Date.now(),
      );
    } finally {
      ui.setPendingItem(null);
    }
  },
};
```

**Key Points:**
- Two-level checking (UI + client)
- Force=true always forces compression
- Shows spinner UI during compression
- Displays results or errors to user

---

### 3.3 Model Switch Compression Entry Point

**Location:** `packages/core/src/core/client.ts` - `switchModel()` (Line 745)

```typescript
async switchModel(newModel: string, abortSignal: AbortSignal): Promise<ModelSwitchResult>
```

**Complete Implementation:**
```typescript
// Line 745-847
async switchModel(newModel: string, abortSignal: AbortSignal): Promise<ModelSwitchResult> {
  if (this.isCompressing) {
    console.warn('[switchModel] Compression in progress, cannot switch model now.');
    return {
      success: false,
      modelName: newModel,
      error: 'Compression in progress, cannot switch model now.'
    };
  }

  const currentModel = this.config.getModel();
  if (currentModel === newModel) {
    return { success: true, modelName: newModel };
  }

  console.log(`[switchModel] Attempting to switch from ${currentModel} to ${newModel}...`);

  // Set compression lock
  this.isCompressing = true;

  try {
    const curatedHistory = this.getChat().getHistory(true);
    let compressionModel = SceneManager.getModelForScene(SceneType.COMPRESSION);

    // Dynamic model upgrade for large contexts
    if (this.sessionTokenCount > 900000) {
      console.log(`[switchModel] Token count (${this.sessionTokenCount}) exceeds Flash limit.
                   Upgrading compression model to x-ai/grok-4.1-fast.`);
      compressionModel = 'x-ai/grok-4.1-fast';
    }

    // Call compressToFit with specialized logic
    const compressionResult = await this.compressionService.compressToFit(
      this.config,
      curatedHistory,
      currentModel,
      newModel,
      compressionModel!,
      this,
      `switch-model-${Date.now()}`,
      abortSignal
    );

    const modelSwitchResult: ModelSwitchResult = {
      success: true,
      modelName: newModel
    };

    console.log(`[switchModel] compressionResult:`, {
      success: compressionResult?.success,
      hasSkipReason: !!compressionResult?.skipReason,
      hasCompressionInfo: !!compressionResult?.compressionInfo,
      hasNewHistory: !!compressionResult?.newHistory,
      hasError: !!compressionResult?.error
    });

    // Handle three outcomes
    if (compressionResult.skipReason) {
      modelSwitchResult.compressionSkipReason = compressionResult.skipReason;
    } else if (compressionResult.success && compressionResult.newHistory) {
      this.getChat().setHistory(compressionResult.newHistory);
      if (compressionResult.compressionInfo) {
        console.log(
          `[switchModel] History compressed to fit new model: ` +
          `${compressionResult.compressionInfo.originalTokenCount} → ` +
          `${compressionResult.compressionInfo.newTokenCount} tokens`
        );
        modelSwitchResult.compressionInfo = compressionResult.compressionInfo;
      }
    } else {
      console.warn(`[switchModel] Compression failed: ${compressionResult.error}`);
      modelSwitchResult.success = false;
      modelSwitchResult.error = compressionResult.error;
      this.isCompressing = false;
      return modelSwitchResult;
    }

    // Update config and chat
    this.config.setModel(newModel);
    this.getChat().setSpecifiedModel(newModel);

    // Reset compression flag
    this.resetCompressionFlag();

    console.log(`[switchModel] Successfully switched to ${newModel}`);
    return modelSwitchResult;

  } catch (error) {
    console.error('[switchModel] Error during model switch:', error);
    return {
      success: false,
      modelName: newModel,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    this.isCompressing = false;
  }
}
```

---

## 4. TOKEN TRACKING IMPLEMENTATION

### 4.1 Token Count Update
**Location:** `packages/core/src/core/client.ts` - `updateTokenCountAndCheckCompression()` (Line 218)

```typescript
private updateTokenCountAndCheckCompression(inputTokens: number, outputTokens: number): void {
  this.sessionTokenCount = inputTokens + outputTokens;

  let compressionTokenThreshold = this.compressionThreshold * tokenLimit(this.config.getModel(), this.config);
  // Default: 0.8 * 200,000 = 160,000 tokens

  if (this.sessionTokenCount >= compressionTokenThreshold) {
    this.needsCompression = true;
    logger.info(`[GeminiClient] Token threshold reached: ${this.sessionTokenCount} >= ${this.compressionThreshold},
                 scheduling compression for next conversation`);
  }
}
```

**Called By:**
- `sendMessageStream()` after TokenUsage event (Line 628)

**Updates:**
- `sessionTokenCount` - Cumulative token sum
- `needsCompression` - Flag for next turn compression

### 4.2 Threshold Check
**Location:** `packages/core/src/core/client.ts` - `checkCompression()` (Line 230)

```typescript
private checkCompression(): void {
  if (!this.needsCompression) {
    let compressionTokenThreshold = this.compressionThreshold * tokenLimit(this.config.getModel(), this.config);
    if (this.sessionTokenCount >= compressionTokenThreshold) {
      this.needsCompression = true;
      logger.info(`[GeminiClient] Token threshold reached: ${this.sessionTokenCount} >= ${this.compressionThreshold},
                   scheduling compression for next conversation`);
    }
  }
}
```

**Called By:**
- `sendMessageStream()` at start (Line 537)

**Purpose:**
- Re-check threshold (might have changed if model switched)
- Set flag if crossing threshold

### 4.3 Token Limit Resolution
**Location:** `packages/core/src/core/tokenLimits.ts` (Line 38)

```typescript
export function tokenLimit(model: Model, config?: Config): TokenCount {
  if (config) {
    const cloudModelInfo = config.getCloudModelInfo(model);
    if (cloudModelInfo) {
      return cloudModelInfo.maxToken;
    }
  }
  return AUTO_MODE_CONFIG.maxToken; // Default 200,000
}
```

**Resolution Order:**
1. Cloud API model info if available
2. AUTO_MODE_CONFIG.maxToken (200,000) as fallback

---

## 5. COMPRESSION SERVICE IMPLEMENTATION

### 5.1 shouldCompress() Method
**Location:** `packages/core/src/services/compressionService.ts` (Line 148)

```typescript
async shouldCompress(
  history: Content[],
  model: string,
  contentGenerator: ContentGenerator,
  force: boolean = false,
  config?: Config
): Promise<{ shouldCompress: boolean; tokenCount?: number }>
```

**Logic:**
```typescript
1. Check if history empty
   ├─ YES → return false

2. Check if force=true
   ├─ YES → return true (bypass threshold)

3. Count tokens in history
   ├─ FAILS → return false
   ├─ SUCCESS → tokenCount = result

4. Check threshold
   ├─ tokenCount >= (0.8 * tokenLimit) → return true
   └─ else → return false
```

### 5.2 compressHistory() Main Method
**Location:** `packages/core/src/services/compressionService.ts` (Line 200)

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

**Steps:**

**Step 1: Get Original Token Count** (Line 210-230)
```typescript
let finalOriginalTokenCount = originalTokenCount;
if (finalOriginalTokenCount === undefined) {
  const originalTokenResult = await this.shouldCompress(
    history, model, geminiClient.getContentGenerator(), false, config
  );
  finalOriginalTokenCount = originalTokenResult.tokenCount;
}
```

**Step 2: Split History** (Line 233-243)
```typescript
const environmentMessages = history.slice(0, Math.min(this.skipEnvironmentMessages, history.length));
const conversationHistory = history.slice(this.skipEnvironmentMessages);

if (conversationHistory.length <= 2) {
  return {
    success: false,
    error: 'Insufficient conversation history to compress'
  };
}
```

**Step 3: Find Compression Boundary** (Line 246-254)
```typescript
const preserveRatio = overridePreserveRatio ?? this.compressionPreserveThreshold;
let compressBeforeIndex = findIndexAfterFraction(
  conversationHistory,
  1 - preserveRatio, // e.g., 0.7 to keep 30%
);

compressBeforeIndex = this.findToolCallBoundary(conversationHistory, compressBeforeIndex);
if (compressBeforeIndex === -1) {
  return {
    success: false,
    error: 'Could not find suitable compression boundary'
  };
}
```

**Step 4: Prepare for Compression** (Line 257-275)
```typescript
const historyToCompress = conversationHistory.slice(0, compressBeforeIndex);
const historyToKeep = conversationHistory.slice(compressBeforeIndex);

let historyForCompression = [...environmentMessages, ...historyToCompress];
const lastMessage = historyToCompress[historyToCompress.length - 1];

if (lastMessage && lastMessage.role === 'user') {
  historyForCompression.push({
    role: MESSAGE_ROLES.MODEL,
    parts: [{ text: 'Understood.' }],
  });
}
```

**Step 5: Create Temporary Chat** (Line 280-283)
```typescript
const temporaryChat = await geminiClient.createTemporaryChat(
  SceneType.COMPRESSION,
  compressionModel,
  { type: 'sub', agentId: 'CompressionService' }
);
```

**Step 6: Send Compression Request** (Line 314-328)
```typescript
const compressionPrompt = 'First, reason in your scratchpad. Then, generate the <state_snapshot>.';

temporaryChat.setHistory(compressionContents.slice(0, -1));

const compressionResponse = await temporaryChat.sendMessage(
  {
    message: compressionPrompt,
    config: {
      maxOutputTokens: 8192,
      temperature: 0.1,
      abortSignal,
      systemInstruction: getCompressionPrompt()
    }
  },
  `compress-${prompt_id}-${Date.now()}`,
  SceneType.COMPRESSION
);
```

**Step 7: Extract Summary** (Line 330-370)
```typescript
let summary = '';
const parts = compressionResponse.candidates?.[0]?.content?.parts || [];
for (const part of parts) {
  if (part && 'text' in part && typeof part.text === 'string') {
    summary = (part as any).text;
    break;
  }
}

if (!summary) {
  throw new Error('Failed to generate compression summary - empty response');
}
```

**Step 8: Rebuild History** (Line 373-388)
```typescript
const newHistory: Content[] = [
  ...environmentMessages,
  {
    role: MESSAGE_ROLES.USER,
    parts: [{ text: summary }],
  },
  ...historyToKeep,
];
```

**Step 9: Calculate New Token Count** (Line 390-400)
```typescript
const result = await geminiClient.getContentGenerator().countTokens({
  model,
  contents: newHistory,
});
const newTokenCount = result.totalTokens;
```

**Step 10: Return Results** (Line 407-415)
```typescript
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

### 5.3 compressToFit() Method
**Location:** `packages/core/src/services/compressionService.ts` (Line 481)

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

**Step 1: Get Limits** (Line 494-498)
```typescript
const targetLimit = tokenLimit(targetModel, config);
const safeLimit = targetLimit * 0.9; // 10% safety margin
```

**Step 2: Count Current Tokens** (Line 500-510)
```typescript
let currentTokenCount: number | undefined;
try {
  const result = await geminiClient.getContentGenerator().countTokens({
    model: currentModel,
    contents: history,
  });
  currentTokenCount = result.totalTokens;
} catch (error) {
  return {
    success: true,
    skipReason: `Unable to count tokens for model switch: ${getErrorMessage(error)}.
                 Proceeding without compression.`
  };
}
```

**Step 3: Check if Compression Needed** (Line 515-522)
```typescript
if (currentTokenCount <= safeLimit) {
  return {
    success: true,
    skipReason: `Context sufficient for target model: ${currentTokenCount} tokens ≤
                 ${safeLimit} safe limit (model limit: ${targetLimit})`
  };
}
```

**Step 4: Calculate Dynamic Ratio** (Line 526-542)
```typescript
const estimatedOverhead = 1000;
const availableForHistory = Math.max(0, safeLimit - estimatedOverhead);
let requiredRatio = availableForHistory / currentTokenCount;

// Clamp to reasonable range
requiredRatio = Math.max(0.05, Math.min(requiredRatio, this.compressionPreserveThreshold));
```

**Step 5: Perform Compression** (Line 544-553)
```typescript
return await this.compressHistory(
  config,
  history,
  currentModel,
  compressionModel,
  geminiClient,
  prompt_id,
  abortSignal,
  currentTokenCount,
  requiredRatio, // Dynamic ratio
  true // Mark as model switch compression
);
```

### 5.4 findToolCallBoundary() Method
**Location:** `packages/core/src/services/compressionService.ts` (Line 143)

```typescript
private findToolCallBoundary(history: Content[], startIndex: number): number {
  // Edge check
  if (startIndex >= history.length) {
    return -1;
  }

  // Find first user message from startIndex onwards
  for (let i = startIndex; i < history.length; i++) {
    if (history[i].role === 'user') {
      return i + 1; // Split after this user message
    }
  }

  return -1; // No user message found - no suitable boundary
}
```

**Purpose:** Ensure compression splits at complete conversation turns, not in the middle of tool calls

---

## 6. STATE MANAGEMENT DETAILS

### 6.1 Compression Lock (isCompressing)
**File:** `packages/core/src/core/client.ts`

**Declaration:**
```typescript
// Line 84
private isCompressing: boolean = false; // Mutual exclusion lock
```

**Acquisition Points:**
```typescript
// In tryCompressChat() - Line 682
if (this.isCompressing) {
  console.warn('[tryCompressChat] Compression already in progress, skipping');
  return null;
}
this.isCompressing = true;

// In switchModel() - Line 759
this.isCompressing = true;
```

**Release Points:**
```typescript
// In tryCompressChat() - finally block (Line 729)
finally {
  this.isCompressing = false;
}

// In switchModel() - finally block (Line 846)
finally {
  this.isCompressing = false;
}
```

**Query Method:**
```typescript
// Line 209
isCompressionInProgress(): boolean {
  return this.isCompressing;
}

// Used by /compress command - Line 33 of compressCommand.ts
if (geminiClient?.isCompressionInProgress()) {
  // Show error
}
```

### 6.2 Compression Flag (needsCompression)
**File:** `packages/core/src/core/client.ts`

**Declaration:**
```typescript
// Line 85
private needsCompression: boolean = false;
```

**Setting Logic:**
```typescript
// In updateTokenCountAndCheckCompression() - Line 223
if (this.sessionTokenCount >= compressionTokenThreshold) {
  this.needsCompression = true;
}

// In checkCompression() - Line 234
if (this.sessionTokenCount >= compressionTokenThreshold) {
  this.needsCompression = true;
}
```

**Checking Logic:**
```typescript
// In sendMessageStream() - Line 542
if (this.needsCompression) {
  console.log('[sendMessageStream] Token threshold exceeded, performing compression');
  const compressed = await this.tryCompressChat(prompt_id, signal, true);
  if (compressed) {
    this.resetCompressionFlag();
  }
}
```

**Reset Logic:**
```typescript
// In resetCompressionFlag() - Line 243
private resetCompressionFlag(): void {
  this.needsCompression = false;
  this.sessionTokenCount = 0;
}

// Called after successful compression:
// - Line 547 in sendMessageStream()
// - Line 555 in sendMessageStream()
// - Line 834 in switchModel()
```

### 6.3 Token Counting Variables
**File:** `packages/core/src/core/client.ts`

```typescript
// Line 83
private sessionTokenCount: number = 0; // Cumulative token count

// Line 84-85
private compressionThreshold: number = 0.8; // 80% threshold
private needsCompression: boolean = false;
```

---

## 7. ERROR HANDLING PATTERNS

### 7.1 tryCompressChat() Error Handling
**Location:** `packages/core/src/core/client.ts` (Line 675)

```typescript
async tryCompressChat(
  prompt_id: string,
  abortSignal: AbortSignal,
  force: boolean = false,
): Promise<ChatCompressionInfo | null> {
  if (this.isCompressing) {
    console.warn('[tryCompressChat] Compression already in progress, skipping');
    return null; // Return null instead of throwing
  }

  this.isCompressing = true;

  try {
    // ... compression logic ...
    const compressionResult = await this.compressionService.tryCompress(
      this.config,
      curatedHistory,
      historyModel!,
      compressionModel!,
      this,
      prompt_id,
      abortSignal,
      force
    );

    if (!compressionResult || !compressionResult.success) {
      if (compressionResult?.error) {
        console.warn(`[GeminiClient] Compression failed: ${compressionResult.error}`);
      }
      return null; // Fail gracefully
    }

    if (compressionResult.newHistory) {
      this.getChat().setHistory(compressionResult.newHistory); // Only update on success
    }

    return compressionResult.compressionInfo || null;

  } finally {
    this.isCompressing = false; // ALWAYS release lock
  }
}
```

**Key Pattern:**
- Returns null instead of throwing
- Never updates history on failure
- Lock always released in finally
- Logs warnings for diagnostics

### 7.2 /compress Command Error Handling
**Location:** `packages/cli/src/ui/commands/compressCommand.ts` (Line 21)

```typescript
try {
  ui.setPendingItem(pendingMessage);
  const promptId = `compress-${Date.now()}`;
  const compressed = await geminiClient?.tryCompressChat(promptId, new AbortController().signal, true);

  if (compressed) {
    ui.addItem({ /* success */ }, Date.now());
  } else {
    ui.addItem({
      type: MessageType.ERROR,
      text: 'Failed to compress chat history.',
    }, Date.now());
  }
} catch (e) {
  ui.addItem({
    type: MessageType.ERROR,
    text: `Failed to compress chat history: ${e instanceof Error ? e.message : String(e)}`,
  }, Date.now());
} finally {
  ui.setPendingItem(null); // ALWAYS clear UI state
}
```

**Key Pattern:**
- Catches errors and shows to user
- Always clears pending UI state
- Distinguishes null return from exception

### 7.3 Model Switch Error Handling
**Location:** `packages/core/src/core/client.ts` (Line 745)

```typescript
try {
  // ... compression attempt ...
  if (compressionResult.success && compressionResult.newHistory) {
    this.getChat().setHistory(compressionResult.newHistory); // Only on success
    this.config.setModel(newModel); // Only after history updated
  } else {
    modelSwitchResult.success = false;
    modelSwitchResult.error = compressionResult.error;
    this.isCompressing = false; // Early release
    return modelSwitchResult; // Block switch
  }

  // Continue with successful switch
  this.resetCompressionFlag();
  return modelSwitchResult;

} catch (error) {
  console.error('[switchModel] Error during model switch:', error);
  return {
    success: false,
    modelName: newModel,
    error: error instanceof Error ? error.message : String(error)
  };
} finally {
  this.isCompressing = false;
}
```

**Key Pattern:**
- Updates history before config
- Blocks model switch on compression failure
- Returns detailed error info
- Lock released even on exception

---

## 8. TOKEN COUNTING LOCATIONS

### 8.1 Locations Where Tokens Are Counted

| Location | Method | Purpose |
|----------|--------|---------|
| Line 150-164 of compressionService.ts | shouldCompress() | Check if compression needed |
| Line 220-230 of compressionService.ts | compressHistory() | Get original token count |
| Line 390-400 of compressionService.ts | compressHistory() | Get compressed token count |
| Line 500-510 of compressionService.ts | compressToFit() | Check if fits in target model |
| Line 960 of mcpResponseGuard.ts | (guard) | Check token usage during execution |

### 8.2 Token Counting API

**Interface:** `packages/core/src/core/contentGenerator.ts`

```typescript
interface ContentGenerator {
  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;
}
```

**Usage Pattern:**
```typescript
const result = await geminiClient.getContentGenerator().countTokens({
  model: 'gemini-2.0-flash',      // Model to count with
  contents: history,                // Content to count
});

const tokenCount = result.totalTokens;
```

**Key Points:**
- Always counts with original model, not compression model
- Ensures consistent token accounting
- Handles all content types (text, function calls, etc.)

---

## 9. CONFIGURATION & CONSTANTS

### 9.1 Compression Service Configuration
**File:** `packages/core/src/services/compressionService.ts` (Line 14-38)

```typescript
export interface CompressionServiceConfig {
  /**
   * Compression trigger threshold: compress when history exceeds this fraction
   * of model limit
   * Default: 0.8 (80%)
   */
  compressionTokenThreshold?: number;

  /**
   * Preserve threshold: keep this fraction of recent history after compression
   * Default: 0.3 (30%)
   */
  compressionPreserveThreshold?: number;

  /**
   * Skip environment messages: usually first 2 are environment setup
   * Default: 2
   */
  skipEnvironmentMessages?: number;
}
```

### 9.2 GeminiClient Initialization
**File:** `packages/core/src/core/client.ts` (Line 102-108)

```typescript
this.compressionService = new CompressionService({
  compressionTokenThreshold: this.compressionThreshold, // 0.8
  compressionPreserveThreshold: 0.3,
  skipEnvironmentMessages: 2, // Skip first 2 env messages
});
```

### 9.3 Token Limit Configuration
**File:** `packages/core/src/core/tokenLimits.ts` (Line 24-28)

```typescript
const AUTO_MODE_CONFIG = {
  name: 'auto',
  displayName: 'Auto',
  creditsPerRequest: 6.0,
  available: true,
  maxToken: 200000,         // Default if not available from API
  highVolumeThreshold: 200000,
  highVolumeCredits: 12.0
};
```

### 9.4 Dynamic Model Upgrade Threshold
**File:** `packages/core/src/core/client.ts`

```typescript
// Line 696-698 in tryCompressChat()
if (this.sessionTokenCount > 900000) {
  compressionModel = 'x-ai/grok-4.1-fast';
}

// Line 773-775 in switchModel()
if (this.sessionTokenCount > 900000) {
  compressionModel = 'x-ai/grok-4.1-fast';
}
```

---

## 10. TESTING LOCATIONS

### 10.1 /compress Command Tests
**File:** `packages/cli/src/ui/commands/compressCommand.test.ts`

```typescript
describe('compressCommand', () => {
  it('should do nothing if a compression is already pending', ...);
  it('should set pending item, call tryCompressChat, and add result on success', ...);
  it('should add an error message if tryCompressChat returns falsy', ...);
  it('should add an error message if tryCompressChat throws', ...);
  it('should clear the pending item in a finally block', ...);
});
```

### 10.2 Compression Service Tests
**File:** `packages/core/src/services/compressionService.test.ts`

```typescript
describe('CompressionService', () => {
  describe('findIndexAfterFraction', ...);
  describe('shouldCompress', ...);
  describe('compressHistory', ...);
  describe('tryCompress', ...);
  describe('compressToFit', ...);
});
```

---

## 11. LOGGING & DEBUGGING

### 11.1 Log Messages

**Auto-Compression:**
```
[GeminiClient] Token threshold reached: 165000 >= 160000
[sendMessageStream] Waiting for ongoing compression to complete...
[sendMessageStream] Compression wait completed, proceeding
[sendMessageStream] Token threshold exceeded, performing compression before new conversation
[CompressionService] Using temporary chat for compression with full API monitoring
[tryCompressChat] Compression applied successfully
```

**Model Switch:**
```
[switchModel] Attempting to switch from gemini-2.0-flash to claude-3-haiku...
[switchModel] Token count (950000) exceeds Flash limit. Upgrading compression model...
[CompressionService] compressToFit called: gemini-2.0-flash → claude-3-haiku
[CompressionService] Model Switch Check: Current Tokens=150000, Target Limit=100000
[switchModel] Successfully switched to claude-3-haiku
```

**Failures:**
```
[tryCompressChat] Compression already in progress, skipping
[switchModel] Compression in progress, cannot switch model now.
[switchModel] Error during model switch: Error message
[CompressionService] Compression failed: Could not determine token count
```

### 11.2 Debug Points

- `client.ts`: `isCompressionInProgress()` - Check lock status
- `client.ts`: `sessionTokenCount` - Check current token usage
- `client.ts`: `needsCompression` - Check if scheduled for compression
- `compressionService.ts`: `compressHistory()` - Main compression logic
- `compressionService.ts`: `compressToFit()` - Model switch logic

