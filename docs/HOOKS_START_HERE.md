# 🎯 DeepV Code Hooks 系统 - 开始这里

> 欢迎！本文件帮助你快速找到你需要的 Hooks 文档。

## ✨ 核心架构亮点

**Hooks 系统在 `packages/core` 中实现，所以：**

```
packages/core/src/hooks/ （Hooks 系统核心）
    ↑
    ├── packages/cli ──────────→ 自动享受 Hooks 能力
    │   (命令行界面)
    │
    └── packages/vscode-ui-plugin ──→ 自动享受 Hooks 能力
        (VS Code 插件)
```

**这意味着：**
- ✅ **CLI 用户** - 通过命令行自动享受 Hooks 安全控制
- ✅ **VSCode UI 用户** - 通过 VS Code 插件自动享受 Hooks 安全控制
- ✅ **企业管理** - 统一配置管理所有 Hooks，对所有客户端生效
- ✅ **无需重复实现** - Hooks 逻辑只在 core 实现一次

---

## 📖 根据你的角色选择

### 👨‍💼 我是企业决策者或架构师
**想了解**：Hooks 对企业有什么好处？安全性和合规性如何？

📄 **推荐阅读**：
1. [`DeepV_Code_Whitepaper.md`](./DeepV_Code_Whitepaper.md) - 第 8 章
2. [`HOOKS_DELIVERY_SUMMARY.md`](./HOOKS_DELIVERY_SUMMARY.md) - 了解完整项目

**需要 5 分钟？** → 看白皮书第 8.1-8.2 节

---

### 👨‍💻 我是开发者，想立即开始使用

**想做**：快速创建第一个 Hook，实现安全控制或审计日志

