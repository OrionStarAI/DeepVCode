# 国际化 (i18n) 消息常量

## 📋 概述

本目录包含插件中所有用户可见的文本消息，使用结构化的常量对象进行管理。这种方式便于未来扩展多语言支持，同时保持代码的可维护性。

## 📁 文件结构

```
src/i18n/
├── messages.ts          # 所有消息常量定义
└── README.md           # 本文档
```

## 🎯 消息分类

### 1. `ROLLBACK_MESSAGES` - 回退功能相关消息

用于文件和消息的回退操作，包括：
- 回退操作日志消息
- 回退验证消息
- 文件回滚消息
- 用户界面消息
- 错误提示消息
- 状态描述消息
- 统计信息消息（支持参数化）

**示例：**
```typescript
import { ROLLBACK_MESSAGES } from '../i18n/messages';

// 简单消息
logger.info(`🔄 ${ROLLBACK_MESSAGES.FILE_ROLLBACK_STARTED}`);

// 带参数的消息
const count = 5;
logger.info(ROLLBACK_MESSAGES.STATS_FILES_ROLLED_BACK(count));
// 输出：已回滚 5 个文件
```

### 2. `EDIT_MESSAGES` - 编辑功能相关消息

用于消息编辑和重新生成功能。

**示例：**
```typescript
import { EDIT_MESSAGES } from '../i18n/messages';

logger.info(EDIT_MESSAGES.EDIT_STARTED);
```

### 3. `FILE_OPERATION_MESSAGES` - 文件操作相关消息

用于文件创建、修改、删除等操作的描述。

**示例：**
```typescript
import { FILE_OPERATION_MESSAGES } from '../i18n/messages';

logger.info(FILE_OPERATION_MESSAGES.RESTORING_DELETED_FILE('test.ts'));
// 输出：正在恢复被删除的文件: test.ts
```

### 4. `PLATFORM_MESSAGES` - 平台兼容性相关消息

用于描述平台检测和路径处理。

**示例：**
```typescript
import { PLATFORM_MESSAGES } from '../i18n/messages';

logger.info(PLATFORM_MESSAGES.PLATFORM_DETECTED('Windows'));
// 输出：检测到平台: Windows
```

### 5. `COMMON_MESSAGES` - 通用消息

包括操作状态、确认对话框、通用错误和日志级别标签。

**示例：**
```typescript
import { COMMON_MESSAGES } from '../i18n/messages';

logger.info(COMMON_MESSAGES.SUCCESS);
// 输出：操作成功
```

## 🔧 使用方法

### 方式 1：导入特定消息组

```typescript
import { ROLLBACK_MESSAGES } from '../i18n/messages';

logger.info(ROLLBACK_MESSAGES.ROLLBACK_COMPLETED);
```

### 方式 2：导入所有消息

```typescript
import { I18N_MESSAGES } from '../i18n/messages';

logger.info(I18N_MESSAGES.ROLLBACK.ROLLBACK_COMPLETED);
logger.info(I18N_MESSAGES.COMMON.SUCCESS);
```

### 方式 3：使用工具函数

```typescript
import { formatMessage, getErrorMessage, ROLLBACK_MESSAGES } from '../i18n/messages';

// 格式化带参数的消息
const message = formatMessage(
  ROLLBACK_MESSAGES.STATS_FILES_ROLLED_BACK,
  10
);

// 安全获取错误消息
try {
  // ... 一些操作
} catch (error) {
  const errorMsg = getErrorMessage(error, COMMON_MESSAGES.ERROR_UNKNOWN);
  logger.error(errorMsg);
}
```

## 📝 添加新消息

### 1. 在 `messages.ts` 中定义

```typescript
export const YOUR_FEATURE_MESSAGES = {
  // 简单消息
  OPERATION_STARTED: '操作已开始',
  OPERATION_COMPLETED: '操作已完成',
  
  // 带参数的消息
  ITEMS_PROCESSED: (count: number) => `已处理 ${count} 个项目`,
  USER_ACTION: (user: string, action: string) => `用户 ${user} 执行了 ${action}`,
} as const;
```

### 2. 导出消息组

