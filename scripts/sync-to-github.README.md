# sync-to-github 脚本使用说明

## 📋 脚本功能

自动将当前分支的增量提交同步到 `github_main` 分支，并可选择性地推送到 GitHub。

## ⚙️ 使用前提条件

在使用此脚本前，请确保已完成以下设置：

### 1. 本地已创建 github_main 分支

如果还没有 `github_main` 分支，需要从内部 GitLab 仓库同步：

```bash
# 拉取远程的 github_main 分支
git fetch origin github_main

# 创建并切换到本地 github_main 分支
git checkout -b github_main origin/github_main
```

### 2. 已添加 GitHub 远程仓库

需要添加名为 `github` 的远程仓库指向 GitHub：

```bash
# 添加 GitHub 远程仓库
git remote add github https://github.com/OrionStarAI/DeepVCode.git

# 验证远程仓库
git remote -v
```

应该看到类似输出：
```
github  https://github.com/OrionStarAI/DeepVCode.git (fetch)
github  https://github.com/OrionStarAI/DeepVCode.git (push)
origin  https://gitlab.liebaopay.com/ai_native/DeepVCode/DeepVcodeClient.git (fetch)
origin  https://gitlab.liebaopay.com/ai_native/DeepVCode/DeepVcodeClient.git (push)
```

## 🚀 使用方法

### 基本用法

在任意分支（如 `master` 或 `ls-dev`）执行：

```bash
npm run sync-to-github
```

### 执行流程

1. **检测新提交**：脚本会自动检测当前分支相比 `github_main` 的新提交
2. **展示待同步内容**：列出所有需要同步的 commits
3. **自动同步**：使用 cherry-pick 方式将 commits 同步到 `github_main`
4. **自动解决冲突**：遇到冲突时自动使用 `--theirs` 策略（因为这是单向同步）
5. **交互式推送**：同步完成后询问是否立即推送到 GitHub

### 示例输出

```
🚀 开始同步当前分支到 github_main...
📍 当前分支: master
🔗 GitHub 远程仓库: https://github.com/OrionStarAI/DeepVCode.git
🔍 github_main 分支最后一个 commit: 8d5ab4ca
📌 找到原始 commit: 2ac3b9b4

📦 发现 3 个新提交需要同步:

  1. 316bf319 vscode插件增加标签状态提示,显示进行中和已完成的任务
  2. a411bd6d 导出会话记录的时候增加工具调用参数
  3. 7c5ea359 feat: 添加sync-to-github脚本用于自动同步到github_main分支

🔄 切换到 github_main 分支...

⚙️  开始 cherry-pick (使用 theirs 策略自动解决冲突)...

  316bf319 vscode插件增加标签状态提示,显示进行中和已完成的任务... ✅
  a411bd6d 导出会话记录的时候增加工具调用参数... ✅
  7c5ea359 feat: 添加sync-to-github脚本用于自动同步到github_main分支... ✅

🔄 切换回 master 分支...

📊 同步完成统计:
  ✅ 成功同步: 3 个提交

🎉 同步成功！

📤 是否现在就将 github_main 分支推送到 GitHub 仓库的 main 分支？(y/n):
```

### 交互式选项

- 输入 `y` 或 `yes`：立即推送到 GitHub
- 输入 `n` 或 `no`：稍后手动推送

## 📝 注意事项

1. **单向同步**：`github_main` 分支仅用于同步到 GitHub，不应在该分支上直接开发
2. **冲突处理**：脚本会自动使用 `--theirs` 策略解决冲突（总是采用源分支的版本）
3. **跳过 merge commits**：只同步非 merge 类型的 commits
4. **强制推送**：推送到 GitHub 时使用强制推送（`-f`），确保历史一致

## 🛠️ 手动推送

如果选择稍后推送，可以使用以下命令：

```bash
# 切换到 github_main 分支
git checkout github_main

# 强制推送到 GitHub 的 main 分支
git push -f github github_main:main

# 切换回原分支
git checkout master  # 或其他分支
```

## ❓ 常见问题

### Q: 提示 "github_main 分支不存在"

A: 请按照"使用前提条件"中的步骤 1 创建分支。

### Q: 提示 "未找到名为 github 的远程仓库"

A: 请按照"使用前提条件"中的步骤 2 添加远程仓库。

### Q: 同步失败怎么办？

A: 检查错误信息，可能需要手动解决冲突或调整分支状态。如果不确定，可以运行 `git cherry-pick --abort` 回退。

### Q: 如何查看 github_main 的历史？

A: 使用 `git log --oneline github_main` 查看提交历史。

## 🔄 工作流程建议

1. 在 `master` 或 `ls-dev` 分支开发新功能
2. 提交并推送到内部 GitLab 仓库
3. 运行 `npm run sync-to-github` 同步到 `github_main`
4. 选择是否立即推送到 GitHub
5. 定期清理本地 `github_main` 分支以保持与远程同步

## 📚 相关命令

```bash
# 查看所有远程仓库
git remote -v

# 查看 github_main 分支状态
git status github_main

# 查看 github_main 提交历史
git log --oneline github_main

# 更新 github_main 分支
git fetch origin github_main
git checkout github_main
git pull origin github_main
```
