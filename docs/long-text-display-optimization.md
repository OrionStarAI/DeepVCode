# 长文本显示优化方案

## 问题分析

根据用户反馈的截图，当输入大量文本（包括日志）后，发送消息后显示框出现了以下问题：

1. **布局对齐问题**：消息框的边框和内容出现错位
2. **文本溢出**：长文本超出容器边界，导致显示破损
3. **换行处理不当**：超长行没有正确换行，影响整体布局
4. **左边距问题**：文本没有考虑App.tsx中设置的90%宽度布局，导致文本贴到终端左边缘

## 根本原因

经过深入分析，发现主要问题是**宽度计算和布局层级的混乱**：

1. **App.tsx设置了整体宽度为90%**：`<Box flexDirection="column" width="90%">`
2. **mainAreaWidth已经是调整后的宽度**：`mainAreaWidth = Math.floor(terminalWidth * 0.9)`
3. **消息组件重复设置宽度**：UserMessage等组件又设置了`width={terminalWidth}`
4. **双重宽度限制**：导致内容被过度压缩，文本超出边框

## 解决方案

### 1. 修复宽度计算逻辑

#### UserMessage组件 (`packages/cli/src/ui/components/messages/UserMessage.tsx`)

**核心修复：**
- **移除外层宽度限制**：不再设置`width={terminalWidth}`，让内容自然流动
- **简化宽度计算**：直接使用传入的已调整宽度，避免双重限制
- **预处理文本换行**：使用`forceWrapText`函数确保文本不会超出边界
- **移除Ink的wrap属性**：因为已经预处理了文本

**修复前的问题：**
```typescript
// 错误：双重宽度限制
<Box flexDirection="column" width={terminalWidth}>  // 第一层限制
  <Box width={maxMessageWidth}>                     // 第二层限制
```

**修复后：**
```typescript
// 正确：让内容自然流动，只在消息框层面限制宽度
<Box flexDirection="column">                        // 不设置宽度
  <Box width={maxMessageWidth}>                     // 只在这里限制
```

#### SafeMessageContainer组件修复

**问题：**
- 原本设置了固定宽度，导致和App.tsx的90%宽度冲突

**修复：**
```typescript
// 修复前：设置固定宽度
<Box width={safeWidth} {...containerProps}>

// 修复后：不设置宽度，让内容自然流动
<Box {...containerProps}>
```

#### GeminiMessage和GeminiMessageContent组件

**主要改进：**
- 更新`SafeMessageContainer`调用，移除不必要的宽度参数
- 保持`terminalWidth`传递给`MarkdownDisplay`的逻辑

### 2. 新增工具组件

#### TextContainer (`packages/cli/src/ui/components/shared/TextContainer.tsx`)

**功能：**
- 智能文本换行处理
- 支持保留空白字符选项
- 可配置的最大宽度限制

#### SafeMessageContainer (`packages/cli/src/ui/components/shared/SafeMessageContainer.tsx`)

**功能：**
- 防止内容溢出的安全容器
- 自动计算安全的容器宽度
- 可配置的最小/最大宽度限制

### 3. 工具函数增强

#### displayUtils.ts 新增函数

**smartTruncateText函数：**
```typescript
export function smartTruncateText(text: string, maxLines = 15): string {
  // 对于非常长的文本，保留开头和结尾
  const headLines = Math.floor(maxLines * 0.6);
  const tailLines = Math.floor(maxLines * 0.3);
  const remainingLines = totalLines - headLines - tailLines;
  
  const headPart = lines.slice(0, headLines).join('\n');
  const tailPart = lines.slice(-tailLines).join('\n');
  
  return `${headPart}\n\n... (${remainingLines} lines omitted) ...\n\n${tailPart}`;
}
```

**wrapLongLines函数：**
```typescript
export function wrapLongLines(text: string, maxWidth: number): string {
  // 智能换行处理，确保每行不超过指定宽度
}
```

### 4. MarkdownDisplay优化

**主要改进：**
- 为文本块添加`width`和`flexShrink`属性
- 确保内容不会超出指定的终端宽度

## 技术细节

### 宽度计算逻辑

```typescript
// UserMessage组件中的宽度计算
const borderAndPaddingWidth = 4; // 左右边框 + 左右padding
const userIndicatorWidth = 3; // 用户指示器的大概宽度
const marginWidth = 2; // 左右margin
const availableWidth = Math.max(
  (terminalWidth || 80) - borderAndPaddingWidth - userIndicatorWidth - marginWidth - prefixWidth,
  20 // 最小宽度保证
);
```

### 文本处理流程

1. **检测长文本**：使用`isLongText`函数判断是否需要特殊处理
2. **智能截断**：对超长文本使用`smartTruncateText`进行截断
3. **换行处理**：使用`TextContainer`组件进行智能换行
4. **安全容器**：使用`SafeMessageContainer`防止溢出

### Flex布局优化

```typescript
// 确保正确的flex行为
<Box flexGrow={1} flexShrink={1}>
  <TextContainer
    text={finalDisplayText}
    maxWidth={availableWidth}
    color={Colors.Gray}
    wrap={true}
  />
</Box>
```

## 预期效果

1. **布局稳定性**：消息框边框保持完整，不会出现破损
2. **文本显示**：长文本正确换行，不会超出容器边界
3. **用户体验**：保持良好的视觉对齐和可读性
4. **性能优化**：避免渲染超长内容导致的性能问题

## 测试建议

1. 测试超长单行文本的显示效果
2. 测试多行日志文本的布局
3. 测试混合内容（文本+代码块）的显示
4. 在不同终端宽度下测试布局稳定性

## 兼容性

- 保持与现有API的完全兼容
- 不影响其他消息类型的显示
- 渐进式增强，不会破坏现有功能
