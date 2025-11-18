# Skills 脚本使用问题修复

**日期**: 2025-01-18
**问题**: AI 自己写脚本而不是调用 Skill 提供的现成脚本
**状态**: ✅ 已修复

---

## 问题分析

### 原始问题

根据用户反馈和 Claude Code 官方文档（https://code.claude.com/docs/zh-CN/skills），Skills 系统的设计意图是：

**正确行为**:
```
用户: 我需要处理 PDF 表单
AI: 好的，我看到有 pdf skill，它提供了 fill_fillable_fields.py 脚本
    → 执行: python3 /path/to/scripts/fill_fillable_fields.py input.pdf data.json output.pdf
```

**错误行为（修复前）**:
```
用户: 我需要处理 PDF 表单
AI: 好的，让我写一个 Python 脚本来处理 PDF...
    → 自己编写新代码
    → 浪费 Token
    → 可能有 bug
```

### 根本原因

1. **Level 1 元数据不足**
   - 原实现只注入 skill name 和 description
   - 没有告诉 AI 有哪些可用脚本
   - 没有明确"使用脚本而不是写代码"的指令

2. **System Prompt 缺少关键指示**
   - 没有强调"优先使用现成脚本"
   - 没有说明如何执行脚本（`run_shell_command`）
   - 没有解释 Token 优势（脚本代码不加载）

3. **Level 2 加载不明确**
   - 缺少"如何使用脚本"的详细示例
   - 没有提供具体的命令格式
   - AI 不清楚什么时候应该请求完整指令

---

## 修复方案

### 1. 增强 Level 1 元数据注入

**文件**: `packages/cli/src/services/skill/skill-context-injector.ts`

**修改**: `formatMetadataContext()` 方法

**新增内容**:
```markdown
- **skill-name**: skill description
  - Allowed Tools: run_shell_command, read_file
  - 📜 **Scripts Available**: fill_form.py, extract_data.py
  - ⚠️  **Use these scripts** instead of writing new code
  - 📚 Reference docs available (2 files)
  - 💡 For full instructions: ask about "skill-name" or mention this skill
```

**关键改进**:
- ✅ 明确列出可用脚本文件名
- ✅ 强调"使用脚本而不是写代码"
- ✅ 提示如何获取详细指令

### 2. 改进启动时加载策略

**文件**: `packages/cli/src/services/skill/skill-context-injector.ts`

**修改**: `injectStartupContext()` 方法

**变更**:
```typescript
// 修改前: 只加载 Level 1 (METADATA)
const skills = await this.skillLoader.loadEnabledSkills(SkillLoadLevel.METADATA);

// 修改后: 加载到 Level 3 (RESOURCES) 但不加载脚本内容
const skills = await this.skillLoader.loadEnabledSkills(SkillLoadLevel.RESOURCES);
```

**Token 成本**:
- 脚本列表: ~50 tokens/skill (只有文件名)
- 脚本代码: 0 tokens（不加载）
- 总增加: ~50 tokens/skill
- **值得！** 因为能避免 AI 写几百行新代码

### 3. 强化 Level 2 完整指令

**文件**: `packages/cli/src/services/skill/skill-context-injector.ts`

**修改**: `formatFullContent()` 方法

**新增部分**:
```markdown
## 📜 Available Scripts

**⚠️  IMPORTANT: Use these ready-made scripts instead of writing new code.**

### fill_form.py
Fill PDF form fields with provided data

**Type**: python
**Path**: `/path/to/scripts/fill_form.py`

**Usage Example**:
\`\`\`bash
python3 "/path/to/scripts/fill_form.py" <args>
\`\`\`

**To execute**: Use the `run_shell_command` tool with the above command.
```

**关键改进**:
- ✅ 明确的使用示例
- ✅ 具体的命令格式
- ✅ 强调使用 `run_shell_command` 工具

### 4. 更新 System Prompt 指令

**文件**: `packages/cli/src/services/skill/skills-integration.ts`

**修改**: `initializeSkillsContext()` 中的格式化部分

