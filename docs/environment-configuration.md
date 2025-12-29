# 环境配置指南

本文档介绍如何通过环境变量配置 DeepV Code 的服务器地址，以便在不同环境之间轻松切换。

## 🎯 背景

之前需要手动修改代码中的服务器地址来切换环境，现在通过 `DEEPX_SERVER_URL` 环境变量统一管理所有服务器地址配置。

## 📋 环境变量

### 主要配置

- `DEEPX_SERVER_URL`: 服务器基础地址
- `NODE_ENV`: 运行环境 (production/development/test)
- `FEISHU_APP_ID`: 飞书应用 ID (可选)
- `FEISHU_APP_SECRET`: 飞书应用密钥 (可选)

## 🔧 使用方法

### 方法一: 使用预设环境文件

我们提供了三个预设的环境配置文件：

```bash
# 切换到生产环境
npm run env:production

# 切换到开发环境  
npm run env:development

# 切换到测试环境
npm run env:test
```

或者直接使用脚本：

```bash
./scripts/switch-env.sh production
./scripts/switch-env.sh development
./scripts/switch-env.sh test
```

### 方法二: 手动创建 .env 文件

在 `packages/cli/` 目录下创建 `.env` 文件：

```bash
# 生产环境
DEEPX_SERVER_URL=https://code.deepvlab.ai
NODE_ENV=production

# 本地开发环境
DEEPX_SERVER_URL=http://localhost:3000
NODE_ENV=development

# 自定义环境
DEEPX_SERVER_URL=https://your-custom-server.com
NODE_ENV=development
```

### 方法三: 运行时设置

```bash
# 临时设置环境变量运行
DEEPX_SERVER_URL=http://localhost:3000 npm start

# 或者导出环境变量
export DEEPX_SERVER_URL=http://localhost:3000
npm start
```

## 🌍 预设环境

### 生产环境 (production)
- **服务器**: https://code.deepvlab.ai
- **用途**: 正式线上环境
- **配置文件**: `.env.production`

### 开发环境 (development)  
- **服务器**: http://localhost:3000
- **用途**: 本地开发和调试
- **配置文件**: `.env.development`
- **额外功能**: 启用调试模式

### 测试环境 (test)
- **服务器**: https://test.deepvlab.ai  
- **用途**: 测试和预发布
- **配置文件**: `.env.test`

## 📁 文件结构

```
packages/cli/
├── .env.example          # 环境变量示例文件
├── .env.production       # 生产环境配置
├── .env.development      # 开发环境配置
├── .env.test            # 测试环境配置
└── .env                 # 当前使用的配置 (由脚本生成)
```

## 🔄 环境切换示例

```bash
# 1. 切换到开发环境进行本地调试
npm run env:development
npm start

# 2. 切换到测试环境进行测试
npm run env:test  
npm run build && npm start

# 3. 切换到生产环境进行部署
npm run env:production
npm run newpack
```

## ⚠️ 注意事项

1. **安全性**: 不要在代码中硬编码敏感信息，使用环境变量
2. **优先级**: 环境变量 > .env 文件 > 默认值
3. **重启**: 修改环境变量后需要重启应用
4. **Docker**: 在 Docker 中使用 `-e` 参数传递环境变量

## 🐳 Docker 使用

```bash
# 使用环境变量运行 Docker 容器
docker run -e DEEPX_SERVER_URL=https://your-server.com your-image

# 或在 docker-compose.yml 中配置
environment:
  - DEEPX_SERVER_URL=https://your-server.com
  - NODE_ENV=production
```

## 🔍 验证配置

启动应用后，可以在日志中查看当前使用的服务器地址，确认配置是否生效。

## 📞 支持

如果遇到环境配置问题，请检查：
1. 环境变量是否正确设置
2. .env 文件是否存在且格式正确
3. 服务器地址是否可访问
4. 应用是否已重启