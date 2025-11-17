# MCP响应保护机制

## 概述

为了防止大型MCP工具响应导致上下文Token计算异常，我们实现了一套智能的MCP响应保护机制。这个机制能够：

1. **验证响应大小** - 在响应加入历史前记录其实际大小
2. **动态截断** - 根据上下文剩余空间智能地截断大型响应
3. **文件存储** - 超大响应存储为临时文件，并指导AI使用搜索工具精准读取
4. **自动清理** - 定期清理过期的临时文件

## 核心特性

### 1. 智能截断策略

根据上下文的使用情况，采用不同的处理策略：

| 上下文剩余 | 处理策略 | 说明 |
|----------|--------|------|
| > 20% | 通过 | 响应直接加入历史，无需处理 |
| 10-20% | 适度截断 | 将响应截断到剩余空间的50% |
| < 10% | 激进处理 | 转为文件存储或激进截断 |

### 2. 单个响应大小限制

- **默认限制**: 100KB (激进的限制，防止单个响应消耗过多上下文)
- **超过限制的处理**: 自动转为临时文件存储

### 3. 临时文件存储

当响应过大时：

```
原始响应: 500KB read-many-files 工具结果
         ↓
   保存为临时文件
     .deepvcode/mcp-tmp/mcp-response-read-many-files-1234567890.json
         ↓
指导消息，告诉AI应该使用 search_file_content 工具来查询
```

**指导信息包含**：
- 临时文件的绝对路径
- 文件大小信息
- 推荐使用搜索工具来获取特定信息的说明
- 文件会在30分钟后自动删除的提醒

### 4. Token估计

- **精确模式**: 如果有ContentGenerator可用，使用API精确计算
- **启发式模式**: 使用 `1 token ≈ 4字符` 的启发式估计（无需API调用）

## 工作流程

### 工具执行完成后的处理流程

```
工具执行完成
    ↓
获取 ToolResult.llmContent (可能是大型响应)
    ↓
检查响应类型 (是否是Part数组)
    ↓
调用 MCPResponseGuard.guardResponse()
    ├─ 估计响应Token大小
    ├─ 检查上下文剩余空间
    └─ 根据情况决策:
       ├─ 安全 → 直接返回
       ├─ 上下文低 → 截断响应
       └─ 上下文严重不足 → 转为文件存储
    ↓
返回处理后的Part[]
    ↓
使用处理后的响应继续正常流程
(convertToFunctionResponse → recordHistory)
```

## 集成点

### ToolExecutionEngine (packages/core/src/core/toolExecutionEngine.ts)

在工具执行完成、响应转换前进行保护：

```typescript
// 工具执行完成后
const toolResult = await toolInstance.execute(...);

// 应用MCP响应保护
if (Array.isArray(toolResult.llmContent) && /* 是Part数组 */) {
  const guardResult = await this.mcpResponseGuard.guardResponse(
    toolResult.llmContent as Part[],
    this.config,
    reqInfo.name,
    currentContextUsage
  );
  guardedLlmContent = guardResult.parts;
}

// 继续正常流程
const responseParts = convertToFunctionResponse(..., guardedLlmContent);
```

## 配置选项

通过 `MCPResponseGuardConfig` 接口自定义：

```typescript
{
  // 单个响应最大大小（字节），默认100KB
  // 激进的限制，防止单个MCP响应消耗过多上下文空间
  maxResponseSize?: number;

  // 上下文低阈值（百分比，0-1），默认0.2（20%）
  contextLowThreshold?: number;

  // 上下文严重不足阈值（百分比，0-1），默认0.1（10%）
  contextCriticalThreshold?: number;

  // 临时文件目录，默认项目的.deepvcode/mcp-tmp
  tempDir?: string;

  // 是否启用临时文件存储，默认true
  enableTempFileStorage?: boolean;

  // 临时文件过期时间（毫秒），默认30分钟
  tempFileTTL?: number;
}
```

## 日志输出示例

### 正常情况
```
[MCPResponseGuard] Processing response from tool 'read_many_files': 45.32KB, context usage: 35.0%
[MCPResponseGuard] Estimated tokens for response: 11330
[MCPResponseGuard] Response is within safe limits, no processing needed
[ToolExecutionEngine] [GUARD] 响应安全 | 大小: 45.32KB
```

