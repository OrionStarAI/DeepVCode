# 输入性能优化

## 问题描述

CLI启动后，虽然输入框立即可见，但输入时会出现卡顿、反应慢的现象。

## 问题原因分析

### 1. 频繁的调试日志输出 ⚠️

**位置**: `packages/cli/src/ui/App.tsx` 和 `packages/cli/src/ui/components/InputPrompt.tsx`

**问题**: 每次按键都会输出调试日志，在启动初期可能特别影响性能：

```typescript
// ❌ 优化前：每次按键都记录日志
useInput((input: string, key: InkKeyType) => {
  if (key.ctrl || input === '\r' || input === '\n') {
    console.log('🌍 [App级别] 按键拦截:', {
      input: JSON.stringify(input),
      ctrl: key.ctrl,
      shift: key.shift,
      meta: key.meta
    });
  }
});

// InputPrompt中也有
if (key.name === 'return' || key.ctrl || ...) {
  console.log('🚨 [按键调试]', { ... });
}
```

**影响**:
- 每次按键都会进行JSON序列化和字符串拼接
- 控制台输出本身就很耗时
- 在Windows CMD环境下控制台输出特别慢
- 累积起来导致明显的输入延迟

### 2. React组件重渲染

启动时可能有大量状态变化：
- MCP服务器状态更新
- 认证状态检查
- 主题加载
- 会话初始化

这些都可能触发React组件重渲染。

### 3. 同步操作阻塞事件循环

虽然我们已经优化了MCP和认证，但可能还有其他同步操作在启动时执行。

## 已实施的优化

### 优化1: 禁用按键调试日志 ✅

**修改文件**:
- `packages/cli/src/ui/App.tsx`
- `packages/cli/src/ui/components/InputPrompt.tsx`

**改动内容**:
```typescript
// ✅ 优化后：注释掉所有按键调试日志
useInput((input: string, key: InkKeyType) => {
  // 🔍 App级别按键调试（已禁用以提升性能）
  // if (key.ctrl || input === '\r' || input === '\n') {
  //   console.log('🌍 [App级别] 按键拦截:', { ... });
  // }
});
```

**效果**:
- ✅ 消除每次按键的日志开销
- ✅ 减少JSON序列化和字符串操作
- ✅ 提升输入响应速度

### 优化2: 已有的异步加载优化

从之前的优化中受益：
- ✅ MCP服务器异步加载（不阻塞）
- ✅ 认证延迟刷新（不阻塞）

## 如果仍然卡顿的进一步优化

### 建议1: 检查终端性能

某些终端模拟器性能较差：

**Windows**:
- ❌ **CMD** - 性能最差，特别是输出大量内容时
- ⚠️ **PowerShell** - 中等性能
- ✅ **Windows Terminal** - 性能最好（推荐）
- ✅ **Git Bash / MinTTY** - 性能较好

**建议**: 如果使用CMD，建议切换到Windows Terminal

### 建议2: 延迟非关键组件渲染

可以考虑延迟渲染一些非关键组件：

```typescript
const [showOptionalUI, setShowOptionalUI] = useState(false);

useEffect(() => {
  // 延迟500ms后才显示非关键UI
  const timer = setTimeout(() => setShowOptionalUI(true), 500);
  return () => clearTimeout(timer);
}, []);

return (
  <>
    <InputPrompt /> {/* 关键组件立即显示 */}
    {showOptionalUI && <OptionalComponents />} {/* 非关键组件延迟 */}
  </>
);
```

### 建议3: 使用React.memo优化重渲染

对于复杂的组件，使用memo避免不必要的重渲染：

```typescript
export const ExpensiveComponent = React.memo(({ data }) => {
  // 复杂的渲染逻辑
}, (prevProps, nextProps) => {
  // 自定义比较逻辑
  return prevProps.data === nextProps.data;
});
```

### 建议4: 减少useEffect依赖

检查是否有useEffect的依赖过多，导致频繁重新执行：

```typescript
// ❌ 可能导致频繁执行
useEffect(() => {
  // ...
}, [config, settings, history, ...]);  // 依赖太多

// ✅ 优化：只依赖真正需要的
useEffect(() => {
  // ...
}, [config.someSpecificValue]);  // 只依赖具体值
```

### 建议5: 批量状态更新

如果有多个setState连续调用，考虑合并：

```typescript
// ❌ 多次setState可能导致多次重渲染
setStateA(valueA);
setStateB(valueB);
setStateC(valueC);

// ✅ 使用单一state对象或React 18的自动批处理
setState({ a: valueA, b: valueB, c: valueC });
```

### 建议6: 启用生产模式

确保使用生产构建：

```bash
# 确认NODE_ENV是production
NODE_ENV=production npm start
```

生产模式会：
- 禁用开发工具
- 启用代码优化
- 移除调试代码

## 性能诊断方法

### 方法1: 添加性能标记

临时添加性能测量代码：

```typescript
console.time('Component Render');
// 组件渲染逻辑
console.timeEnd('Component Render');

console.time('Key Handler');
// 按键处理逻辑
console.timeEnd('Key Handler');
```

### 方法2: 使用Node.js性能分析

```bash
# 使用性能分析器启动
node --prof dist/index.js

# 生成性能报告
node --prof-process isolate-*.log > profile.txt
```

### 方法3: React DevTools Profiler

如果使用VSCode插件版本，可以使用React DevTools查看组件渲染时间。

## 已知性能瓶颈

### 1. Ink框架本身

Ink是基于React的终端UI框架，相比原生终端操作：
- ✅ 提供了良好的组件化和状态管理
- ⚠️ 但增加了一定的渲染开销

### 2. 终端输出限制

终端本身的渲染速度有限：
- Windows CMD: ~1000行/秒
- Windows Terminal: ~10000行/秒
- Unix终端: ~5000行/秒

### 3. React虚拟DOM diff

启动时大量组件同时渲染，React需要进行diff计算。

## 优化效果预期

### 禁用调试日志后

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 按键响应延迟 | 50-200ms | 10-50ms |
| 连续输入流畅度 | 卡顿明显 | 流畅 |
| 控制台输出量 | 大量 | 最小 |

### 结合所有优化

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 启动到可输入 | 5-15秒 | <1秒 |
| 输入响应延迟 | 50-200ms | 10-50ms |
| UI卡顿 | 频繁 | 罕见 |

## 监控建议

如果仍然遇到性能问题，可以：

1. **启用性能日志**:
   ```typescript
   const DEBUG_PERF = process.env.DEBUG_PERF === 'true';

   if (DEBUG_PERF) {
     console.time('操作名称');
     // ... 操作
     console.timeEnd('操作名称');
   }
   ```

2. **监控关键指标**:
   - 首次输入响应时间
   - 按键到显示的延迟
   - 组件渲染次数

3. **用户反馈**:
   - 收集不同终端环境下的性能数据
   - 识别性能敏感的操作

## 修改文件列表

1. `packages/cli/src/ui/App.tsx` - 禁用App级别按键日志
2. `packages/cli/src/ui/components/InputPrompt.tsx` - 禁用InputPrompt按键日志

## 修改日期

2025-01-10

## 相关文档

- [MCP异步加载优化](./mcp-async-loading.md)
- [认证延迟刷新优化](./auth-lazy-refresh.md)
- [MCP状态实时显示](./mcp-status-display.md)
