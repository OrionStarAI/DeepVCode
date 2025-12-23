# Authentication Setup

本系统使用代理服务器认证模式，无需复杂配置。

## 代理服务器认证 (Proxy Server Authentication)

**默认且唯一的认证方式**

- 系统会自动使用内置的代理服务器配置
- 无需用户配置任何环境变量或API密钥
- 首次启动时会自动选择此认证方式
- 认证成功后，系统使用服务端自动选择的成本最优 AI 模型
- 代理服务器支持多种认证源（如飞书等），对客户端透明，统一返回 JWT token

## 使用说明

1. **首次启动**: 系统会自动选择代理服务器认证方式
2. **认证流程**: 无需手动操作，系统会自动处理认证
3. **模型选择**: 认证成功后，系统会使用服务端动态选择的 AI 模型（用户也可通过 `/model` 命令指定首选模型）

## 架构说明

代理服务器认证是一个通用的认证接口：
- **客户端**: 将 JWT token 通过 `Authorization: Bearer ${token}` 头发送请求
- **服务端**: 可以从多种源获取 token（飞书、Google 等），对客户端统一处理
- **对客户端透明**: 不需要关心实际的认证源，只需持有有效的 JWT token

## 故障排除

如果遇到认证问题，请：

1. 确保网络连接正常
2. 检查代理服务器是否可访问
3. 如有持续问题，请使用 `/bug` 命令反馈问题

## 配置持久化

系统会自动保存认证配置，无需手动配置。所有设置都会保存在用户配置文件中，下次启动时会自动加载。

## 自定义代理服务器 (Advanced)

如果需要使用自定义的代理服务器而不是内置的默认服务器，可以在 `settings.json` 中配置：

```json
{
  "customProxyServerUrl": "https://your-custom-api-server.com"
}
```

### 配置位置

用户配置文件位置：
- **Linux/Mac**: `~/.deepv/settings.json`
- **Windows**: `%USERPROFILE%\.deepv\settings.json`

### 示例配置

```json
{
  "theme": "default-dark",
  "selectedAuthType": "proxy-auth",
  "customProxyServerUrl": "https://api.example.com",
  "preferredModel": "claude-opus",
  "telemetry": {
    "enabled": false
  }
}
```

### 验证配置

配置生效后，你会在启动时看到类似的日志：
```
[DeepX] Using custom proxy server: https://your-custom-api-server.com
```

### 重置为默认服务器

删除 `settings.json` 中的 `customProxyServerUrl` 字段，系统会恢复使用默认内置服务器。

### 完整优先级说明

当多个配置来源同时存在时，优先级如下（从高到低）：

1. **System Settings** (`/Library/Application Support/DeepVCli/settings.json` 等)
   - 系统管理员配置，覆盖所有其他设置
2. **Workspace Settings** (`./.deepv/settings.json`)
   - 项目级配置，团队共享
3. **User Settings** (`~/.deepv/settings.json`)
   - 个人用户配置
4. **环境变量** (`DEEPX_SERVER_URL`)
   - 动态配置，用于临时覆盖或 CI/CD
5. **默认值** (`https://api-code.deepvlab.ai`)
   - 源码硬编码的后备值

详细信息请参考 [自定义代理服务器优先级](../custom-proxy-server-priority.md)