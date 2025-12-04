# Codestral 2 FIM 客户端集成指南

> 本文档面向 VSCode 插件客户端开发工程师，说明如何从 Gemini Flash 2.5 迁移到 Codestral 2 专用模型进行代码行间补全 (Inline Completion)。

## 📋 概述

### 为什么要切换？

| 对比项 | Gemini Flash 2.5 | Codestral 2 FIM |
|--------|------------------|-----------------|
| 请求格式 | 需要构造 `messages[]` 数组，包含上下文 | 直接传 `prompt` + `suffix`，无需构造对话 |
| 响应解析 | 需要从对话格式中提取补全内容 | 直接返回补全代码片段 |
| 模型专业性 | 通用模型 | 代码补全专用，+30% 接受率 |
| 客户端复杂度 | 需要处理 system prompt、多轮对话格式 | 极简，只需处理光标前后代码 |

### 核心变化

```
之前 (Gemini):
客户端需要构造:
{
  "contents": [{"role": "user", "parts": [{"text": "...复杂的prompt..."}]}],
  "config": {...}
}

现在 (Codestral FIM):
客户端只需传:
{
  "model": "codestral-2",
  "prompt": "<光标前的代码>",
  "suffix": "<光标后的代码>"
}
```

---

## 🔌 API 接口

### 请求端点

与之前相同，使用统一的 chat 接口：

```
POST /v1/chat/messages      # 非流式
POST /v1/chat/stream        # 流式（可选，FIM 补全功能 必须用非流式）
```

### 请求格式

```typescript
interface CodestralFIMRequest {
  model: "codestral-2";           // 固定使用此模型名
  prompt: string;                  // 光标前的代码（必需）
  suffix?: string;                 // 光标后的代码（可选）
  config?: {
    maxOutputTokens?: number;      // 最大输出 token，默认 256
    temperature?: number;          // 温度，默认 0.2（代码补全建议低温度）
    topP?: number;                 // 可选
    stopSequences?: string[];      // 可选，停止序列
  };
}
```

### 请求示例

```json
{
  "model": "codestral-2",
  "prompt": "def count_words_in_file(file_path: str):\n    ",
  "suffix": "\n    return n_words",
  "config": {
    "maxOutputTokens": 128,
    "temperature": 0.2
  }
}
```

### 响应格式

响应仍然遵循 GenAI 标准格式，与 Gemini 响应结构一致：

```typescript
interface CodestralFIMResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;  // 补全的代码片段
      role: "model";
    };
    finishReason: "STOP" | "MAX_TOKENS" | "SAFETY" | "RECITATION" | "OTHER";
    index: number;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
    creditsUsage: number;              // 本次请求消耗的 credits
  };
  modelVersion?: string;
}
```

### 响应示例

```json
{
  "candidates": [{
    "content": {
      "parts": [{
        "text": "n_words = 0\n    with open(file_path, 'r') as f:\n        text = f.read().split()\n        for word in text:\n            n_words += 1\n"
      }],
      "role": "model"
    },
    "finishReason": "STOP",
    "index": 0
  }],
  "usageMetadata": {
    "promptTokenCount": 25,
    "candidatesTokenCount": 52,
    "totalTokenCount": 77,
    "creditsUsage": 0.5
  },
  "modelVersion": "codestral-2"
}
```

---

## 💻 客户端实现指南

### 1. 提取光标位置的代码

```typescript
function extractFIMContext(
  document: vscode.TextDocument,
  position: vscode.Position,
  maxPrefixLines: number = 100,  // 光标前最多取100行
  maxSuffixLines: number = 50    // 光标后最多取50行
): { prompt: string; suffix: string } {

  // 计算 prompt 范围（光标前）
  const prefixStartLine = Math.max(0, position.line - maxPrefixLines);
  const prefixRange = new vscode.Range(
    new vscode.Position(prefixStartLine, 0),
    position
  );
  const prompt = document.getText(prefixRange);

  // 计算 suffix 范围（光标后）
  const suffixEndLine = Math.min(document.lineCount - 1, position.line + maxSuffixLines);
  const suffixRange = new vscode.Range(
    position,
    new vscode.Position(suffixEndLine, document.lineAt(suffixEndLine).text.length)
  );
  const suffix = document.getText(suffixRange);

  return { prompt, suffix };
}
```

### 2. 发送请求

```typescript
async function requestFIMCompletion(
  prompt: string,
  suffix: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {

  const response = await fetch(`${API_BASE_URL}/v1/chat/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`
    },
    body: JSON.stringify({
      model: 'codestral-2',
      prompt,
      suffix,
      config: {
        maxOutputTokens: options?.maxTokens ?? 128,
        temperature: options?.temperature ?? 0.2
      }
    })
  });

  if (!response.ok) {
    throw new Error(`FIM request failed: ${response.status}`);
  }

  const data = await response.json();

  // 直接提取补全文本
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
```

