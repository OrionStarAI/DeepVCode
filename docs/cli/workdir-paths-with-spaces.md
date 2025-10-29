# --workdir 参数中的空格处理

## ✅ 完整支持空格路径

DeepV Code CLI 的 `--workdir` 参数**完全支持**包含空格和特殊字符的路径。内部使用 Node.js 原生 API，自动处理所有路径复杂性。

## 测试验证结果

以下情况已通过实际测试验证：

- ✅ 路径规范化 (`path.normalize()`) - **完全支持空格**
- ✅ 路径绝对化 (`path.resolve()`) - **完全支持空格**
- ✅ 目录验证 (`fs.statSync()`) - **完全支持空格**
- ✅ 目录切换 (`process.chdir()`) - **完全支持空格**

## 关键要点：正确引用

虽然 CLI 内部完全支持空格，但 **用户需要在命令行中正确引用包含空格的路径**。这不是我们的限制，而是 shell 的要求。

## Windows 平台使用示例

### Windows CMD (命令提示符)

```cmd
REM 使用双引号（推荐）
dvcode --workdir "C:\Program Files\My Project"

REM 处理混合路径
dvcode --workdir "D:\My Documents\Project Folder"

REM 在批处理脚本中使用变量
set WORKDIR=C:\Program Files\My Application
dvcode --workdir "%WORKDIR%"

REM 组合其他参数
dvcode --workdir "C:\My Projects\urgent-fix" --prompt "修复这个bug" --yolo
```

### Windows PowerShell

```powershell
# 双引号方式
dvcode --workdir "C:\Program Files\My Project"

# 单引号方式
dvcode --workdir 'C:\Program Files\My Project'

# 使用变量
$workdir = "C:\Program Files\My Application"
dvcode --workdir $workdir

# 动态构建路径
dvcode --workdir "$env:USERPROFILE\Documents\My Project"

# 循环处理多个项目
@("Project A", "Project B", "Project C") | ForEach-Object {
    $path = "C:\Projects\$_"
    dvcode --workdir $path --prompt "Check this"
}
```

### Windows 批处理脚本

```batch
@echo off
REM 使用变量和引号的最佳实践
set MY_PROJECT=C:\Program Files\My Project
echo Analyzing: %MY_PROJECT%
dvcode --workdir "%MY_PROJECT%" --prompt "Code review" --yolo

REM 遍历多个项目
for /d %%D in (C:\Projects\*) do (
    dvcode --workdir "%%D" --prompt "Check" --yolo
)
```

## Linux/Mac 平台使用示例

### Bash/Zsh Shell

```bash
# 方法 1：双引号（推荐）
dvcode --workdir "/home/user/My Documents/Project"

# 方法 2：单引号
dvcode --workdir '/home/user/My Documents/Project'

# 方法 3：反斜杠转义（不推荐，但也支持）
dvcode --workdir /home/user/My\ Documents/Project

# 使用变量
PROJECT_DIR="/home/user/My Documents/Project"
dvcode --workdir "$PROJECT_DIR"

# 使用 ~ 展开
dvcode --workdir "~/My Documents/Project"

# 组合其他参数
dvcode --workdir "/opt/my application (v1.0)" --all-files --yolo
```

### Bash 脚本

```bash
#!/bin/bash

# 建议做法：使用变量和引号
MY_PROJECT="/home/user/My Documents/Project"
dvcode --workdir "$MY_PROJECT" --prompt "Code review" --yolo

# 遍历多个项目
for dir in /home/user/My\ Documents/*; do
    if [ -d "$dir" ]; then
        dvcode --workdir "$dir" --prompt "Audit code" --yolo
    fi
done

# 从配置文件读取路径
WORKDIR=$(grep "^workdir=" config.ini | cut -d'=' -f2)
dvcode --workdir "$WORKDIR" --yolo
```

### Fish Shell

```fish
# Fish shell 处理空格路径
set MY_PROJECT "/home/user/My Documents/Project"
dvcode --workdir $MY_PROJECT

# 函数方式
function dvcode_workspace --description "Run DeepV on workspace"
    set workdir "/home/user/$argv[1]"
    dvcode --workdir "$workdir" --all-files --yolo
end

# 使用函数
dvcode_workspace "My Project"
```

## 特殊字符支持

以下特殊字符在路径中完全受支持：

| 字符 | 支持 | 示例 |
|------|------|------|
| 空格 | ✅ | `./My Project` |
| 括号 | ✅ | `./project (v1.0)` |
| 中文字符 | ✅ | `./我的项目` |
| 连字符 | ✅ | `./my-project` |
| 下划线 | ✅ | `./my_project` |
| 点号 | ✅ | `./my.project` |
| @ 符号 | ✅ | `./project@v1` |
| 数字 | ✅ | `./project123` |

### 特殊字符示例

```bash
# Windows
dvcode --workdir "C:\项目\2024年项目"
dvcode --workdir "C:\Code\project@v1.0 (backup)"

# Linux
dvcode --workdir "/home/user/2024-projects"
dvcode --workdir "/home/user/项目 (存档)"
```

## 常见错误和解决方案

