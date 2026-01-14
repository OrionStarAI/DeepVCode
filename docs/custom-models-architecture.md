# Custom Models Storage Architecture

## 问题背景

### 并发冲突场景

**原始设计问题：**
当自定义模型和云端模型都存储在 `settings.json` 中时，会出现race condition：

```
时间线：
T1: 实例A启动 → 读取 settings.json
    { cloudModels: [...], customModels: [] }

T2: 实例B启动 → 使用 /add-model 添加自定义模型
    → 保存 settings.json
    { cloudModels: [...], customModels: [新模型] }

T3: 实例A的云端更新逻辑触发
    → 调用 setValue('cloudModels', [...])
    → 保存整个settings对象（基于T1时读取的旧数据）
    → settings.json 被覆盖
    { cloudModels: [...], customModels: [] }  ❌ 新模型丢失！
```

**影响范围：**
- ✅ 单实例运行：正常工作
- ❌ 多实例并发：自定义模型会被覆盖
- ❌ 云端更新频繁：配置不稳定

## 解决方案

### 架构设计：文件分离

```
~/.deepv/
├── settings.json           # 云端控制（云端模型、系统设置）
└── custom-models.json      # 用户控制（自定义模型配置）
```

**关键原则：**
1. **职责分离**：云端数据和用户数据分开存储
2. **避免冲突**：不同实例操作不同文件
3. **原子操作**：使用临时文件+重命名保证数据完整性

### 文件格式

#### custom-models.json
```json
{
  "models": [
    {
      "id": "custom-openai-gpt4",
      "displayName": "GPT-4 Turbo",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "${OPENAI_API_KEY}",
      "modelId": "gpt-4-turbo",
      "maxTokens": 128000,
      "enabled": true
    }
  ],
  "_metadata": {
    "version": "1.0",
    "lastModified": "2025-01-13T10:30:00Z"
  }
}
```

#### settings.json（部分）
```json
{
  "cloudModels": [
    {
      "name": "gemini-2.5-pro",
      "displayName": "Gemini 2.5 Pro",
      "creditsPerRequest": 6.0,
      "available": true,
      "maxToken": 1048576
    }
  ]
}
```

## 技术实现

### 核心模块：customModelsStorage.ts

```typescript
// 原子写入操作
export function saveCustomModels(models: CustomModelConfig[]): void {
  // 1. 验证配置
  validateAllModels(models);

  // 2. 准备数据（带metadata）
  const data = {
    $schema: 'https://deepvlab.ai/schemas/custom-models.json',
    models: models,
    _metadata: {
      version: '1.0',
      lastModified: new Date().toISOString(),
    }
  };

  // 3. 原子写入（防止文件损坏）
  const tempFile = filePath + '.tmp';
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fs.renameSync(tempFile, filePath);  // 原子操作
}
```

**关键特性：**
- ✅ **原子写入**：临时文件+重命名，避免写入中断导致文件损坏
- ✅ **数据验证**：保存前完整验证，拒绝无效配置
- ✅ **元数据追踪**：记录版本和修改时间
- ✅ **错误恢复**：失败时不影响原文件

### 读取流程

```typescript
// 优先级：custom-models.json > config > settings.json
function getCustomModels() {
  // 1. 从独立文件读取（推荐）
  try {
    return loadCustomModels();  // ~/.deepv/custom-models.json
  } catch (error) {
    console.warn('Failed to load from file');
  }

  // 2. 降级：从config读取（兼容性）
  if (config) {
    return config.getCustomModels();
  }

  // 3. 降级：从settings读取（向后兼容）
  if (settings) {
    return settings.merged.customModels;
  }

  return [];
}
```

### 写入流程

```typescript
// 只写入独立文件
function saveCustomModel(model: CustomModelConfig) {
  addOrUpdateCustomModel(model);  // 直接写入 custom-models.json
  // ❌ 不再修改 settings.json
}
```

## 并发安全性分析

### 场景1：多实例同时配置（极少见）

```
实例A: /add-model → 写入 custom-models.json
实例B: /add-model → 写入 custom-models.json
```

**结果：**后写入的覆盖先写入的（与原来一致）

**改进空间：**可以添加文件锁机制（如果未来需要）

### 场景2：配置时云端更新（最常见）

```
实例A: /add-model → 写入 custom-models.json
实例A: 云端更新  → 写入 settings.json (cloudModels字段)
```

**结果：**✅ 两个文件独立，互不影响

### 场景3：多实例运行，一个配置

```
实例A: 正常运行
实例B: /add-model → 写入 custom-models.json
实例A: 云端更新  → 写入 settings.json
```

**结果：**✅ 完美隔离，无冲突

## 数据迁移

### 向后兼容策略

**情况1：旧版本升级**
```typescript
// 首次启动时自动迁移
if (settings.customModels && settings.customModels.length > 0) {
  // 从 settings.json 迁移到 custom-models.json
  saveCustomModels(settings.customModels);
  // 可选：清理 settings.json 中的 customModels 字段
}
```