📄 **推荐阅读**（按顺序）：
1. [`docs/hooks-user-guide.md`](./docs/hooks-user-guide.md) - **第一步：5 分钟快速体验**
2. [`docs/hooks-examples.md`](./docs/hooks-examples.md) - **复用完整的 Hook 脚本**
3. [`docs/hooks-user-guide.md` - 常见场景部分](./docs/hooks-user-guide.md#常见场景实践)

**快速例子**：
```bash
# 第 1 步：创建 hooks 目录
mkdir -p .deepvcode/hooks

# 第 2 步：创建第一个 hook（见下方）
cat > .deepvcode/hooks/security-gate.sh << 'EOF'
#!/bin/bash
read INPUT
TOOL=$(echo "$INPUT" | jq -r '.tool_name')
if [[ "$TOOL" == "delete_file" ]]; then
  echo '{"decision":"deny","reason":"Delete blocked"}'
else
  echo '{"decision":"allow"}'
fi
EOF

# 第 3 步：设置权限
chmod +x .deepvcode/hooks/security-gate.sh

# 第 4 步：配置 settings.json
cat > .deepvcode/settings.json << 'EOF'
{
  "hooks": {
    "BeforeTool": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .deepvcode/hooks/security-gate.sh"
          }
        ]
      }
    ]
  }
}
EOF
```

完成！你的第一个 Hook 已就绪。

---

### 🏗️ 我是系统架构师，想要深入理解实现

**想知道**：Hooks 系统的 5 层架构是什么？如何集成到现有系统？为什么在 core 实现？

📄 **推荐阅读**（按顺序）：
1. **[`HOOKS_ARCHITECTURE.md`](./HOOKS_ARCHITECTURE.md)** - **架构设计说明（必读！）**
   - 为什么 Hooks 在 core 实现
   - 所有客户端如何自动继承
   - 架构优势（代码重用、统一配置、低维护成本）
   - 集成方法

2. [`docs/hooks-implementation.md`](./docs/hooks-implementation.md) - **完整的实现指南**
   - 5 层架构详解
   - 集成步骤

3. [`HOOKS_IMPLEMENTATION_SUMMARY.md`](./HOOKS_IMPLEMENTATION_SUMMARY.md) - **实现清单**
4. 源代码：`packages/core/src/hooks/`

**关键设计原则**：
- Hooks 在 core 实现 → CLI 和 VSCode UI 都继承
- 一份配置 → 两个客户端都生效
- 零代码重复 → 最低维护成本

---

### 🐛 我遇到了问题，需要调试 Hook

**问题**：Hook 没有执行，或返回意外结果

📄 **推荐阅读**：
1. [`docs/hooks-user-guide.md` - 调试和排查](./docs/hooks-user-guide.md#调试和排查)
2. [`docs/hooks-user-guide.md` - 常见问题 FAQ](./docs/hooks-user-guide.md#常见问题-faq)

**快速排查清单**：
- [ ] `settings.json` 中的 JSON 格式正确？ → 用 `jq . .deepvcode/settings.json` 验证
- [ ] Hook 脚本有执行权限？ → `chmod +x script.sh`
- [ ] Hook 脚本输出有效的 JSON？ → `cat test.json | bash script.sh | jq .`
- [ ] 使用了 `jq` 工具？ → `brew install jq`

---

### 📚 我想查看完整的示例代码库

**想要**：可直接复用的 Hook 脚本示例

📄 **推荐阅读**：
[`docs/hooks-examples.md`](./docs/hooks-examples.md)

**包含 7 个完整示例**：
1. 安全网关（禁止删除）
2. 权限控制（基于角色）
3. 审计日志（记录操作）
4. 提示增强（添加系统指导）
5. 工具参数优化（自适应 LLM）
6. 文件操作白名单
7. 会话生命周期跟踪

每个都包含完整的脚本、配置和使用说明。

---

### ❓ 我有具体问题

**推荐**：检查常见问题 FAQ

📄 **位置**：[`docs/hooks-user-guide.md#常见问题-faq`](./docs/hooks-user-guide.md#常见问题-faq)

**涵盖的问题**：
- Q1: Hook 支持哪些语言？
- Q2: Hook 输出格式有严格要求吗？
- Q3: Hook 可以阻止所有操作吗？
- Q4: Hook 失败会导致系统崩溃吗？
- Q5: 可以同时运行多个 Hook 吗？
- Q6: Hook 性能如何？
- Q7-Q10: 其他常见问题

---

## 🗺️ 完整文档地图

### 核心文档

| 文件 | 位置 | 内容 | 适合人群 |
|------|------|------|--------|
| 白皮书 Hooks 章节 | `DeepV_Code_Whitepaper.md` (第 8 章) | Hooks 概念、企业应用、架构 | 决策者、架构师 |
| 用户实践指南 | `docs/hooks-user-guide.md` | 快速开始、5 个场景、调试、FAQ | **开发者（首推）** |
| 完整示例库 | `docs/hooks-examples.md` | 7 个可复用的 Hook 脚本 | **开发者（代码参考）** |
| 实现指南 | `docs/hooks-implementation.md` | 5 层架构、集成步骤、完整说明 | 系统架构师 |

### 快速参考

| 文件 | 内容 | 何时使用 |
|------|------|--------|
| `cli-help-knowledge.md` (Q15) | CLI 集成帮助 | 在 CLI 中输入 `/help` 时查看 |
| `HOOKS_IMPLEMENTATION_SUMMARY.md` | 实现清单 | 了解项目完成度 |
| `HOOKS_DELIVERY_SUMMARY.md` | 交付总结 | 全面了解交付物 |

---

## ⚡ 快速链接

### 最常用的 3 个链接

1. **5 分钟快速开始** → [`docs/hooks-user-guide.md#5分钟快速体验`](./docs/hooks-user-guide.md#5分钟快速体验)
2. **可复用的 Hook 代码** → [`docs/hooks-examples.md`](./docs/hooks-examples.md)
3. **常见问题解答** → [`docs/hooks-user-guide.md#常见问题-faq`](./docs/hooks-user-guide.md#常见问题-faq)

### 按用途分类

**安全和权限**
- 安全网关：`docs/hooks-examples.md` - 场景 1
- 角色权限：`docs/hooks-examples.md` - 场景 4 或 `docs/hooks-user-guide.md` - 场景 3

**日志和审计**
- 审计日志：`docs/hooks-examples.md` - 场景 3 或 `docs/hooks-user-guide.md` - 场景 2

**AI 优化**
- 提示增强：`docs/hooks-examples.md` - 场景 2 或 `docs/hooks-user-guide.md` - 场景 4
- 参数优化：`docs/hooks-examples.md` - 场景 5 或 `docs/hooks-user-guide.md` - 场景 5

---

## 🎯 根据需求时间选择

### ⏱️ 只有 5 分钟

1. 快速概念：阅读本文件的本节
2. 快速体验：看 `docs/hooks-user-guide.md` 的第一个例子

### ⏱️ 有 30 分钟

1. 理解概念：`DeepV_Code_Whitepaper.md` 第 8 章
2. 学习实践：`docs/hooks-user-guide.md` 的快速开始部分
3. 复用示例：`docs/hooks-examples.md` 选择你需要的

### ⏱️ 有 1 小时或以上

1. 完整学习：按顺序读 `docs/hooks-user-guide.md` 所有部分
2. 深入理解：`docs/hooks-implementation.md` 了解架构
3. 创建自定义 Hook 或集成系统

---

## 📊 Hooks 系统快速事实

| 方面 | 信息 |
|------|------|
| **支持的事件** | 11 个（工具、提示、LLM、会话等） |
| **架构层级** | 5 层（Registry → Planner → Runner → Aggregator → Handler） |
| **支持的脚本语言** | 任何支持 stdin/stdout 的语言（Bash、Python、Node.js 等） |
| **输入/输出格式** | JSON（标准化、易于集成） |
| **默认超时** | 60 秒（可配置） |
| **执行模式** | 并行或顺序（支持 Hook 链式处理） |
| **配置位置** | `.deepvcode/settings.json` 或 `~/.deepv/settings.json` |
| **与 Gemini CLI 兼容** | ✅ 完全兼容，Hook 脚本无需修改 |

---

## 🚀 立即开始的 3 个步骤

### 第 1 步：创建 Hook 脚本

```bash
mkdir -p .deepvcode/hooks
cat > .deepvcode/hooks/my-hook.sh << 'EOF'
#!/bin/bash
read INPUT
echo '{"decision":"allow"}'
EOF
chmod +x .deepvcode/hooks/my-hook.sh
```

### 第 2 步：配置 settings.json

```bash
cat > .deepvcode/settings.json << 'EOF'
{
  "hooks": {
    "BeforeTool": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .deepvcode/hooks/my-hook.sh"
          }
        ]
      }
    ]
  }
}
EOF
```

### 第 3 步：测试

```bash
echo '{"session_id":"test","cwd":"/tmp","hook_event_name":"BeforeTool","timestamp":"2025-01-15T10:00:00Z","tool_name":"read_file","tool_input":{}}' | bash .deepvcode/hooks/my-hook.sh
```

预期输出：`{"decision":"allow"}`

✅ 完成！

---

## 💬 需要帮助？

| 问题类型 | 去哪里找 |
|---------|--------|
| 快速问题 | [`docs/hooks-user-guide.md#常见问题-faq`](./docs/hooks-user-guide.md#常见问题-faq) |
| 代码示例 | [`docs/hooks-examples.md`](./docs/hooks-examples.md) |
| 调试问题 | [`docs/hooks-user-guide.md#调试和排查`](./docs/hooks-user-guide.md#调试和排查) |
| 架构细节 | [`docs/hooks-implementation.md`](./docs/hooks-implementation.md) |
| 概念理解 | [`DeepV_Code_Whitepaper.md`](./DeepV_Code_Whitepaper.md) 第 8 章 |

---

## 📋 核心概念速览

**什么是 Hook？**
在关键系统事件触发时执行的自定义脚本。

**11 个关键事件：**
- 4 个工具相关（BeforeTool, AfterTool, 等）
- 4 个 LLM 相关（BeforeAgent, AfterAgent, 等）
- 1 个工具选择（BeforeToolSelection）
- 2 个会话相关（SessionStart, SessionEnd）
- 更多...

**关键特性：**
- ✅ 权限检查（BeforeTool）
- ✅ 审计日志（AfterTool）
- ✅ 提示优化（BeforeAgent）
- ✅ 参数调整（BeforeModel）
- ✅ 多 Hook 链式处理（顺序执行）

**配置位置：**
- `.deepvcode/settings.json`（项目级，优先）
- `~/.deepv/settings.json`（全局级）

---

## ✅ 你已准备好！

现在你知道：
- ✅ Hooks 是什么以及有什么用
- ✅ 去哪里找文档
- ✅ 如何快速开始
- ✅ 哪里找示例代码
- ✅ 如何获得帮助

**选择你需要的文档，开始你的 Hooks 之旅吧！** 🚀

---

**版本**：1.0
**最后更新**：2025-01-15
**快速导航**：你正在阅读它 ✨
