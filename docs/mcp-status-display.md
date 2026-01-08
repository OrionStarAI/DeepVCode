# MCP服务器状态实时显示

## 概述

在MCP异步加载的基础上，实现了实时显示MCP服务器连接状态的功能。用户可以在CLI界面顶部看到真实的MCP服务器连接进度。

## 显示效果

### 不同状态的显示

1. **初始启动/连接中**
   ```
   Using: 1 DEEPV.md file | 0/3 MCP servers (connecting...)
   ```

2. **部分连接成功**
   ```
   Using: 1 DEEPV.md file | 2/3 MCP servers
   ```

3. **全部连接成功**
   ```
   Using: 1 DEEPV.md file | 3 MCP servers (ctrl+t to view)
   ```

4. **全部连接失败**
   ```
   Using: 1 DEEPV.md file | 0/3 MCP servers (failed)
   ```

## 技术实现

### 核心机制

1. **状态监听**: 使用 `addMCPStatusChangeListener` 监听每个MCP服务器的状态变化
2. **状态获取**: 通过 `getAllMCPServerStatuses()` 获取所有服务器的实时状态
3. **自动更新**: 状态变化时触发React组件重新渲染

### 关键代码

#### App.tsx - 状态监听
```typescript
import {
  addMCPStatusChangeListener,
  removeMCPStatusChangeListener,
} from 'deepv-code-core';

const [mcpStatusUpdateTrigger, setMcpStatusUpdateTrigger] = useState(0);

useEffect(() => {
  const handleMCPStatusChange = () => {
    setMcpStatusUpdateTrigger(prev => prev + 1);
  };

  addMCPStatusChangeListener(handleMCPStatusChange);
  return () => removeMCPStatusChangeListener(handleMCPStatusChange);
}, []);
```

#### ContextSummaryDisplay.tsx - 状态计算
```typescript
const allStatuses = getAllMCPServerStatuses();
const connectedMcpServerCount = Array.from(allStatuses.entries()).filter(
  ([serverName, status]) =>
    status === MCPServerStatus.CONNECTED &&
    (mcpServers && serverName in mcpServers)
).length;
```

## 优势

1. **透明性**: 用户可以清楚地知道有多少MCP服务器真正连接成功
2. **实时性**: 连接状态变化时立即更新显示
3. **诊断性**: 通过显示可以快速判断MCP服务器是否有问题
4. **无需等待**: 不需要等所有服务器连接完成就能开始使用CLI

## 相关API

### 从 `deepv-code-core` 导出

- `getAllMCPServerStatuses()`: 获取所有MCP服务器的状态Map
- `getMCPServerStatus(name)`: 获取单个服务器的状态
- `getMCPDiscoveryState()`: 获取整体发现状态
- `addMCPStatusChangeListener(listener)`: 添加状态变化监听器
- `removeMCPStatusChangeListener(listener)`: 移除状态变化监听器

### 状态枚举

```typescript
enum MCPServerStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
}

enum MCPDiscoveryState {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}
```

## 测试场景

1. **快速启动**: 配置3个MCP服务器，观察启动时显示 `0/3 (connecting...)`
2. **渐进连接**: 观察随着服务器连接成功，数字从 `1/3` → `2/3` → `3`
3. **连接失败**: 故意配置一个无效服务器，观察显示 `2/3`
4. **全部失败**: 所有服务器都失败时显示 `0/3 (failed)`

## 修改文件

- `packages/cli/src/ui/App.tsx` - 添加状态监听
- `packages/cli/src/ui/components/ContextSummaryDisplay.tsx` - 实现状态显示
- `packages/core/src/tools/mcp-client.ts` - 已有的状态管理API

## 修改日期

2025-01-10