**情况2：新旧版本混用**
```typescript
// 读取时兼容两个来源
const models = [
  ...loadCustomModels(),           // 新位置
  ...(settings.customModels || []) // 旧位置（兼容）
];
```

## 性能对比

| 操作 | 原方案 | 新方案 | 改进 |
|------|--------|--------|------|
| 读取云端模型 | 读settings.json (1次) | 读settings.json (1次) | 无变化 |
| 读取自定义模型 | 读settings.json (1次) | 读custom-models.json (1次) | 无变化 |
| 保存云端模型 | 写settings.json (整个文件) | 写settings.json (整个文件) | 无变化 |
| 保存自定义模型 | 写settings.json (整个文件) | 写custom-models.json (小文件) | ✅ 更快 |
| 并发安全性 | ❌ 可能冲突 | ✅ 完全隔离 | ✅ 大幅提升 |

## 文件大小对比

**settings.json（典型大小）：**
- 基础配置：~2KB
- 云端模型：~5KB (10-20个模型)
- 总计：~7KB

**custom-models.json（典型大小）：**
- 用户配置：~1KB (2-5个模型)
- 元数据：~100B

**优势：**
- ✅ 自定义模型文件更小，写入更快
- ✅ 不影响settings.json的读写
- ✅ 更清晰的职责划分

## 安全性增强

### 原子写入防损坏

```typescript
// 错误的写入（可能损坏文件）
fs.writeFileSync(file, data);  // ❌ 写入中断 → 文件损坏

// 正确的原子写入
fs.writeFileSync(tempFile, data);
fs.renameSync(tempFile, file);  // ✅ 原子操作，不会损坏
```

### 数据验证

```typescript
// 保存前验证
for (const model of models) {
  const errors = validateCustomModelConfig(model);
  if (errors.length > 0) {
    throw new Error(`Invalid config: ${errors.join(', ')}`);
  }
}
```

## API设计

### 存储层API

```typescript
// 基础操作
loadCustomModels(): CustomModelConfig[]
saveCustomModels(models: CustomModelConfig[]): void

// 便捷操作
addOrUpdateCustomModel(model: CustomModelConfig): void
deleteCustomModel(modelId: string): boolean
getCustomModel(modelId: string): CustomModelConfig | undefined
customModelExists(modelId: string): boolean

// 文件路径
getCustomModelsFilePath(): string
```

### UI层集成

```typescript
// 向导完成时保存
handleWizardComplete(config: CustomModelConfig) {
  addOrUpdateCustomModel(config);  // 直接保存到独立文件
}

// 读取时合并
function getAvailableModels() {
  const cloudModels = getCloudModels();      // from settings.json
  const customModels = loadCustomModels();   // from custom-models.json
  return [...cloudModels, ...customModels];
}
```

## 测试场景

### 单元测试

```typescript
describe('customModelsStorage', () => {
  test('atomic write prevents corruption', () => {
    // 模拟写入中断
    // 验证原文件未损坏
  });

  test('validation rejects invalid configs', () => {
    // 无效配置应该抛出错误
  });

  test('concurrent writes handle correctly', () => {
    // 多个保存操作，验证最终一致性
  });
});
```

### 集成测试

```typescript
describe('multi-instance scenarios', () => {
  test('instance A updates cloud, instance B adds custom', () => {
    // 两个操作不应该冲突
  });

  test('backward compatibility with settings.json', () => {
    // 旧版本配置应该能正常读取
  });
});
```

## 未来改进

### 可选：文件锁机制

如果需要更严格的并发控制：

```typescript
import * as lockfile from 'proper-lockfile';

export async function saveCustomModelsWithLock(models: CustomModelConfig[]) {
  const release = await lockfile.lock(filePath);
  try {
    saveCustomModels(models);
  } finally {
    await release();
  }
}
```

### 可选：增量更新

当前：每次保存整个文件
未来：可以实现增量更新（如果模型很多时）

### 可选：版本控制

记录配置历史，支持回滚：

```typescript
// custom-models.json (带历史记录)
{
  "models": [...],
  "_metadata": {
    "version": "1.0",
    "lastModified": "2025-01-14T10:30:00Z"
  },
  "_history": [
    { "timestamp": "...", "models": [...] }
  ]
}
```

## 总结

### 关键收益

✅ **消除并发冲突**：多实例安全运行
✅ **云端更新隔离**：云端模型更新不影响自定义模型
✅ **原子操作保护**：防止文件损坏
✅ **清晰职责划分**：配置来源一目了然
✅ **向后兼容**：支持从settings.json平滑迁移

### 设计原则

1. **Single Responsibility**：每个文件只负责一类配置
2. **Atomic Operations**：关键操作使用原子性保证
3. **Fail-Safe**：错误处理和降级策略
4. **Backward Compatible**：兼容旧版本配置

### 文件职责表

| 文件 | 控制方 | 更新频率 | 内容 |
|------|---------|----------|------|
| `settings.json` | 云端+用户 | 高（云端同步） | 系统设置、云端模型 |
| `custom-models.json` | 用户 | 低（手动配置） | 自定义模型配置 |

这种设计确保了即使在复杂的多实例场景下，用户的自定义模型配置也能稳定可靠。
