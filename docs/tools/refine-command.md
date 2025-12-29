# `/refine` 命令使用指南

## 概述

`/refine` 命令是 DeepV Code 的文本润色功能，支持对文本进行智能优化和改写。可以调整语气、风格、强度等参数，并提供多种输出格式。

## 基础用法

### 1. 直接润色文本

```bash
/refine 这是一段需要润色的文本
```

### 2. 多行文本润色

如果需要润色多行文本，直接输入 `/refine` 然后回车，进入多行输入模式（目前暂未实现，可使用其他方式）。

### 3. 从文件润色

```bash
/refine --file README.md
```

### 4. 从标准输入读取

```bash
echo "需要润色的文本" | dv refine --stdin
```

或使用管道：

```bash
pbpaste | dv refine --stdin
```

## 参数详解

### 语气参数 (`--tone`)

控制润色后的文本语气风格：

- `neutral`（默认）：中性、客观
- `friendly`：友好、亲切
- `formal`：正式、专业
- `concise`：简洁、精炼
- `marketing`：营销、吸引人
- `tech`：技术、专业术语

**示例：**
```bash
/refine --tone formal --file proposal.md
```

### 强度参数 (`--level`)

控制改写的幅度：

- `light`（默认）：轻微调整（修正错误、优化表达）
- `medium`：适度改写（改善流畅度、增强表达力）
- `deep`：深度重写（重新组织结构、提升专业性）

**示例：**
```bash
/refine --level deep 这段文字需要深度改写
```

### 语言参数 (`--lang`)

指定目标语言（默认 `auto` 自动检测）：

```bash
/refine --lang en --file document.md
/refine --lang zh 翻译并润色这段文本
```

### 保护选项

#### 保留格式 (`--keep-format`)

默认启用。保留 Markdown 结构（标题、列表、链接等）。

```bash
/refine --keep-format --file README.md
/refine --no-keep-format --file plain.txt  # 关闭保护
```

#### 保护代码 (`--keep-code`)

默认启用。不修改代码块和内联代码。

```bash
/refine --keep-code --file tutorial.md
/refine --no-keep-code --file mixed.md  # 关闭保护
```

#### 禁止表情符号 (`--no-emoji`)

```bash
/refine --no-emoji --file formal-document.md
```

### 长度限制 (`--max`)

指定最大字符数：

```bash
/refine --max 500 这是一段很长的文本...
```

### 术语表 (`--glossary`)

使用 JSON 格式的术语表文件：

```bash
/refine --glossary terms.json --file technical-doc.md
```

**术语表格式（`terms.json`）：**
```json
{
  "DeepV Code": "DeepV Code",
  "AI": "人工智能",
  "refine": "润色"
}
```

### 自定义规则 (`--rule`)

添加自定义润色规则（可重复使用）：

```bash
/refine --rule "避免被动语态" --rule "使用简短句子" --file article.md
```

### 输出格式 (`--out`)

- `pretty`（默认）：人类可读的格式化输出
- `text`：仅输出润色后的文本
- `json`：JSON 格式（包含元数据）
- `md`：Markdown 友好格式

**示例：**
```bash
/refine --file README.md --out json
/refine --stdin --out text < input.txt > output.txt
```

### 预演模式 (`--dry-run`)

仅显示变更，不实际写回文件：

```bash
/refine --file README.md --dry-run
```

## 完整示例

### 示例 1：润色营销文案

```bash
/refine --tone marketing --level medium "我们的产品很好用"
```

### 示例 2：正式化技术文档

```bash
/refine --tone formal --level deep --keep-format --keep-code --file docs/api.md
```

### 示例 3：使用管道处理剪贴板内容

```bash
pbpaste | dv refine --stdin --tone friendly --out text | pbcopy
```

### 示例 4：批量润色（结合 shell 脚本）

```bash
for file in docs/*.md; do
  dv refine --file "$file" --tone formal --dry-run
done
```

### 示例 5：使用术语表和自定义规则

```bash
/refine \
  --file technical-blog.md \
  --glossary company-terms.json \
  --rule "使用主动语态" \
  --rule "避免行业黑话" \
  --tone friendly \
  --level medium
```

### 示例 6：JSON 输出用于 CI

```bash
dv refine --file README.md --out json > result.json
```

## 输出格式说明

### Pretty 格式（默认）

```
🎨 润色结果

📊 **参数信息**
   语言: zh → zh
   语气: formal | 强度: medium
   保护: ✅格式 ✅代码
   模型: haiku

────────────────────────────────────────────────────────

📝 **变更内容**

[显示 diff]

────────────────────────────────────────────────────────

✨ **润色结果**

[润色后的文本]

────────────────────────────────────────────────────────
```

### JSON 格式

```json
{
  "langDetected": "zh",
  "langTarget": "zh",
  "tone": "formal",
  "level": "medium",
  "keepFormat": true,
  "keepCode": true,
  "rules": ["避免被动语态"],
  "diff": "--- original\n+++ refined\n...",
  "result": "润色后的文本",
  "modelUsed": "haiku"
}
```

## 注意事项

1. **保护机制**：默认情况下，`--keep-format` 和 `--keep-code` 都是启用的，可以保护您的 Markdown 结构和代码块不被修改。

2. **文件写回**：只有在使用 `--file` 参数且未指定 `--dry-run` 时，才会直接修改原文件。建议先使用 `--dry-run` 预览效果。

3. **模型选择**：默认使用 `haiku` 模型，适合快速润色任务，性价比高。

4. **大文件处理**：对于超长文本，会自动分段处理以确保质量。

5. **CI/CD 集成**：使用 `--out json` 可以方便地在自动化流程中使用。

## 错误处理

常见错误和解决方法：

- **"从标准输入读取的内容为空"**：确保通过管道或重定向传入了内容
- **"无法读取文件"**：检查文件路径和权限
- **"写回文件失败"**：检查文件权限，或使用 `--dry-run` 先预览
- **"模型未返回有效响应"**：检查网络连接和认证状态

## 最佳实践

1. **先预览再应用**：使用 `--dry-run` 先查看效果
2. **保护重要内容**：保持 `--keep-code` 和 `--keep-format` 启用
3. **版本控制**：在有 Git 的项目中使用，方便回滚
4. **术语表统一**：为项目创建统一的术语表文件
5. **渐进式润色**：先用 `light`，不满意再用 `medium` 或 `deep`

## 遥测

`/refine` 命令会记录以下遥测数据（用于改进功能）：

- `refine.start`: 命令开始执行
- `refine.polish`: 文本润色过程
- `refine.complete`: 成功完成
- `refine.error`: 错误信息

所有遥测数据都符合隐私政策。

## 反馈

如有问题或建议，请访问：https://github.com/your-repo/issues