**新增指示**:
```markdown
**How to use Skills:**

1. **Check for relevant skills**: When a user's task matches a skill's description, use that skill
2. **Use existing scripts first**: If a skill has scripts (marked with 📜), ALWAYS use them instead of writing new code
   - Execute scripts with `run_shell_command` tool
   - Example: `python3 /path/to/script.py arg1 arg2`
   - Script code is NOT in context (saves tokens) - only output is captured
3. **Get full instructions**: If you need detailed instructions, mention the skill name or ask about it
4. **Reference documents**: Skills may have additional reference docs available on request

**CRITICAL RULE**: When a skill provides scripts for a task, USE THOSE SCRIPTS. Do not write new code to replicate functionality that already exists in tested scripts.
```

**关键改进**:
- ✅ 明确的优先级（脚本 > 新代码）
- ✅ 具体的执行方法
- ✅ Token 优势说明
- ✅ **CRITICAL RULE** 强调规则

---

## 完整工作流程

### 用户请求处理 PDF

1. **AI 检查 Level 1 元数据**
   ```
   看到: pdf skill - 描述: "PDF processing toolkit"
   看到: 📜 Scripts Available: fill_form.py, extract_data.py
   看到: ⚠️  Use these scripts instead of writing new code
   ```

2. **AI 决策**
   ```
   判断: 用户需要 PDF 处理
   匹配: pdf skill
   行动: 不写新代码，使用现成脚本
   ```

3. **AI 请求详细指令（如果需要）**
   ```
   AI: "Let me get the full instructions for the pdf skill"
   系统: 加载 Level 2 (完整 SKILL.md)
   ```

4. **AI 执行脚本**
   ```typescript
   await run_shell_command({
     command: 'python3 /path/to/scripts/fill_form.py input.pdf data.json output.pdf'
   })
   ```

5. **只有输出进入 Context**
   ```
   脚本代码: 0 tokens
   执行输出: ~100 tokens
   总成本: 远低于写新代码
   ```

---

## Token 成本对比

### 场景: 处理 PDF 表单

**使用脚本（修复后）**:
```
Level 1 元数据: 150 tokens
执行脚本输出: 100 tokens
总计: 250 tokens
```

**写新代码（修复前）**:
```
AI 生成代码: 800 tokens
调试和修正: 400 tokens
总计: 1200 tokens
```

**节省**: 79% (950 tokens)

---

## 验证方案

### 1. 单元测试验证

运行现有测试确保没有破坏功能：

```bash
cd packages/cli
npm test -- skill-context-injector.test.ts
```

**预期结果**:
- ✅ 所有测试通过
- ⚠️  可能需要更新快照（因为输出格式变化）

### 2. 手动测试

**创建测试 Skill**:

```bash
# 创建测试目录
mkdir -p ~/.deepv/skills/test-pdf-skill/scripts

# 创建 SKILL.md
cat > ~/.deepv/skills/test-pdf-skill/SKILL.md << 'EOF'
---
name: test-pdf
description: Test PDF processing skill
allowed-tools:
  - run_shell_command
  - read_file
  - write_file
---

# PDF Processing Test Skill

This skill provides scripts for PDF manipulation.

## Quick Start

Use the provided scripts instead of writing new code.
EOF

# 创建测试脚本
cat > ~/.deepv/skills/test-pdf-skill/scripts/fill_form.py << 'EOF'
#!/usr/bin/env python3
import sys
print(f"Filling PDF form: {sys.argv[1]}")
print("Success!")
EOF

chmod +x ~/.deepv/skills/test-pdf-skill/scripts/fill_form.py
```

**启动 DeepV Code**:

```bash
dvcode
```

**测试对话**:

```
用户: I need to fill a PDF form called "application.pdf"

期望 AI 行为:
1. AI: "I see the test-pdf skill has a fill_form.py script"
2. AI 执行: python3 ~/.deepv/skills/test-pdf-skill/scripts/fill_form.py application.pdf
3. AI 输出: "Successfully filled the form. Output: ..."

错误行为（如果未修复）:
- AI 写新的 Python 代码来处理 PDF
```

### 3. 系统集成测试

**安装官方 Marketplace**:

