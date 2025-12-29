# MCP Add 命令使用指南

## 概述

`/mcp add` 命令允许您轻松地添加和配置MCP (Model Context Protocol) 服务器，扩展DeepV Code的功能。

## 基本用法

### 交互式向导模式
```bash
/mcp add
```

启动交互式配置向导，适合新手用户：
- 选择预定义模板或自定义配置
- 逐步引导配置过程
- 自动验证和错误检查

### 快速模板配置
```bash
# 常用预定义模板
/mcp add github           # GitHub仓库操作工具
/mcp add sqlite           # SQLite数据库工具  
/mcp add filesystem       # 本地文件操作工具
/mcp add search           # Brave搜索工具
/mcp add slack            # Slack集成工具
```

### 自定义服务器配置
```bash
/mcp add my-server --command "npx @my/mcp-server" --description "我的自定义服务器"
```

## 详细参数

### 基础参数
- `--scope <level>`: 配置保存位置 (`workspace`, `user`, `system`)
- `--template <name>`: 使用预定义模板
- `--description "desc"`: 服务器描述

### 连接配置
- `--command <cmd>`: 可执行命令路径
- `--args <arg>`: 命令参数 (可重复使用)
- `--env KEY=VALUE`: 环境变量 (可重复使用)
- `--env-file <path>`: 环境变量文件路径
- `--cwd <path>`: 工作目录

### 网络连接
- `--url <sse-url>`: Server-Sent Events URL
- `--http-url <http-url>`: HTTP服务器URL
- `--tcp <host:port>`: TCP连接地址
- `--headers KEY=VALUE`: HTTP请求头 (可重复使用)

### 认证配置
- `--oauth`: 启用OAuth认证
- `--auth-provider <type>`: 认证提供者类型

### 高级选项
- `--timeout <ms>`: 连接超时时间 (默认: 30000ms)
- `--trust`: 信任自签名证书
- `--include-tools <tools>`: 只包含指定工具 (逗号分隔)
- `--exclude-tools <tools>`: 排除指定工具 (逗号分隔)

## 预定义模板

### GitHub
```bash
/mcp add github
```
- **用途**: GitHub仓库操作、Issue管理、PR评论
- **环境变量**: `GITHUB_PERSONAL_ACCESS_TOKEN`
- **设置步骤**:
  1. 访问 https://github.com/settings/tokens/new
  2. 创建Personal Access Token
  3. 设置环境变量: `export GITHUB_PERSONAL_ACCESS_TOKEN=your_token`

### SQLite
```bash
/mcp add sqlite --args "/path/to/database.db"
```
- **用途**: 数据库查询和操作
- **参数**: 数据库文件路径
- **工具**: query, create_table, insert, update

### Filesystem
```bash
/mcp add filesystem --args "/safe/directory"
```
- **用途**: 本地文件和目录操作
- **参数**: 允许访问的根目录
- **安全**: 只能访问指定目录及其子目录

### Brave Search
```bash
/mcp add search
```
- **用途**: 网络搜索功能
- **环境变量**: `BRAVE_API_KEY`
- **注册**: https://api.search.brave.com/register

## 使用示例

### 开发环境配置
```bash
# 添加GitHub集成
/mcp add github

# 添加项目文件访问
/mcp add filesystem --args "$(pwd)" --scope workspace

# 添加项目数据库
/mcp add sqlite --args "./project.db"
```

### 远程服务连接
```bash
# 企业API服务器
/mcp add company-api \
  --http-url "https://api.company.com/mcp" \
  --headers "Authorization=Bearer ${API_TOKEN}" \
  --timeout 10000

# OAuth认证服务器
/mcp add oauth-service \
  --url "https://mcp.service.com/sse" \
  --oauth
```

### Docker容器服务器
```bash
# 机器学习服务
/mcp add ml-service \
  --command "docker" \
  --args "run" --args "-i" --args "--rm" \
  --args "--gpus" --args "all" \
  --args "my-ml-server:latest"
```

## 配置管理

### 配置范围
- `workspace`: 项目级配置 (默认) - `.deepv/settings.json`
- `user`: 用户全局配置 - `~/.deepv/settings.json`
- `system`: 系统级配置 - 系统配置目录

### 验证和状态
```bash
# 查看服务器状态
/mcp

# 重新连接服务器
/mcp refresh

# OAuth认证
/mcp auth <server-name>
```

## 安全最佳实践

### 环境变量保护
```bash
# 推荐：使用环境变量
/mcp add github --env "GITHUB_TOKEN=${GITHUB_TOKEN}"

# 避免：硬编码敏感信息
/mcp add github --env "GITHUB_TOKEN=ghp_xxx" # ❌ 不推荐
```

### 权限控制
```bash
# 限制工具访问
/mcp add github --exclude-tools "delete_repository,force_push"

# 文件系统隔离
/mcp add filesystem --args "./safe-dir" --scope workspace
```

### 连接安全
```bash
# 设置合理超时
/mcp add external-api --timeout 5000

# HTTPS连接验证
/mcp add secure-api --http-url "https://api.example.com" --trust
```

## 故障排除

### 常见问题

1. **命令未找到**
   ```bash
   # 检查Node.js安装
   node --version
   npm --version
   
   # 使用完整路径
   /mcp add server --command "/usr/local/bin/npx"
   ```

2. **连接超时**
   ```bash
   # 增加超时时间
   /mcp add server --timeout 60000
   
   # 检查网络连接
   curl -I https://api.example.com
   ```

3. **权限错误**
   ```bash
   # Docker权限
   sudo usermod -aG docker $USER
   
   # 文件权限
   chmod +x /path/to/command
   ```

### 获取帮助
```bash
# 查看详细帮助
/mcp help add

# 查看所有模板
/mcp help templates

# 查看配置示例  
/mcp help examples

# 故障排除指南
/mcp help troubleshooting
```

## 高级使用

### 批量配置
创建配置脚本：
```bash
#!/bin/bash
# setup-mcp.sh

# 开发工具链
/mcp add github
/mcp add filesystem --args "$(pwd)"
/mcp add sqlite --args "./dev.db"

# 云服务集成
/mcp add search
/mcp add slack

echo "MCP服务器配置完成！"
```

### 配置文件编辑
直接编辑 `.deepv/settings.json`:
```json
{
  "mcpServers": {
    "my-custom-server": {
      "command": "python",
      "args": ["/path/to/my_server.py"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      },
      "description": "我的自定义MCP服务器",
      "timeout": 30000
    }
  }
}
```

### 环境特定配置
```bash
# 开发环境
/mcp add dev-server --env "NODE_ENV=development" --scope workspace

# 生产环境
/mcp add prod-server --env "NODE_ENV=production" --scope user
```

## 总结

`/mcp add` 命令提供了灵活而强大的MCP服务器配置功能：

- ✅ **易用性**: 交互式向导和预定义模板
- ✅ **灵活性**: 支持多种连接方式和自定义配置
- ✅ **安全性**: 环境变量保护和权限控制
- ✅ **可扩展性**: 支持第三方和自定义服务器

通过合理使用这些功能，您可以大大扩展DeepV Code的能力，提高开发效率。