### 错误 1：未引用的空格路径

```bash
# ❌ 错误 - 不会工作
dvcode --workdir /home/user/My Documents/Project

# ✅ 正确 - 使用引号
dvcode --workdir "/home/user/My Documents/Project"
```

**错误信息:**
```
Error: --workdir path does not exist: /home/user/My
```
原因：Shell 在空格处分割参数。

### 错误 2：混合引号

```bash
# ❌ 错误 - 混合引号
dvcode --workdir "C:\Program Files\My 'Project'

# ✅ 正确 - 统一使用一种引号
dvcode --workdir "C:\Program Files\My Project"
```

### 错误 3：在批处理脚本中忘记转义

```batch
REM ❌ 错误 - 在批处理中需要转义百分号
set path=C:\Program Files\My Project%1
dvcode --workdir %path%

REM ✅ 正确 - 使用双引号
set path=C:\Program Files\My Project
dvcode --workdir "%path%"
```

## 路径引用规则总结

### Windows 规则

| 场景 | 语法 | 示例 |
|------|------|------|
| CMD 中直接使用 | `"path with spaces"` | `dvcode --workdir "C:\My Projects\app"` |
| CMD 中使用变量 | `"%VAR%"` | `dvcode --workdir "%MYPATH%"` |
| PowerShell 直接使用 | `"path"` 或 `'path'` | `dvcode --workdir "C:\My Projects\app"` |
| PowerShell 使用变量 | `$var` | `dvcode --workdir $mypath` |
| 批处理脚本 | `"%VAR%"` | `dvcode --workdir "%projectdir%"` |

### Linux/Mac 规则

| 场景 | 语法 | 示例 |
|------|------|------|
| Bash 直接使用 | `"path"` 或 `'path'` | `dvcode --workdir "/home/user/My Project"` |
| Bash 使用变量 | `"$var"` | `dvcode --workdir "$mypath"` |
| Bash 转义空格 | `path\ with\ spaces` | `dvcode --workdir /home/user/My\ Project` |
| Bash 脚本中 | `"$var"` | `dvcode --workdir "$mypath"` |
| Fish shell | `$var` | `dvcode --workdir $mypath` |

## CI/CD 环境集成

### GitHub Actions

```yaml
- name: DeepV Code Analysis
  run: dvcode --workdir "${{ github.workspace }}" --prompt "Code review" --yolo
```

### GitLab CI

```yaml
deepv_analysis:
  script:
    - dvcode --workdir "$CI_PROJECT_DIR" --prompt "Check" --yolo
```

### Jenkins

```groovy
stage('DeepV Analysis') {
    steps {
        sh '''
            PROJECT_DIR="${WORKSPACE}"
            dvcode --workdir "$PROJECT_DIR" --prompt "Audit" --yolo
        '''
    }
}
```

### Docker

```dockerfile
# Dockerfile
ENTRYPOINT ["dvcode", "--workdir", "/workspace"]

# 使用
docker run -v /my/project:/workspace deepv-code
```

## 最佳实践

### 1. 总是使用引号

```bash
# ✅ 好
dvcode --workdir "/path/with spaces"
dvcode --workdir "$PROJECT_PATH"

# ❌ 避免
dvcode --workdir /path/with spaces
```

### 2. 优先使用变量

```bash
# ✅ 推荐 - 易于维护
PROJECT="/home/user/My Documents/Project"
dvcode --workdir "$PROJECT" --yolo

# ❌ 避免 - 容易出错
dvcode --workdir "/home/user/My Documents/Project" --yolo
```

### 3. 在脚本中验证路径

```bash
#!/bin/bash
# ✅ 好的实践
PROJECT_PATH="/home/user/My Documents/Project"
if [ ! -d "$PROJECT_PATH" ]; then
    echo "Error: Project path does not exist: $PROJECT_PATH"
    exit 1
fi
dvcode --workdir "$PROJECT_PATH" --yolo
```

### 4. 使用规范的路径格式

```bash
# ✅ 推荐 - 使用规范格式
dvcode --workdir "/home/user/my-project"           # Linux
dvcode --workdir "C:\Users\Name\my-project"        # Windows

# ⚠️ 可以用但不规范
dvcode --workdir "C:/Users/Name/my-project"        # 混合格式（会被规范化）
```

## 故障排除

### 如何验证路径是否被正确解析

1. **在 CLI 启动时查看窗口标题** - 应该显示正确的目录名

2. **使用 `--debug` 标志查看日志**
   ```bash
   dvcode --workdir "/path/with spaces" --debug --prompt "test"
   ```

3. **检查 GEMINI.md 文件加载** - 应该从指定目录加载

### 获取更详细的错误信息

如果遇到问题，CLI 会显示具体的错误信息：

```
Error: --workdir path does not exist: /invalid/path/name
```

这清楚地表明问题所在，可以帮助快速调试。

## 总结

✅ **完全支持** 包含空格的路径
✅ **完全支持** 特殊字符和中文
✅ **完全支持** 长路径名
⚠️ **必须** 在 shell 中正确引用包含空格的路径
✅ **零额外复杂性** - 使用标准的 shell 引用规则即可