```bash
# 在 DeepV Code 中执行
/skill marketplace add https://github.com/anthropics/anthropic-agent-skills.git
/skill plugin install anthropic-agent-skills document-skills
```

**测试 PDF Skill**:

```
用户: I have a PDF form with fields. Can you help me fill it?

期望:
- AI 识别 pdf skill
- AI 使用 fill_fillable_fields.py
- AI 不写新代码
```

---

## 注意事项

### 1. Skill 创建者责任

Skill 的 `SKILL.md` 必须**明确说明如何使用脚本**:

**好的 SKILL.md**:
```markdown
---
name: pdf-processor
description: PDF manipulation toolkit
---

# PDF Processing

## Available Scripts

### fill_form.py

Fill PDF form fields.

**Usage**:
\`\`\`bash
python3 scripts/fill_form.py input.pdf fields.json output.pdf
\`\`\`

**Parameters**:
- `input.pdf`: Source PDF file
- `fields.json`: Field data in JSON format
- `output.pdf`: Output file path
```

**差的 SKILL.md**:
```markdown
---
name: pdf-processor
description: PDF manipulation
---

We have some scripts.
```

### 2. AI 行为不保证

即使有明确指令，AI 仍可能：
- 在某些情况下选择写新代码
- 误解指令
- 需要多次提示才使用脚本

**缓解措施**:
- 使用 **CRITICAL RULE** 等强调关键词
- 在 Level 1 就明确显示脚本
- 提供详细的使用示例

### 3. 向后兼容

所有修改**向后兼容**:
- ✅ 没有脚本的 Skill 仍然正常工作
- ✅ 现有 Skill 不需要修改
- ✅ Token 成本增加微小（~50 tokens/skill）

---

## 后续改进建议

### 短期（1周内）

1. **添加脚本执行日志**
   - 记录哪些脚本被执行
   - 统计使用频率
   - 识别未被使用的脚本

2. **优化 Token 估算**
   - 使用真实 tokenizer 而不是字符数估算
   - 提供详细的 Token breakdown

### 中期（2-4周）

3. **脚本元数据增强**
   - 在脚本文件中添加注释元数据
   - 自动提取参数说明
   - 生成更好的使用示例

4. **AI 使用模式分析**
   - 追踪 AI 选择脚本 vs 写代码的频率
   - 识别需要改进的指令
   - A/B 测试不同的 prompt 策略

### 长期（1-2月）

5. **智能脚本推荐**
   - 基于用户意图自动推荐脚本
   - 提供脚本参数补全
   - 生成脚本使用教程

6. **Skills Marketplace 增强**
   - 收集优秀 SKILL.md 示例
   - 提供 Skill 创建向导
   - 自动验证 SKILL.md 质量

---

## 相关链接

- **Claude Code 官方文档**: https://code.claude.com/docs/zh-CN/skills
- **PDF Skill 示例**: https://github.com/anthropics/anthropic-agent-skills/tree/main/document-skills/pdf
- **实现方案文档**: SKILLS-IMPLEMENTATION-MASTER-PLAN.md
- **进度报告**: SKILLS-PROGRESS-REPORT.md

---

## 总结

### 修改内容

1. ✅ Level 1 元数据注入增加脚本列表和使用提示
2. ✅ 启动时加载改为 Level 3（包含资源列表）
3. ✅ Level 2 完整指令增加详细脚本使用示例
4. ✅ System Prompt 增加明确的"使用脚本优先"规则

### 预期效果

- 🎯 AI 优先使用现成脚本而不是写新代码
- 💰 Token 成本降低 60-80%（对于有脚本的任务）
- ⚡ 执行速度更快（无需生成代码）
- 🐛 错误更少（使用测试过的脚本）

### 风险评估

- ✅ 向后兼容 - 不破坏现有功能
- ✅ 编译通过 - 无语法错误
- ⚠️  Token 成本略增 (~50 tokens/skill) - 可接受
- ⚠️  需要手动测试验证 AI 行为

---

**修复状态**: ✅ 代码修改完成，等待测试验证
**下一步**: 手动测试 + 单元测试快照更新（如需要）
