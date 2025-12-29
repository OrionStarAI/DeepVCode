# SSH/WSL 环境兼容性指南

## 问题描述

在SSH连接或WSL环境中使用DeepV Code CLI时，可能会遇到交互菜单中方向键失效的问题。具体表现为：

- 方向键（↑↓←→）显示为转义序列（如 `^[[A`、`^[[B`、`^[[C`、`^[[D`）
- 无法正常在主题选择等交互菜单中导航
- 键盘输入响应异常

## 解决方案

### 自动检测

CLI 会自动检测以下环境并启用兼容模式：

- **SSH环境**：通过 `SSH_CLIENT`、`SSH_TTY`、`SSH_CONNECTION` 环境变量检测
- **WSL环境**：通过 `WSL_DISTRO_NAME`、`WSL_INTEROP`、`WSLENV` 环境变量检测
- **终端复用器**：screen、tmux 等环境
- **容器环境**：Docker 容器等

### 手动启用兼容模式

如果自动检测失效，可以手动启用SSH/WSL兼容模式：

```bash
# 方法1：设置环境变量
export DEEPV_SSH_MODE=1
deepv

# 方法2：单次使用
DEEPV_SSH_MODE=1 deepv

# Windows WSL中
set DEEPV_SSH_MODE=1 && deepv
```

### 兼容模式的优化措施

启用兼容模式后，CLI 会自动应用以下优化：

1. **键盘输入处理**：
   - 直接处理方向键转义序列（`\x1B[A/B/C/D`）
   - 增加转义序列超时时间（1000ms）
   - 强制使用 passthrough 模式处理键盘事件

2. **终端配置优化**：
   - 在受限环境中禁用某些TTY特性
   - 减少历史记录以提高响应速度
   - 调整 escape code timeout 以适应网络延迟

3. **交互组件适配**：
   - 更宽松的转义序列检测
   - 改善粘贴检测逻辑，避免误判方向键

## 故障排除

### 1. 方向键仍然显示转义序列

**解决方法**：
```bash
# 确保终端类型正确设置
export TERM=xterm-256color

# 手动启用兼容模式
export DEEPV_SSH_MODE=1
```

### 2. 输入延迟或响应缓慢

**可能原因**：网络延迟或终端配置
**解决方法**：
```bash
# 检查网络延迟
ping your-server

# 尝试不同的终端类型
export TERM=screen-256color
# 或
export TERM=linux
```

### 3. 部分按键功能异常

**解决方法**：
```bash
# 检查locale设置
locale

# 确保UTF-8编码
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
```

### 4. WSL 特定问题

**Windows Terminal 用户**：
- 确保使用最新版本的 Windows Terminal
- 在设置中启用 "使用旧版控制台"

**传统 CMD/PowerShell**：
```powershell
# 在 PowerShell 中设置
$env:DEEPV_SSH_MODE = "1"
deepv
```

## 环境变量参考

| 环境变量 | 值 | 说明 |
|---------|-----|------|
| `DEEPV_SSH_MODE` | `1` 或 `true` | 强制启用SSH/WSL兼容模式 |
| `PASTE_WORKAROUND` | `1` 或 `true` | 启用粘贴处理兼容模式 |
| `TERM` | `xterm-256color`<br>`screen-256color`<br>`linux` | 设置终端类型 |

## 测试兼容性

可以使用以下命令测试当前环境的兼容性：

```bash
# 测试方向键
deepv --help  # 然后按方向键测试

# 测试主题选择
deepv theme  # 使用方向键导航

# 查看环境信息
echo "SSH: $SSH_CLIENT"
echo "WSL: $WSL_DISTRO_NAME"
echo "TERM: $TERM"
echo "DEEPV_SSH_MODE: $DEEPV_SSH_MODE"
```

## 已知限制

1. **复杂转义序列**：某些特殊键组合可能仍需要额外配置
2. **古老终端**：非常老旧的终端模拟器可能需要额外的兼容性处理
3. **网络延迟**：高延迟连接可能影响交互体验

## 反馈问题

如果遇到未解决的兼容性问题，请提供以下信息：

1. 操作系统和版本
2. SSH客户端类型和版本
3. 终端模拟器信息
4. `echo $TERM` 的输出
5. 具体的错误表现

提交问题时请包含这些环境信息以便快速诊断。