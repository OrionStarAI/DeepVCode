# --workdir 参数使用指南

## 概述

`--workdir` 参数允许你在启动 DeepV Code CLI 时指定工作目录，无需手动切换目录。此参数兼容 Windows 和 Linux 路径格式。

## 参数说明

```
--workdir <path>
```

- **类型**: 字符串
- **可选**: 是
- **说明**: 指定要使用的工作目录路径

## 路径兼容性

该参数支持以下路径格式：

### Windows 路径
- 绝对路径: `C:\Users\YourName\project`
- UNC 路径: `\\server\share\project`
- 相对路径: `.\project` 或 `project`

### Linux/Mac 路径
- 绝对路径: `/home/user/project`
- 相对路径: `./project` 或 `project`

### 混合格式（自动转换）
- 混合分隔符: `C:/Users/YourName/project` (Windows 和 Unix 混合)
- 这些会被自动规范化为当前操作系统的格式

## 使用示例

### Windows 示例

#### 交互式模式
```cmd
dvcode --workdir C:\Users\YourName\my-project
```

#### 非交互式模式（传递提示）
```cmd
dvcode --workdir D:\projects\deepVcode --prompt "修复这个bug"
```

#### 使用相对路径
```cmd
dvcode --workdir .\src\components
```

#### 与其他参数组合
```cmd
dvcode --workdir C:\projects\app --model gemini-2.0-flash --yolo
```

### Linux/Mac 示例

#### 交互式模式
```bash
dvcode --workdir /home/user/my-project
```

#### 非交互式模式
```bash
dvcode --workdir ~/projects/app --prompt "Add error handling"
```

#### 使用相对路径
```bash
dvcode --workdir ./src --yolo
```

### 跨平台兼容的路径格式
```bash
# Windows 命令行也支持这种格式
dvcode --workdir C:/Users/YourName/project

# Linux/Mac
dvcode --workdir C:/Users/YourName/project  # 会被规范化为 C:\Users\YourName\project（Windows）
```

## 常见用途

### 1. 在脚本中使用固定目录
```bash
# build.sh
#!/bin/bash
dvcode --workdir /path/to/project --prompt "Run tests"
```

### 2. 从上级目录快速访问子项目
```bash
dvcode --workdir ./microservices/auth-service --yolo
```

### 3. 使用绝对路径避免相对路径问题
```bash
dvcode --workdir /absolute/path/to/workspace
```

### 4. CI/CD 流程中使用
```bash
# pipeline.yml
- run: dvcode --workdir ${{ github.workspace }} --prompt "Run linting"
```

## 错误处理

如果指定的路径无效，CLI 会显示相应的错误消息：

```
Error: --workdir path does not exist: /invalid/path
```

```
Error: --workdir path is not a directory: /path/to/file.txt
```

```
Error: Invalid --workdir path: /broken/path
Details: [具体错误信息]
```

## 验证

要验证 `--workdir` 参数是否正确工作，可以：

1. 使用 `--prompt` 和 `--yolo` 标志进行快速测试：
   ```bash
   dvcode --workdir /path/to/test --prompt "pwd" --yolo
   ```

2. 查看 CLI 启动时是否显示正确的工作目录标题

3. 检查 GEMINI.md 文件是否从指定目录加载

## 与其他参数的交互

`--workdir` 与其他参数完全兼容：

```bash
# 会话管理
dvcode --workdir /path/to/project --continue

# 模型选择
dvcode --workdir /path/to/project --model gemini-2.0-flash

# 扩展
dvcode --workdir /path/to/project --extensions ext1 ext2

# 沙盒模式
dvcode --workdir /path/to/project --sandbox

# 所有组合
dvcode --workdir /path/to/project --model gemini-2.0-flash --yolo --all-files
```

## 路径解析流程

1. **规范化**: 路径中的 `/` 和 `\` 被统一处理
2. **绝对化**: 相对路径相对于当前工作目录解析为绝对路径
3. **验证**: 检查路径是否存在且为目录
4. **切换**: 使用 `process.chdir()` 切换工作目录
5. **继续**: CLI 继续正常启动流程

## 技术细节

- 使用 Node.js 内置的 `path.normalize()` 和 `path.resolve()` 进行跨平台兼容
- 在 main() 函数早期阶段处理，确保所有后续操作都在正确的目录中
- 如果目录切换失败，CLI 会立即退出并显示错误信息