### 3. 集成到 VSCode InlineCompletionProvider

```typescript
class CodestralInlineCompletionProvider implements vscode.InlineCompletionItemProvider {

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | null> {

    // 1. 提取上下文
    const { prompt, suffix } = extractFIMContext(document, position);

    // 2. 请求补全
    try {
      const completion = await requestFIMCompletion(prompt, suffix);

      if (!completion || token.isCancellationRequested) {
        return null;
      }

      // 3. 返回补全项
      return [{
        insertText: completion,
        range: new vscode.Range(position, position)
      }];

    } catch (error) {
      console.error('FIM completion error:', error);
      return null;
    }
  }
}

// 注册 Provider
vscode.languages.registerInlineCompletionItemProvider(
  { pattern: '**' },  // 或指定语言
  new CodestralInlineCompletionProvider()
);
```

---

## 🔄 迁移对比

### 之前的 Gemini 实现（复杂）

```typescript
// ❌ 旧方式：需要构造复杂的 prompt
async function requestGeminiCompletion(prefix: string, suffix: string) {
  const systemPrompt = `You are a code completion assistant.
Complete the code between <CURSOR> markers. Only output the completion, no explanation.`;

  const userPrompt = `Complete the following code:
\`\`\`
${prefix}<CURSOR>${suffix}
\`\`\`
Only output the code that should replace <CURSOR>.`;

  const response = await fetch(`${API_BASE_URL}/v1/chat/messages`, {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [{ text: userPrompt }]
      }],
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 256,
        temperature: 0.3
      }
    })
  });

  const data = await response.json();
  // 还需要清理输出，移除可能的 markdown 代码块标记等
  let completion = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  completion = completion.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
  return completion;
}
```

### 现在的 Codestral FIM 实现（简洁）

```typescript
// ✅ 新方式：直接传原始代码，无需任何 prompt engineering
async function requestCodestralCompletion(prefix: string, suffix: string) {
  const response = await fetch(`${API_BASE_URL}/v1/chat/messages`, {
    method: 'POST',
    headers: { ... },
    body: JSON.stringify({
      model: 'codestral-2',
      prompt: prefix,    // 直接传光标前代码
      suffix: suffix,    // 直接传光标后代码
      config: { maxOutputTokens: 128, temperature: 0.2 }
    })
  });

  const data = await response.json();
  // 直接使用，无需任何清理
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
```

---

## ⚙️ 最佳实践

### 1. 参数调优建议

| 参数 | 推荐值 | 说明 |
|------|--------|------|
| `maxOutputTokens` | 64-256 | 代码补全通常较短，不需要太大 |
| `temperature` | 0.1-0.3 | 低温度保证输出稳定性 |
| 前缀行数 | 50-100 | 提供足够上下文，但不要太多 |
| 后缀行数 | 20-50 | 帮助模型理解代码结构 |

### 2. 防抖处理

```typescript
// 用户快速输入时避免频繁请求
const debouncedComplete = debounce(requestCodestralCompletion, 150);
```

### 3. 取消处理

```typescript
let currentAbortController: AbortController | null = null;

async function requestWithCancel(prompt: string, suffix: string) {
  // 取消上一个请求
  currentAbortController?.abort();
  currentAbortController = new AbortController();

  try {
    const response = await fetch(url, {
      ...options,
      signal: currentAbortController.signal
    });
    return await response.json();
  } catch (e) {
    if (e.name === 'AbortError') return null;
    throw e;
  }
}
```

### 4. 缓存策略

```typescript
// 相同上下文短时间内不重复请求
const completionCache = new LRUCache<string, string>({ max: 100, ttl: 30000 });

function getCacheKey(prompt: string, suffix: string): string {
  return `${prompt.slice(-200)}|${suffix.slice(0, 100)}`;
}
```

---

## ❓ FAQ

### Q: 是否支持流式输出？

A: 技术上支持（使用 `/v1/chat/stream` 端点），但 FIM 补全通常输出较短（几十到一两百 token），非流式响应速度已经足够快，建议使用非流式以简化实现。

### Q: 如何处理多语言？

A: Codestral 2 支持 80+ 种编程语言，无需特殊处理，模型会自动识别语言并生成相应代码。

### Q: suffix 可以不传吗？

A: 可以，`suffix` 是可选的。但传入 suffix 能帮助模型更好地理解代码结构，生成更准确的补全。

### Q: 与原有 Gemini 请求可以共存吗？

A: 可以。服务端通过 `model` 字段区分，使用 `codestral-2` 走 FIM 逻辑，使用 `gemini-*` 走原有逻辑。

---

## 📞 联系

如有问题，请联系服务端团队。
