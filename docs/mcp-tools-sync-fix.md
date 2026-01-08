# MCP工具同步问题修复

## 问题描述

在实现MCP异步加载后，虽然MCP服务器能够成功连接，但AI模型无法感知到这些工具。即使明确要求AI使用某个MCP工具，AI也会回复说没有该工具。

## 根本原因

1. **初始化顺序问题**：
   - `GeminiClient`在初始化时调用`startChat()`创建chat实例
   - `startChat()`方法中传入的`tools`参数来自`ToolRegistry`
   - 此时MCP工具还未加载（异步加载在后台进行）

2. **缺少更新机制**：
   - MCP工具在后台异步加载完成后（`discoverMcpToolsAsync()`）
   - 工具虽然已添加到`ToolRegistry`中
   - 但**没有更新**已经初始化的`GeminiChat`实例的工具列表
   - AI模型使用的是初始化时的工具列表，不包含后来加载的MCP工具

## 修复方案

在`Config.discoverMcpToolsAsync()`方法中，MCP工具发现完成后，调用`GeminiClient.setTools()`更新AI模型的工具列表。

### 修改文件

**文件**: `packages/core/src/config/config.ts`

**修改前**:
```typescript
private async discoverMcpToolsAsync(): Promise<void> {
  try {
    await this.toolRegistry.discoverMcpTools();
  } catch (error) {
    // MCP discovery errors are already logged in mcp-client.ts
    // We don't want to crash the CLI if MCP servers fail to connect
  }
}
```

**修改后**:
```typescript
private async discoverMcpToolsAsync(): Promise<void> {
  try {
    await this.toolRegistry.discoverMcpTools();
    // 更新AI模型的工具列表，使其能够感知到新加载的MCP工具
    if (this.geminiClient && this.geminiClient.isInitialized()) {
      await this.geminiClient.setTools();
    }
  } catch (error) {
    // MCP discovery errors are already logged in mcp-client.ts
    // We don't want to crash the CLI if MCP servers fail to connect
  }
}
```

## 工作流程

### 修复前的流程
```
1. CLI启动
2. Config初始化
3. GeminiClient初始化
   - 创建chat实例
   - 传入工具列表（此时只有内置工具）
4. 用户开始交互
5. 后台：MCP工具异步加载完成
   - 工具添加到ToolRegistry ✓
   - Chat实例的工具列表未更新 ✗
6. AI感知不到MCP工具
```

### 修复后的流程
```
1. CLI启动
2. Config初始化
3. GeminiClient初始化
   - 创建chat实例
   - 传入工具列表（此时只有内置工具）
4. 用户开始交互
5. 后台：MCP工具异步加载完成
   - 工具添加到ToolRegistry ✓
   - 调用geminiClient.setTools()更新工具列表 ✓
6. AI能够感知到MCP工具 ✓
```

## 测试方法

### 测试1：检查工具列表
```bash
dvcode -p "请列出你当前可以使用的所有工具名称"
```

预期结果：应该包含MCP服务器提供的工具

### 测试2：使用特定MCP工具
假设配置了一个提供`database_query`工具的MCP服务器：
```bash
dvcode -p "请使用database_query工具查询用户表"
```

预期结果：AI应该能够识别并使用该工具，而不是回复"没有这个工具"

### 测试3：验证工具更新时机
可以通过添加日志来验证：
```typescript
// 在 discoverMcpToolsAsync 方法中
private async discoverMcpToolsAsync(): Promise<void> {
  try {
    console.log('[MCP] 开始发现MCP工具...');
    await this.toolRegistry.discoverMcpTools();
    console.log('[MCP] MCP工具发现完成');

    if (this.geminiClient && this.geminiClient.isInitialized()) {
      console.log('[MCP] 正在更新AI模型工具列表...');
      await this.geminiClient.setTools();
      console.log('[MCP] AI模型工具列表已更新');
    }
  } catch (error) {
    console.error('[MCP] MCP工具发现失败:', error);
  }
}
```

## 相关文件

- `packages/core/src/config/config.ts` - Config类，负责初始化和MCP工具发现
- `packages/core/src/core/client.ts` - GeminiClient类，包含setTools()方法
- `packages/core/src/tools/tool-registry.ts` - ToolRegistry类，管理所有工具
- `packages/core/src/tools/mcp-client.ts` - MCP客户端，负责连接MCP服务器

## 注意事项

1. **异步时机**：MCP工具加载是在CLI初始化300ms后才开始的，这确保UI已经完全渲染
2. **错误处理**：MCP服务器连接失败不会导致CLI崩溃，只是该服务器的工具不可用
3. **性能影响**：`setTools()`是同步更新工具声明，不会阻塞用户交互

## 修复日期

2025-10-09
