# 横向确认界面布局优化

## 概述

当终端窗口高度很低时，传统的垂直确认选择界面可能无法在一页内完整显示，影响用户体验。我们实现了智能的横向布局切换功能，在窗口空间受限时自动切换到横向显示模式。

## 功能特性

### 自动布局切换

- **触发条件**: 
  - 窗口大小级别为 `TINY` (宽度≤50列 或 高度≤12行)
  - 可用终端高度 ≤ 8行

- **横向布局特点**:
  - 选项水平排列，节省垂直空间
  - 使用 `○` 和 `●` 符号表示未选中/选中状态
  - 支持左右箭头键(h/l)导航
  - 在极小窗口下隐藏数字标号

### 优化策略

#### 极小窗口 (TINY)
```
📝 Apply changes?
● ✓ Apply    ○ ✗ Cancel
```

#### 小窗口 (SMALL) - 垂直布局
```
Do you want to apply these changes?

● 1. Once
  2. Always  
  3. Cancel
```

#### 小窗口 (SMALL) - 横向布局
```
Do you want to apply these changes?
● Once    ○ Always    ○ Cancel
```

#### 正常窗口 (NORMAL) - 垂直布局
```
Do you want to apply these changes?

● 1. Once
  2. Always  
  3. Always (Project)
  4. Modify with Editor
  5. Cancel
```

#### 正常窗口 (NORMAL) - 横向布局  
```
Do you want to apply these changes?
● Once    ○ Always    ○ Project    ○ Edit    ○ Cancel
```

## 技术实现

### RadioButtonSelect 组件增强

新增支持参数：
- `layout`: `'vertical' | 'horizontal'` - 布局方向
- `horizontalSpacing`: `number` - 横向间距

### 键盘导航

- **垂直布局**: ↑↓ 箭头键或 k/j 键
- **横向布局**: ←→ 箭头键或 h/l 键
- **通用**: 数字键快速选择，回车确认，ESC取消

### 智能尺寸检测

使用 `useSmallWindowOptimization` Hook：
```typescript
const shouldUseHorizontalLayout = 
  smallWindowConfig.sizeLevel === WindowSizeLevel.TINY || 
  (availableTerminalHeight !== undefined && availableTerminalHeight <= 8);
```

## 用户体验改进

### 前：功能受限
```
正常窗口: Once | Always | Project | Edit | Cancel
横向布局: Apply | Cancel  ← 功能过度简化
```

### 后：功能对齐
```
正常窗口垂直: Once | Always | Project | Edit | Cancel  
正常窗口横向: Once | Always | Project | Edit | Cancel ← 功能完整
小窗口垂直:   Once | Always | Cancel
小窗口横向:   Once | Always | Cancel ← 与垂直布局对齐
极小窗口:     Apply | Cancel ← 只在极限空间下简化
```

### 空间利用优化
```
终端高度: 8行
┌─────────────────────────────────────────────┐
│ [隐藏Token统计框，节省3-4行空间]              │
│ 📝 Apply changes?                          │
│ ● Once    ○ Always    ○ Cancel             │ ← 横向布局
│ 使用←→或数字键选择，回车确认                 │
└─────────────────────────────────────────────┘
```

## 配置选项

- 在 `ToolConfirmationMessage` 中根据窗口大小自动决定
- 支持不同工具类型的特定优化：
  - Edit: 文件编辑确认
  - Exec: 命令执行确认  
  - MCP: MCP工具确认
  - Info: 信息类确认

## 测试覆盖

- 单元测试验证横向/垂直布局渲染
- 键盘导航测试
- 不同窗口尺寸下的布局切换测试

这个优化确保了即使在最受限的终端环境下，用户也能获得良好的确认交互体验。