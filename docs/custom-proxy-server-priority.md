# 代理服务器配置优先级

本文档详细说明了在 DeepV Code 中配置自定义代理服务器时的优先级规则。

## 优先级概览（从高到低）

```
┌─────────────────────────────────────────────────────┐
│  1. System Settings (最高) - ~/.deepv/settings.json │
│     + customProxyServerUrl field                    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│  2. Workspace Settings - ./.deepv/settings.json     │
│     + customProxyServerUrl field                    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│  3. User Settings - ~/.deepv/settings.json          │
│     + customProxyServerUrl field                    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│  4. Environment Variable - DEEPX_SERVER_URL         │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│  5. Source Code Default (最低)                      │
│     + https://api-code.deepvlab.ai                  │
└─────────────────────────────────────────────────────┘
```

## 详细说明

### 优先级 1：System Settings（系统级设置）
- **位置**: 由环境变量 `GEMINI_CLI_SYSTEM_SETTINGS_PATH` 指定或平台默认位置
  - macOS: `/Library/Application Support/DeepVCli/settings.json`
  - Windows: `C:\ProgramData\deepv-cli\settings.json`
  - Linux: `/etc/deepv-cli/settings.json`
- **谁可以设置**: 系统管理员
- **用途**: 为整个系统的所有用户设置统一的代理服务器
- **优先级最高**: 覆盖所有其他配置

```json
{
  "customProxyServerUrl": "https://system-wide-proxy.example.com"
}
```

### 优先级 2：Workspace Settings（工作区级设置）
- **位置**: `./.deepv/settings.json`（项目目录中）
- **谁可以设置**: 开发团队（检入版本控制）
- **用途**: 为特定项目设置代理服务器
- **优先级**: 仅次于系统设置，高于用户设置

```json
{
  "customProxyServerUrl": "https://team-proxy.example.com"
}
```

### 优先级 3：User Settings（用户级设置）
- **位置**: `~/.deepv/settings.json`（用户主目录）
- **谁可以设置**: 个人用户
- **用途**: 个人偏好的代理服务器配置
- **优先级**: 低于系统和工作区设置

```json
{
  "customProxyServerUrl": "https://my-personal-proxy.example.com"
}
```

### 优先级 4：Environment Variable（环境变量）
- **变量名**: `DEEPX_SERVER_URL`
- **谁可以设置**: 开发人员（在启动脚本中或 shell 配置）
- **用途**: 动态配置，用于开发或临时覆盖
- **优先级**: 低于所有 settings.json 配置

```bash
# 在 bash/zsh 中
export DEEPX_SERVER_URL="https://dev-proxy.example.com"

# 或在启动时直接设置
DEEPX_SERVER_URL="https://dev-proxy.example.com" gemini

# Windows CMD
set DEEPX_SERVER_URL=https://dev-proxy.example.com

# Windows PowerShell
$env:DEEPX_SERVER_URL = "https://dev-proxy.example.com"
```

### 优先级 5：Source Code Default（源码硬编码默认值）
- **值**: `https://api-code.deepvlab.ai`
- **位置**: `packages/core/src/config/proxyConfig.ts`
- **谁可以修改**: 源码贡献者
- **用途**: 后备默认值，当没有任何其他配置时使用

```typescript
// packages/core/src/config/proxyConfig.ts
url: process.env.DEEPX_SERVER_URL || 'https://api-code.deepvlab.ai',
```

## 实现逻辑

### 第一步：检查 Settings 中的 customProxyServerUrl
```typescript
// packages/core/src/core/contentGenerator.ts
const customProxyUrl = gcConfig.getCustomProxyServerUrl();
if (customProxyUrl) {
  proxyServerUrl = customProxyUrl;
  // 来自 settings.json（任何优先级）
}
```

### 第二步：如果 Settings 未设置，检查环境变量和默认值
```typescript
// packages/core/src/config/proxyConfig.ts
const proxyServers = getProxyServers();
// 返回: [{ url: process.env.DEEPX_SERVER_URL || 'https://api-code.deepvlab.ai' }]
```

## 常见场景