```typescript
export const I18N_MESSAGES = {
  ROLLBACK: ROLLBACK_MESSAGES,
  EDIT: EDIT_MESSAGES,
  FILE_OPERATION: FILE_OPERATION_MESSAGES,
  PLATFORM: PLATFORM_MESSAGES,
  COMMON: COMMON_MESSAGES,
  YOUR_FEATURE: YOUR_FEATURE_MESSAGES,  // 添加你的消息组
} as const;
```

### 3. 在代码中使用

```typescript
import { YOUR_FEATURE_MESSAGES } from '../i18n/messages';

logger.info(YOUR_FEATURE_MESSAGES.OPERATION_STARTED);
logger.info(YOUR_FEATURE_MESSAGES.ITEMS_PROCESSED(42));
```

## 🌍 未来的多语言支持

当需要添加多语言支持时，可以采用以下策略：

### 方案 1：分文件存储

```
src/i18n/
├── messages/
│   ├── zh-CN.ts      # 中文（简体）
│   ├── en-US.ts      # 英文
│   └── ja-JP.ts      # 日文
├── index.ts          # 根据用户语言自动选择
└── README.md
```

### 方案 2：使用 i18n 库

集成 `vscode-nls` 或其他 i18n 库：

```typescript
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

const message = localize('rollback.started', '开始回退操作');
```

## 📊 当前已集成的文件

以下文件已经使用 i18n 消息：

### Backend (Extension)
- ✅ `src/extension.ts` - 回退操作处理器
- ✅ `src/services/fileRollbackService.ts` - 文件回滚服务

### Frontend (Webview)
暂无（前端消息主要在 UI 组件中硬编码，可根据需要迁移）

## ✨ 最佳实践

### 1. 消息命名规范

```typescript
// ✅ 好的命名：清晰、具体、一致
ROLLBACK_STARTED: '开始回退操作',
FILE_ROLLBACK_COMPLETED: '文件回滚完成',
ERROR_FILE_NOT_FOUND: '文件不存在',

// ❌ 避免的命名：模糊、不一致
START: '开始',
DONE: '完成',
ERR1: '错误1',
```

### 2. 参数化消息

```typescript
// ✅ 使用函数支持参数
STATS_FILES_ROLLED_BACK: (count: number) => `已回滚 ${count} 个文件`,

// ❌ 避免硬编码数值
STATS_FILES_ROLLED_BACK_ONE: '已回滚 1 个文件',
STATS_FILES_ROLLED_BACK_MULTIPLE: '已回滚多个文件',
```

### 3. 上下文清晰

```typescript
// ✅ 提供足够的上下文
ERROR_FILE_RESTORE_FAILED: '恢复文件失败',
ERROR_FILE_DELETE_FAILED: '删除文件失败',

// ❌ 上下文不足
ERROR_FAILED: '失败',
FILE_ERROR: '文件错误',
```

### 4. 保持简洁

```typescript
// ✅ 简洁明了
FILE_RESTORED: '文件已恢复',

// ❌ 过于冗长
FILE_HAS_BEEN_SUCCESSFULLY_RESTORED_TO_ORIGINAL_STATE: 
  '文件已经被成功地恢复到了它原始的状态',
```

## 🔍 消息使用统计

| 消息组 | 消息数量 | 已使用 | 使用率 |
|--------|---------|--------|--------|
| ROLLBACK_MESSAGES | 27 | 10 | 37% |
| EDIT_MESSAGES | 7 | 0 | 0% |
| FILE_OPERATION_MESSAGES | 11 | 4 | 36% |
| PLATFORM_MESSAGES | 8 | 0 | 0% |
| COMMON_MESSAGES | 20 | 0 | 0% |

**总计：** 73 条消息，14 条已使用

## 📚 相关文档

- [平台兼容性更新文档](../../PLATFORM_COMPATIBILITY_AND_ROLLBACK_UPDATE.md)
- [VS Code 国际化指南](https://code.visualstudio.com/api/references/vscode-api#l10n)

## 🤝 贡献指南

添加新消息时，请遵循：

1. **保持一致性**：遵循现有的命名和结构模式
2. **提供注释**：为每个消息组添加清晰的注释说明用途
3. **类型安全**：使用 `as const` 确保类型推断
4. **参数化**：对于需要动态内容的消息，使用函数形式
5. **测试验证**：确保编译通过且在实际使用中正常显示

---

**最后更新：** 2025-11-03  
**维护者：** DeepV Code Team

