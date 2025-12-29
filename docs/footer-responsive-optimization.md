# Footer响应式显示优化

## 📋 概述

为了优化小屏幕和窄终端下的用户体验，Footer组件现在支持响应式显示，会根据终端宽度自动调整显示内容的详细程度。

## 🎯 优化目标

解决窄屏幕下Footer信息过载的问题，在保留关键信息的同时，简化次要信息的显示。

## 📊 显示级别

### Level 1: 完整显示 (≥80列)

**示例**：
```
v1.0.161(22.19.0) | (92% context left) | Model: Claude-Sonnet-4.5
```

**显示内容**：
- ✅ 完整版本号 + Node.js版本
- ✅ 完整上下文百分比文本
- ✅ 完整模型名称（带"Model:"标签）

### Level 2: 简化显示 (60-79列)

**示例**：
```
v1.0.161 | 92% | Sonnet-4.5
```

**显示内容**：
- ✅ 版本号（不含Node.js版本）
- ✅ 上下文百分比（仅数字）
- ✅ 简化的模型名称（移除供应商前缀）

**优化措施**：
- ❌ 移除Node.js版本号（次要信息）
- ❌ 移除"context left"文本
- ❌ 移除"Model:"标签
- ✂️ 缩短模型名称

## 🔧 技术实现

### 文件结构

```
packages/cli/src/ui/
├── components/
│   └── Footer.tsx              # Footer组件（已更新）
└── utils/
    ├── footerUtils.ts          # 工具函数
    └── footerUtils.test.ts     # 单元测试
```

### 核心函数

#### `getFooterDisplayConfig(terminalWidth: number)`

根据终端宽度返回显示配置：

```typescript
interface FooterDisplayConfig {
  showNodeVersion: boolean;      // 是否显示Node版本
  simplifyContext: boolean;      // 是否简化上下文显示
  simplifyModel: boolean;        // 是否简化模型名称
  level: 'full' | 'compact';     // 显示级别
}
```

#### `getShortVersion(version: string, includeNodeVersion: boolean)`

智能缩短版本号显示：
- `includeNodeVersion=true`: `v1.0.161(22.19.0)`
- `includeNodeVersion=false`: `v1.0.161`

#### `getShortModelName(modelName: string, simplified: boolean)`

智能缩短模型名称：
- `simplified=false`: `Claude-3.5-Sonnet`
- `simplified=true`: `Sonnet`

支持的模型供应商：
- **Claude**: `Claude-3.5-Sonnet` → `Sonnet`
- **Gemini**: `Gemini-2.0-Flash` → `Flash`
- **GPT**: `GPT-4` → `4`
- **OpenAI**: `OpenAI-GPT4` → `GPT4`

#### `getContextDisplay(percentage: number, simplified: boolean)`

格式化上下文显示：
- `simplified=false`: `(92% context left)`
- `simplified=true`: `92%`

## 📝 使用示例

### 在Footer组件中使用

```tsx
import { getFooterDisplayConfig, getShortVersion, getShortModelName, getContextDisplay } from '../utils/footerUtils.js';

export const Footer: React.FC<FooterProps> = ({
  version,
  model,
  promptTokenCount,
  terminalWidth = 80,
  ...props
}) => {
  // 获取显示配置
  const displayConfig = getFooterDisplayConfig(terminalWidth);

  // 计算显示内容
  const versionDisplay = version ? getShortVersion(version, displayConfig.showNodeVersion) : null;
  const contextPercentage = ((1 - percentage) * 100).toFixed(0);
  const contextDisplay = getContextDisplay(parseInt(contextPercentage), displayConfig.simplifyContext);
  const modelShortDisplay = getShortModelName(modelDisplay, displayConfig.simplifyModel);

  return (
    <Box>
      <Text>{versionDisplay}</Text>
      <Text>{contextDisplay}</Text>
      <Text>{modelShortDisplay}</Text>
    </Box>
  );
};
```

## 🧪 测试

运行单元测试：

```bash
npm test -- footerUtils.test.ts
```

测试覆盖：
- ✅ 版本号缩短逻辑
- ✅ 模型名称简化（多种供应商）
- ✅ 上下文显示格式化
- ✅ 显示配置生成
- ✅ 集成测试（完整显示流程）

## 🎨 视觉效果对比

### 宽屏幕 (100列)
```
┌────────────────────────────────────────────────────────────────────┐
│ v1.0.161(22.19.0) | (92% context left) | Model: Claude-Sonnet-4.5 │
└────────────────────────────────────────────────────────────────────┘
```

### 中等宽度 (70列)
```
┌──────────────────────────────────────────────┐
│ v1.0.161 | 92% | Sonnet-4.5                  │
└──────────────────────────────────────────────┘
```

## 📐 阈值说明

| 终端宽度 | 显示级别 | Node版本 | 上下文文本 | 模型前缀 |
|---------|---------|---------|-----------|---------|
| ≥80列   | 完整     | ✅      | ✅        | ✅      |
| 60-79列 | 简化     | ❌      | ❌        | ❌      |

## 🔄 与现有优化的整合

此优化与现有的小窗口优化系统完美整合：

- **useSmallWindowOptimization**: 控制整体UI简化
- **Footer响应式**: 专门优化Footer信息密度

两者可以协同工作，在极小窗口下提供最佳体验。

## 🚀 未来改进方向

1. **动态阈值**: 根据实际内容长度动态调整阈值
2. **用户配置**: 允许用户自定义显示级别
3. **更多信息**: 在极窄屏幕下支持信息轮播
4. **国际化**: 支持不同语言下的智能缩写

## 📚 相关文档

- [小窗口优化指南](./small-window-optimization.md)
- [Footer组件文档](../packages/cli/src/ui/components/Footer.tsx)
- [终端尺寸Hook](../packages/cli/src/ui/hooks/useTerminalSize.ts)

---

**更新日期**: 2025-09-30
**版本**: 1.0.0
