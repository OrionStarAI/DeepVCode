# 输入框高度自动调整Bug修复文档

## Bug概述

**问题描述：** 在DeepCode项目中，用户手动打字时输入框无法根据内容长度自动增加可见区域的高度，导致长文本输入时后续内容不可见。

**影响范围：** 
- ✅ Ctrl+Enter强制换行正常工作
- ✅ 批量粘贴多行文本正常工作  
- ❌ 手动打字超过行宽时无法自动换行撑开高度

## 根本原因分析

### 问题定位过程

1. **初始假设错误：** 怀疑是Box组件的minHeight设置问题
2. **深入调试发现：** TextBuffer的视觉行计算完全正确，但只有1个视觉行
3. **关键发现：** `calculateVisualLayout`函数根本没有被调用

### 真正的根本原因

**位置：** `packages/cli/src/ui/components/shared/text-buffer.ts:1371-1384`

**问题代码：**
```typescript
// 🚀 性能优化：对于短文本跳过复杂布局计算
const totalTextLength = text.length;
if (totalTextLength < 500 && lines.length === 1 && !text.includes('\n')) {
  // 单行短文本的简化布局
  return {
    visualLines: lines, // 🚨 问题：直接返回原始lines，不做换行计算！
    visualCursor: [cursorRow, cursorCol],
    logicalToVisualMap: [[[0, 0] as [number, number]]],
    visualToLogicalMap: [[0, 0] as [number, number]]
  };
}
```

**问题分析：**
- **性能优化逻辑缺陷：** 只检查了字符长度(`text.length < 500`)，没有检查视觉宽度
- **错误跳过换行计算：** 当手动打字时，即使文本视觉宽度超过viewport，仍被误判为"短文本"
- **直接返回原始行：** 完全跳过了`calculateVisualLayout`的自动换行计算

### 为什么其他场景正常工作

1. **Ctrl+Enter换行：** 插入了真实的`\n`字符，不满足`!text.includes('\n')`条件
2. **批量粘贴：** 通常包含`\n`字符，同样不触发错误的优化逻辑
3. **手动打字：** 单行无`\n`字符，触发了错误的性能优化

## 解决方案

### 修复代码

**位置：** `text-buffer.ts:1371-1385`

**修复前：**
```typescript
if (totalTextLength < 500 && lines.length === 1 && !text.includes('\n')) {
  // 直接返回原始lines，不检查视觉宽度
  return { visualLines: lines, ... };
}
```

**修复后：**
```typescript
if (totalTextLength < 500 && lines.length === 1 && !text.includes('\n')) {
  // 检查单行是否需要换行：计算视觉宽度
  const singleLine = lines[0] || '';
  const visualWidth = Array.from(singleLine).reduce((sum, char) => sum + getCachedCharWidth(char), 0);
  
  // 只有在视觉宽度不超过viewport时才使用简化布局
  if (visualWidth <= state.viewportWidth) {
    return {
      visualLines: lines,
      visualCursor: [cursorRow, cursorCol],
      logicalToVisualMap: [[[0, 0] as [number, number]]],
      visualToLogicalMap: [[0, 0] as [number, number]]
    };
  }
}
// 视觉宽度超过viewport时，正常调用calculateVisualLayout
return calculateVisualLayout(lines, [cursorRow, cursorCol], state.viewportWidth);
```

### 修复原理

1. **保留性能优化：** 对于真正的短文本仍使用简化布局
2. **增加视觉宽度检查：** 使用`getCachedCharWidth`计算准确的视觉宽度
3. **条件化调用：** 只有在视觉宽度不超过viewport时才跳过换行计算
4. **确保换行计算：** 长行必定调用`calculateVisualLayout`进行正确的换行处理

## 相关文件修改

### 主要修改

1. **`text-buffer.ts`** - 修复性能优化逻辑的视觉宽度检查
2. **`InputPrompt.tsx`** - 确保使用`dynamicInputHeight`作为Box的minHeight

### 调试过程中的临时修改（已清理）

- 添加的调试日志已全部移除
- 恢复原始的渲染逻辑

## 测试验证

### 测试场景

1. **手动打字超过行宽** ✅ - 输入框自动撑开高度
2. **Ctrl+Enter换行** ✅ - 继续正常工作
3. **批量粘贴多行** ✅ - 继续正常工作
4. **短文本输入** ✅ - 性能优化仍然有效

### 验证指标

- 视觉行数计算正确
- 输入框高度与内容匹配
- 长文本内容完全可见
- 性能无明显下降

## 经验总结

### 关键教训

1. **性能优化需谨慎：** 过早优化可能引入难以发现的bug
2. **边界条件检查：** 优化逻辑必须考虑所有边界情况
3. **调试方法论：** 系统性排查比盲目假设更有效
4. **视觉vs逻辑：** 终端UI中字符长度≠视觉宽度

### 预防措施

1. **完整的测试用例：** 覆盖手动输入、粘贴、换行等所有场景
2. **性能优化审查：** 所有bypass逻辑都需要严格的边界条件检查
3. **调试工具完善：** 建立系统性的调试日志机制

## 相关Issue参考

- 输入框自动高度调整机制
- TextBuffer视觉布局计算
- 终端UI性能优化策略

---

**修复日期：** 2025-08-27  
**修复版本：** 当前开发版本  
**影响组件：** InputPrompt, TextBuffer  
**测试状态：** ✅ 已验证修复