### 上下文低时的截断
```
[MCPResponseGuard] Processing response from tool 'read_many_files': 120.45KB, context usage: 75.0%
[MCPResponseGuard] Context low (25.0% remaining). Applying moderate truncation.
[ToolExecutionEngine] [GUARD] 上下文空间不足，响应已被截断 | 原始: 120.45KB -> 48.23KB
```

### 转为文件存储
```
[MCPResponseGuard] Processing response from tool 'read_many_files': 512.80KB, context usage: 88.0%
[MCPResponseGuard] Response exceeds max size. Using file storage.
[MCPResponseGuard] Stored response as file: .deepvcode/mcp-tmp/mcp-response-read-many-files-1699564800000.json
[ToolExecutionEngine] [GUARD] Response stored as file | 原始: 512.80KB -> 2.15KB | 已存储为: .deepvcode/mcp-tmp/...
```

## 用户体验

### 场景1: 正常响应
用户不会感受到任何差异，工具响应正常处理。

### 场景2: 大响应但上下文充足
响应被保留，用户获得完整的工具输出。

### 场景3: 大响应且上下文紧张
响应被存为文件，AI会收到明确的工具使用指导：

```
📋 **Large response from read_many_files stored as temporary file**

**File location:** `.deepvcode/mcp-tmp/mcp-response-read-many-files-1234567890.json`
**Original size:** 512.80KB

---

## ⚡ **IMPORTANT - How to access the content:**

The file has been stored as a temporary JSON file. **You MUST use the search_file_content tool**
to extract specific information from it.

### 🔍 **Recommended approach: Use search_file_content to find what you need**

**Step 1:** Think about what information you're looking for...

**Step 2:** Use `search_file_content` with a relevant pattern:

**Examples of useful searches:**
- Search for specific filename: `pattern: "\.ts$"`
- Search for errors: `pattern: "error|Error|ERROR"`
- Search for specific function: `pattern: "function.*myFunction"`
- Search for imports: `pattern: "^import|^from"`
```

## 防护原理

### 问题根源

当大型MCP响应被加入历史时，会导致：

1. **Token计数缺口**: 响应加入后没有重新统计Token
2. **计算显示异常**: UI显示的上下文百分比可能不准确
3. **压缩触发异常**: 压缩决策基于旧的Token统计

### 解决方案

1. **验证和记录**: 在响应加入前验证其大小并记录Token消耗
2. **智能截断**: 根据实际剩余空间动态调整响应大小
3. **文件转移**: 超大响应外移到临时文件，保持历史轻量
4. **指导AI**: 通过文件指导消息告诉AI如何精准地访问数据

## 局限性与未来改进

### 当前局限
1. 上下文使用百分比估计为固定值(50%)，未来应从Client获取真实值
2. 启发式Token估计可能不够精确

### 计划改进
1. ✅ 从`GeminiClient`获取真实上下文使用百分比
2. ✅ 支持从ContentGenerator获取精确Token计数
3. ✅ 添加配置选项允许用户自定义保护策略
4. ✅ 集成到SubAgent的响应处理中

## 测试

### 单元测试位置
```
packages/core/src/services/mcpResponseGuard.ts (测试应添加)
```

### 测试覆盖点
- [ ] 小响应通过
- [ ] 大响应截断
- [ ] 临时文件存储和清理
- [ ] Token估计精确性
- [ ] 上下文阈值判断

## 临时文件存储位置

**优先级顺序**：

1. **项目 .deepvcode/mcp-tmp** (首选)
   - 位置：`<project-root>/.deepvcode/mcp-tmp/`
   - 优点：与项目相关，容易管理，备份时包含

2. **用户主目录** (备选)
   - 位置：`~/.deepvcode/mcp-tmp/`
   - 适用于：找不到项目根目录时

3. **系统临时目录** (最后备选)
   - Windows: `%TEMP%\deepvcode-mcp\`
   - Linux/Mac: `/tmp/deepvcode-mcp/`

## 相关文件

| 文件 | 作用 |
|------|------|
| `packages/core/src/services/mcpResponseGuard.ts` | 核心保护服务 |
| `packages/core/src/core/toolExecutionEngine.ts` | 集成点（工具执行） |
| `packages/core/src/index.ts` | 导出MCPResponseGuard |
| `.deepvcode/mcp-tmp/` | 临时文件存储目录 |

## 参考

- [Token上下文计算异常分析](./mcp-token-analysis.md)
- [工具执行引擎设计](./architecture.md)
