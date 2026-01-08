# 小窗口CLI闪屏优化指南

## 🎯 问题概述

彩色/图形化CLI程序在小窗口环境下容易出现"闪屏"现象，主要原因包括：

1. **频繁的终端清屏操作** - `ansiEscapes.clearTerminal`
2. **持续的动画渲染** - Spinner、Token计数、短语循环等
3. **窗口调整时的剧烈刷新** - resize事件触发的重绘
4. **不必要的装饰元素更新** - 在有限空间中显示过多信息

## 🛠️ 实现的优化方案

### 1. 自适应窗口大小检测

**文件**: `packages/cli/src/ui/hooks/useSmallWindowOptimization.ts`

```typescript
// 窗口大小级别定义
export enum WindowSizeLevel {
  NORMAL = 'normal',  // 标准终端尺寸
  SMALL = 'small',    // IDE内置终端(≤30行) 或 窄屏(≤70列) 或 综合偏小
  TINY = 'tiny',      // 宽度≤50列 或 高度≤12行
}
```

### 2. 分级优化策略

#### 🔵 正常窗口 (NORMAL)
- 保持所有动画和装饰
- 300ms防抖延迟
- 完整功能显示

#### 🟡 小窗口 (SMALL) 
- 禁用大部分动画
- 隐藏部分装饰元素
- 600ms防抖延迟
- 简化Header/Footer

#### 🔴 极小窗口 (TINY)
- 完全禁用动画
- 隐藏所有装饰元素
- 1000ms防抖延迟  
- 极简显示模式
- 减少清屏操作

### 3. 具体优化措施

#### 🎭 动画优化

**Spinner动画**:
```typescript
// 小窗口下使用静态emoji代替旋转动画
if (shouldSkipAnimation(smallWindowConfig, 'spinner')) {
  return <Text key="spinner-static">⏳</Text>;
}
```

**Token计数动画**:
```typescript
// 跳过数字增长动画，直接显示最终值
if (shouldSkipAnimation(smallWindowConfig, 'token')) {
  setDisplayCount(targetCount); 
  return;
}
```

**短语循环**:
```typescript
// 延长切换间隔，减少刷新频率
const refreshInterval = smallWindowConfig.sizeLevel === 'normal' 
  ? PHRASE_CHANGE_INTERVAL_MS 
  : getOptimalRefreshInterval(smallWindowConfig.sizeLevel) * 3;
```

#### 🖥️ 渲染优化

**防抖延迟**:
- 正常窗口: 300ms
- 小窗口: 600ms  
- 极小窗口: 1000ms

**清屏控制**:
```typescript
// 极小窗口下减少清屏操作
if (smallWindowConfig.sizeLevel !== 'tiny') {
  stdout.write(ansiEscapes.clearTerminal);
}
```

#### 🎨 UI简化

**CompactHeader组件**:
- 极小窗口: 完全隐藏
- 小窗口: 显示核心信息（版本+模型）
- 正常窗口: 使用原Header

**CompactFooter组件**:
- 极小窗口: 完全隐藏
- 小窗口: 显示关键统计和操作提示
- 正常窗口: 使用原Footer

## 📊 性能改进预期

| 窗口大小 | 刷新频率 | 动画数量 | 清屏操作 | 用户体验 |
|---------|---------|---------|---------|---------|
| 极小    | -80%    | 0       | -90%    | 极简流畅 |
| 小      | -50%    | -70%    | -50%    | 简洁稳定 |
| 正常    | 基准    | 完整    | 正常    | 丰富完整 |

## 🔧 使用方法

### 自动检测和优化

优化是自动启用的，无需手动配置：

```typescript
// 在组件中使用
const smallWindowConfig = useSmallWindowOptimization();

// 检查是否应该跳过动画
if (shouldSkipAnimation(smallWindowConfig, 'spinner')) {
  // 使用静态显示
}

// 获取适合的刷新间隔
const interval = getOptimalRefreshInterval(smallWindowConfig.sizeLevel);
```

### 自定义阈值

如需调整窗口大小阈值：

```typescript
export const SMALL_WINDOW_THRESHOLDS = {
  MIN_WIDTH: 80,           // 小窗口宽度阈值
  MIN_HEIGHT: 30,          // 小窗口高度阈值
  TINY_WIDTH: 50,          // 极小窗口宽度阈值  
  TINY_HEIGHT: 12,         // 极小窗口高度阈值
  IDE_TERMINAL_HEIGHT: 30, // IDE内置终端高度特征
  MOBILE_LIKE_WIDTH: 70,   // 类移动端窄屏宽度
} as const;
```

### IDE内置终端优化

专门针对IDE内置终端的特殊处理：

- **VS Code集成终端**: 通常高度为10-15行，触发小窗口优化
- **IntelliJ内置终端**: 通常高度为12-30行，触发小窗口优化
- **其他IDE终端**: 高度≤30行时自动触发优化

在这些环境中，CLI会：
1. 减少清屏操作，避免IDE终端闪烁
2. 简化Header/Footer显示，节省垂直空间
3. 禁用大部分动画，提高流畅度
4. 延长防抖时间，减少频繁重绘

## 🧪 测试验证

建议在以下窗口尺寸下测试：

1. **极小窗口**: 35x8 字符
2. **小窗口**: 50x12 字符  
3. **IDE内置终端**: 80x15 字符 (VS Code典型尺寸)
4. **窄屏终端**: 65x25 字符 (类移动端)
5. **正常窗口**: 100x30 字符
6. **大窗口**: 120x40 字符

观察指标:
- 闪屏频率
- 响应延迟
- 动画流畅度
- 信息可读性

## 🔮 未来改进

1. **智能布局**: 根据内容长度动态调整显示
2. **用户偏好**: 允许用户自定义优化级别
3. **性能监控**: 实时监测渲染性能
4. **A/B测试**: 验证不同优化策略的效果

## 📝 注意事项

1. 优化主要针对**交互频繁**的CLI应用
2. 不会影响功能完整性，只是调整显示方式
3. 在正常窗口下保持原有体验
4. 可以通过环境变量禁用优化（如需要）

---

通过这些优化措施，DeepV Code CLI在小窗口环境下将显著减少闪屏现象，提供更流畅的用户体验。