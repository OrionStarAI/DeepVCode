# Custom SubAgent 自定义子代理

## 概述

DeepV Code 支持自定义 SubAgent（子代理），允许用户定义具有特定系统提示和工具配置的专业化 AI 代理。SubAgent 可以同步或异步执行，异步模式下不会阻塞主 Agent 和用户的进一步交互。

## 内置 SubAgent

DeepV Code 提供以下内置 SubAgent：

| ID | 名称 | 描述 |
|:---|:---|:---|
| `builtin:code_analysis` | Code Analysis Expert | 深度代码探索和架构分析 |
| `builtin:refactoring` | Refactoring Expert | 代码重构和质量改进 |
| `builtin:testing` | Testing Expert | 测试创建和覆盖率分析 |
| `builtin:documentation` | Documentation Expert | 文档生成和改进 |

## 使用 SubAgent

### 通过 AI 对话调用

在与 AI 对话时，使用 `custom_task` 工具：

```
# 自动选择最匹配的 SubAgent
"使用 custom_task 分析这个项目的架构"

# 指定特定的 SubAgent
"使用 custom_task 并设置 subagent_id='builtin:refactoring' 来重构这段代码"

# 异步执行（后台运行，不阻塞）
"使用 custom_task 并设置 async=true 在后台分析代码库"
```

### 通过 CLI 命令管理

```bash
# 列出所有可用的 SubAgent
/subagent list

# 查看异步任务状态
/subagent tasks

# 取消正在运行的异步任务
/subagent cancel <task-id>

# 重新加载自定义配置
/subagent reload

# 显示帮助信息
/subagent help
```

## 自定义 SubAgent 配置

### 配置文件位置

在项目根目录创建 `.deepvcode/subagents.json` 文件。

### 配置格式

```json
{
  "subAgents": [
    {
      "id": "security-audit",
      "name": "Security Auditor",
      "description": "分析代码中的安全漏洞",
      "icon": "🔒",
      "systemPrompt": "你是一个专业的安全审计专家...",
      "allowedTools": ["read_file", "grep", "glob"],
      "excludedTools": ["shell", "write_file"],
      "defaultMaxTurns": 25,
      "enabled": true,
      "triggers": [
        { "type": "keyword", "value": "security", "priority": 3 },
        { "type": "keyword", "value": "vulnerability", "priority": 2 }
      ]
    }
  ]
}
```

### 配置字段说明

| 字段 | 类型 | 必需 | 说明 |
|:---|:---|:---:|:---|
| `id` | string | ✅ | 唯一标识符（不能与内置 ID 冲突） |
| `name` | string | ✅ | 显示名称 |
| `description` | string | ✅ | 功能描述 |
| `systemPrompt` | string | ✅ | 系统提示词，定义 SubAgent 的角色和行为 |
| `icon` | string | ❌ | 图标（emoji） |
| `allowedTools` | string[] | ❌ | 允许使用的工具白名单 |
| `excludedTools` | string[] | ❌ | 排除的工具黑名单 |
| `defaultMaxTurns` | number | ❌ | 默认最大对话轮数（1-50） |
| `enabled` | boolean | ❌ | 是否启用（默认 true） |
| `triggers` | array | ❌ | 自动匹配触发条件 |

### 触发条件配置

```json
{
  "triggers": [
    {
      "type": "keyword",      // 关键词匹配
      "value": "security",    // 匹配值
      "priority": 3           // 优先级（越高越优先）
    },
    {
      "type": "pattern",      // 正则表达式匹配
      "value": "vuln(erability)?",
      "priority": 2
    },
    {
      "type": "file_extension", // 文件扩展名匹配
      "value": ".py",
      "priority": 1
    }
  ]
}
```

## 异步执行模式

### 特性

- **非阻塞**: 异步 SubAgent 在后台运行，不会阻塞主 Agent 和用户交互
- **进度跟踪**: 可以通过 `/subagent tasks` 查看执行进度
- **可取消**: 可以随时取消正在运行的异步任务
- **结果回调**: 完成后自动通知结果

### 使用场景

- 长时间运行的代码分析任务
- 大规模重构操作
- 后台文档生成
- 并行执行多个独立任务

### 示例

```
# 启动异步任务
> 使用 custom_task 并设置 async=true 分析整个项目的依赖关系

AI: SubAgent 任务已在后台启动（任务 ID: task-xxx）。
    您可以继续其他工作，任务完成后会收到通知。

# 查看任务状态
> /subagent tasks

# 取消任务
> /subagent cancel task-xxx
```

## 编写系统提示词的最佳实践

### 基本结构

```
你是一个专业的 [角色描述]。

**重要规则: 如果你的回复中没有调用任何工具，系统会自动认为任务完成并结束执行。**

# 你的主要职责
[描述 SubAgent 的主要任务和目标]

# 核心原则
- [原则 1]
- [原则 2]
- ...

# 工作流程
1. [步骤 1]
2. [步骤 2]
...

# 输出格式
[描述期望的输出格式和结构]
```

### 注意事项

1. **明确角色**: 清楚定义 SubAgent 的专业领域
2. **限定范围**: 使用 `allowedTools` 和 `excludedTools` 限制工具使用
3. **设置轮数**: 根据任务复杂度合理设置 `defaultMaxTurns`
4. **提供示例**: 在系统提示中包含输出示例

## 示例配置

### Python 代码审查专家

```json
{
  "id": "python-reviewer",
  "name": "Python Code Reviewer",
  "description": "专业的 Python 代码审查，包括风格、性能和最佳实践",
  "icon": "🐍",
  "systemPrompt": "你是一个资深的 Python 代码审查专家...",
  "allowedTools": ["read_file", "grep", "glob", "ls"],
  "defaultMaxTurns": 30,
  "triggers": [
    { "type": "file_extension", "value": ".py", "priority": 2 },
    { "type": "keyword", "value": "python", "priority": 1 }
  ]
}
```

### API 文档生成器

```json
{
  "id": "api-documenter",
  "name": "API Documentation Generator",
  "description": "自动生成 REST API 文档",
  "icon": "📚",
  "systemPrompt": "你是一个 API 文档专家...",
  "allowedTools": ["read_file", "write_file", "grep", "glob"],
  "defaultMaxTurns": 40,
  "triggers": [
    { "type": "keyword", "value": "api doc", "priority": 3 },
    { "type": "keyword", "value": "swagger", "priority": 2 }
  ]
}
```

## 与原有 task 工具的关系

- **task 工具**: 原有的内置代码分析专家，保持向后兼容
- **custom_task 工具**: 新的扩展工具，支持自定义和内置 SubAgent，支持异步执行

两者可以共存，`task` 工具适用于快速代码分析，`custom_task` 工具提供更丰富的功能和自定义能力。

## 故障排除

### SubAgent 未加载

1. 检查配置文件路径: `.deepvcode/subagents.json`
2. 验证 JSON 格式是否正确
3. 运行 `/subagent reload` 重新加载配置
4. 检查 `enabled` 字段是否为 `true`

### 异步任务无响应

1. 使用 `/subagent tasks` 检查任务状态
2. 确认网络连接正常
3. 检查 AI 模型配额是否充足
4. 必要时使用 `/subagent cancel <id>` 取消任务

### 工具调用失败

1. 确认 `allowedTools` 中包含所需工具
2. 检查工具是否被 `excludedTools` 排除
3. 验证系统提示词是否正确引导工具使用

## 相关文档

- [Hooks 钩子机制](./hooks-user-guide.md)
- [MCP 协议支持](./mcp-improvements-summary.md)
- [技能系统](./skills-usage.md)
