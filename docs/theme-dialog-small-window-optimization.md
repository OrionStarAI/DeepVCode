# 主题选择对话框小窗口优化

## 概述

主题选择对话框在小高度终端下进行了全面的布局优化，确保用户在任何终端尺寸下都能正常选择和预览主题。

## 优化策略

### 响应式显示项数

根据窗口大小动态调整每屏显示的主题选项数量：

| 窗口大小 | 显示项数 | 说明 |
|---------|---------|------|
| 正常 (NORMAL) | 8项 | 完整显示，最佳体验 |
| 小 (SMALL) | 5项 | 适中显示，保持可用性 |
| 极小 (TINY) | 3项 | 最小化显示，确保基本功能 |

### 渐进式布局简化

#### 极小窗口 (≤50列 或 ≤12行)
```
┌────────────────────────────────────────────────┐
│ > Select Theme                                 │
│ ● dark-modern                                  │
│   light-modern                                 │  
│   high-contrast-dark                           │
│ (回车选择，ESC退出)                            │
└────────────────────────────────────────────────┘
```
- ✅ 隐藏预览面板
- ✅ 隐藏scope选择
- ✅ 隐藏数字标号和滚动箭头
- ✅ 最小化padding
- ✅ 简化提示文本

#### 小窗口 (≤80列 或 ≤30行)
```
┌───────────────────────────────────────────────────────────┐
│ > Select Theme                    │ Preview               │
│ ● dark-modern                     │ def fibonacci(n):     │
│   light-modern                    │     a, b = 0, 1       │
│   high-contrast-dark              │                       │
│   solarized-dark                  │                       │
│   monokai                         │                       │
│ (按回车键选择)                                            │
└───────────────────────────────────────────────────────────┘
```
- ✅ 保留简化预览面板
- ✅ 可能隐藏scope选择(根据高度)
- ✅ 隐藏数字标号和滚动箭头
- ✅ 减少padding

#### 正常窗口 (>80列 且 >30行)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ > Select Theme                    │ Preview                               │
│ ● 1. dark-modern                  │ ┌─────────────────────────────────────┐ │
│   2. light-modern                 │ │ # function                          │ │
│   3. high-contrast-dark           │ │ def fibonacci(n):                   │ │
│   4. high-contrast-light          │ │     a, b = 0, 1                     │ │
│   5. solarized-dark               │ │     for _ in range(n):              │ │
│   6. solarized-light              │ │         a, b = b, a + b             │ │
│   7. monokai                      │ │     return a                        │ │
│   8. dracula                      │ │                                     │ │
│                                   │ │ --- a/util.py                       │ │
│   应用到                          │ │ +++ b/util.py                       │ │
│ ● 1. 用户设置                     │ │ - print("Hello, " + name)           │ │
│   2. 工作区设置                   │ │ + print(f"Hello, {name}!")          │ │
│                                   │ └─────────────────────────────────────┘ │
│ (按回车键选择，按Tab键切换焦点)                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```
- ✅ 完整预览面板（代码+diff）
- ✅ 显示scope选择
- ✅ 显示数字标号和滚动箭头
- ✅ 完整padding和边距

## 技术实现

### 智能显示控制

```typescript
const getMaxItemsToShow = () => {
  switch (smallWindowConfig.sizeLevel) {
    case WindowSizeLevel.TINY: return 3;
    case WindowSizeLevel.SMALL: return 5; 
    case WindowSizeLevel.NORMAL: return 8;
  }
};
```

### 动态布局切换

```typescript
// 极小窗口的激进优化
if (smallWindowConfig.sizeLevel === WindowSizeLevel.TINY) {
  showPreview = false;      // 隐藏预览
  showScopeSelection = false; // 隐藏scope选择
  includePadding = false;   // 最小化padding
}
```

### 响应式预览内容

```typescript
// 小窗口：简化预览
{smallWindowConfig.sizeLevel === WindowSizeLevel.SMALL ? (
  <Box>
    <Text color={Colors.AccentBlue}>def</Text>
    <Text> fibonacci(n):</Text>
    <Text>    a, b = </Text>
    <Text color={Colors.AccentYellow}>0</Text>
    <Text>, </Text>
    <Text color={Colors.AccentYellow}>1</Text>
  </Box>
) : (
  // 正常窗口：完整预览（代码+diff）
  // ...
)}
```

## 用户体验改进

### 功能可达性保证
- 即使在最小的终端窗口下，用户仍能浏览和选择主题
- 核心功能（主题选择）从不被隐藏
- 预览功能在空间足够时自动恢复

### 视觉层次优化
- 主题列表始终保持焦点
- 预览内容在小窗口下不干扰主要操作
- 提示文本根据可用功能动态调整

### 交互流畅性
- 滚动导航在小窗口下更高效（无箭头干扰）
- 数字快捷键在空间充足时可用
- Tab切换在功能可用时显示

## 性能优化

- 根据窗口大小减少渲染的DOM元素
- 简化预览内容计算
- 动态调整布局计算的复杂度

这种优化确保主题选择功能在IDE内置终端、小分屏窗口等受限环境下仍然高效可用。