### 场景 1：开发时临时测试自定义服务器
```bash
# 使用最高优先级的方式：设置环境变量
export DEEPX_SERVER_URL="https://localhost:8080"
gemini
```

### 场景 2：团队统一配置
```json
// ./.deepv/settings.json（工作区设置）
{
  "customProxyServerUrl": "https://team.example.com",
  "selectedAuthType": "proxy-auth"
}
```
这样，所有检出这个项目的团队成员都会自动使用这个代理服务器。

### 场景 3：个人配置优先于团队配置
```json
// ~/.deepv/settings.json（用户设置）
{
  "customProxyServerUrl": "https://personal-test.example.com"
}
```
即使项目中有 `.deepv/settings.json`，个人设置不会覆盖（因为工作区优先级更高）。
如果要个人优先，只能使用环境变量。

### 场景 4：系统管理员为所有用户设置代理
```json
// /Library/Application Support/DeepVCli/settings.json（macOS 示例）
{
  "customProxyServerUrl": "https://corporate-proxy.company.com",
  "theme": "default-dark"
}
```
所有用户的所有项目都会使用这个代理服务器，除非他们明确在个人设置中覆盖。

## 决策流程图

```
启动 DeepV Code
    ↓
是否在 System Settings 中定义了 customProxyServerUrl?
├─ 是 → 使用 System Settings 的值 ✓
└─ 否 → 继续
    ↓
是否在 Workspace Settings 中定义了 customProxyServerUrl?
├─ 是 → 使用 Workspace Settings 的值 ✓
└─ 否 → 继续
    ↓
是否在 User Settings 中定义了 customProxyServerUrl?
├─ 是 → 使用 User Settings 的值 ✓
└─ 否 → 继续
    ↓
是否设置了 DEEPX_SERVER_URL 环境变量?
├─ 是 → 使用环境变量的值 ✓
└─ 否 → 继续
    ↓
使用源码硬编码默认值: https://api-code.deepvlab.ai ✓
```

## 故障排除

### 问题：设置了 customProxyServerUrl，但没有被使用

**排查步骤：**
1. 检查是否有系统级设置（System Settings）覆盖了你的配置
   ```bash
   # 查看系统设置文件（如果存在）
   cat "/Library/Application Support/DeepVCli/settings.json"  # macOS
   cat "C:\ProgramData\deepv-cli\settings.json"             # Windows
   cat "/etc/deepv-cli/settings.json"                       # Linux
   ```

2. 检查是否有工作区设置（Workspace Settings）覆盖了你的配置
   ```bash
   cat ./.deepv/settings.json
   ```

3. 确认你的用户设置文件语法正确
   ```bash
   cat ~/.deepv/settings.json
   ```

4. 检查启动时是否设置了环境变量（会被忽略，因为 settings 优先级更高）
   ```bash
   echo $DEEPX_SERVER_URL  # Linux/Mac
   echo %DEEPX_SERVER_URL% # Windows
   ```

5. 查看启动时的日志输出
   ```bash
   gemini --debug
   ```
   应该看到：
   ```
   [DeepX] Using custom proxy server: https://your-url
   ```
   或
   ```
   [DeepX] Connecting to DeepV Code server: https://api-code.deepvlab.ai
   ```

### 问题：想要在 CI/CD 中使用不同的服务器

**解决方案：** 使用环境变量
```bash
#!/bin/bash
# CI/CD 脚本
export DEEPX_SERVER_URL="https://ci.proxy.example.com"
gemini --prompt "analyze the code"
```

## 总结表格

| 配置来源 | 位置 | 设置者 | 优先级 | 用途 |
|---------|------|--------|--------|------|
| System Settings | `/Library/App.../settings.json` | 系统管理员 | 1 (最高) | 系统范围配置 |
| Workspace Settings | `./.deepv/settings.json` | 开发团队 | 2 | 项目级配置 |
| User Settings | `~/.deepv/settings.json` | 个人用户 | 3 | 个人偏好 |
| Environment Variable | `DEEPX_SERVER_URL` | 开发人员 | 4 | 临时/动态配置 |
| Source Default | `proxyConfig.ts` | 源码 | 5 (最低) | 后备默认值 |
