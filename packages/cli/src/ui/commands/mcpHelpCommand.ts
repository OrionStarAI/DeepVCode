/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
  CommandKind,
} from './types.js';
import { t, tp } from '../utils/i18n.js';

const COLOR_GREEN = '\u001b[32m';
const COLOR_YELLOW = '\u001b[33m';
const COLOR_RED = '\u001b[31m';
const COLOR_CYAN = '\u001b[36m';
const COLOR_BLUE = '\u001b[34m';
const COLOR_MAGENTA = '\u001b[35m';
const COLOR_GREY = '\u001b[90m';
const RESET_COLOR = '\u001b[0m';
const BOLD = '\u001b[1m';

const getMainHelp = (): string => {
  return `${COLOR_CYAN}${BOLD}${t('mcp.help.main.title')}${RESET_COLOR}

${t('mcp.help.main.description')}

${COLOR_GREEN}${t('mcp.help.main.commands.title')}${RESET_COLOR}
  ${COLOR_CYAN}/mcp${RESET_COLOR}                       ${t('mcp.help.main.command.status')}
  ${COLOR_CYAN}/mcp add <name>${RESET_COLOR}           ${t('mcp.help.main.command.add')}
  ${COLOR_CYAN}/mcp auth <server>${RESET_COLOR}        ${t('mcp.help.main.command.auth')}
  ${COLOR_CYAN}/mcp refresh${RESET_COLOR}              ${t('mcp.help.main.command.refresh')}

${COLOR_BLUE}${t('mcp.help.main.detailed.title')}${RESET_COLOR}
  ${COLOR_CYAN}/mcp help add${RESET_COLOR}             ${t('mcp.help.main.help.add')}
  ${COLOR_CYAN}/mcp help templates${RESET_COLOR}       ${t('mcp.help.main.help.templates')}
  ${COLOR_CYAN}/mcp help examples${RESET_COLOR}        ${t('mcp.help.main.help.examples')}
  ${COLOR_CYAN}/mcp help troubleshooting${RESET_COLOR} ${t('mcp.help.main.help.troubleshooting')}
  ${COLOR_CYAN}/mcp help oauth${RESET_COLOR}           ${t('mcp.help.main.help.oauth')}
  ${COLOR_CYAN}/mcp help security${RESET_COLOR}        ${t('mcp.help.main.help.security')}

${COLOR_YELLOW}${t('mcp.help.main.quickstart.title')}${RESET_COLOR}
  ${COLOR_GREY}1.${RESET_COLOR} ${tp('mcp.help.main.quickstart.step1', { command: `${COLOR_CYAN}'/mcp add'${RESET_COLOR}` })}
  ${COLOR_GREY}2.${RESET_COLOR} ${t('mcp.help.main.quickstart.step2')}
  ${COLOR_GREY}3.${RESET_COLOR} ${t('mcp.help.main.quickstart.step3')}
  ${COLOR_GREY}4.${RESET_COLOR} ${tp('mcp.help.main.quickstart.step4', { command: `${COLOR_CYAN}'/mcp'${RESET_COLOR}` })}

${COLOR_MAGENTA}${tp('mcp.help.main.tip', { path: `${COLOR_GREY}.deepv/settings.json${RESET_COLOR}` })}${RESET_COLOR}

${tp('mcp.help.main.subcommand', { example: `${COLOR_CYAN}/mcp help add${RESET_COLOR}` })}`;
};

const getAddHelp = (): string => {
  return `${COLOR_CYAN}${BOLD}🔧 MCP Add 命令详细指南${RESET_COLOR}

${COLOR_CYAN}/mcp add${RESET_COLOR} 命令用于添加新的MCP服务器到您的配置中。

${COLOR_GREEN}📖 基本语法:${RESET_COLOR}
  ${COLOR_CYAN}/mcp add [server-name] [options]${RESET_COLOR}

${COLOR_YELLOW}🎯 使用模式:${RESET_COLOR}

${COLOR_BLUE}1️⃣ 交互式向导 (推荐新手)${RESET_COLOR}
   ${COLOR_CYAN}/mcp add${RESET_COLOR}

   启动图形化配置向导，支持:
   ${COLOR_GREY}•${RESET_COLOR} 预定义模板选择
   ${COLOR_GREY}•${RESET_COLOR} 逐步配置引导
   ${COLOR_GREY}•${RESET_COLOR} 自动验证和测试
   ${COLOR_GREY}•${RESET_COLOR} 智能错误检查

${COLOR_BLUE}2️⃣ 模板快速配置${RESET_COLOR}
   ${COLOR_CYAN}/mcp add github${RESET_COLOR}           # GitHub仓库工具
   ${COLOR_CYAN}/mcp add sqlite${RESET_COLOR}           # SQLite数据库工具
   ${COLOR_CYAN}/mcp add filesystem${RESET_COLOR}       # 本地文件操作
   ${COLOR_CYAN}/mcp add search${RESET_COLOR}           # Brave搜索工具

${COLOR_BLUE}3️⃣ 自定义配置${RESET_COLOR}
   ${COLOR_CYAN}/mcp add my-server --command "npx" --args "@my/server"${RESET_COLOR}

${COLOR_GREEN}📋 配置参数:${RESET_COLOR}

${COLOR_YELLOW}🔧 基础参数:${RESET_COLOR}
  ${COLOR_CYAN}--scope <level>${RESET_COLOR}           配置保存位置 [workspace|user|system]
  ${COLOR_CYAN}--template <name>${RESET_COLOR}         使用预定义模板
  ${COLOR_CYAN}--description "desc"${RESET_COLOR}      服务器描述

${COLOR_YELLOW}⚡ 连接方式:${RESET_COLOR}
  ${COLOR_CYAN}--command <cmd>${RESET_COLOR}           可执行命令路径
  ${COLOR_CYAN}--args <arg>${RESET_COLOR}              命令参数 (可重复使用)
  ${COLOR_CYAN}--env KEY=VALUE${RESET_COLOR}           环境变量 (可重复使用)
  ${COLOR_CYAN}--env-file <path>${RESET_COLOR}         环境变量文件
  ${COLOR_CYAN}--cwd <path>${RESET_COLOR}              工作目录

${COLOR_YELLOW}🌐 网络连接:${RESET_COLOR}
  ${COLOR_CYAN}--url <sse-url>${RESET_COLOR}           Server-Sent Events URL
  ${COLOR_CYAN}--http-url <http-url>${RESET_COLOR}     HTTP服务器URL
  ${COLOR_CYAN}--tcp <host:port>${RESET_COLOR}         TCP连接地址
  ${COLOR_CYAN}--headers KEY=VALUE${RESET_COLOR}       HTTP请求头 (可重复使用)

${COLOR_YELLOW}🔐 认证配置:${RESET_COLOR}
  ${COLOR_CYAN}--oauth${RESET_COLOR}                   启用OAuth认证
  ${COLOR_CYAN}--auth-provider <type>${RESET_COLOR}    认证提供者类型

${COLOR_YELLOW}⚙️ 高级选项:${RESET_COLOR}
  ${COLOR_CYAN}--timeout <ms>${RESET_COLOR}            连接超时 (默认: 30000ms)
  ${COLOR_CYAN}--trust${RESET_COLOR}                   信任自签名证书
  ${COLOR_CYAN}--include-tools <tools>${RESET_COLOR}   只包含指定工具
  ${COLOR_CYAN}--exclude-tools <tools>${RESET_COLOR}   排除指定工具

${COLOR_MAGENTA}💡 实用示例:${RESET_COLOR}
  查看 ${COLOR_CYAN}'/mcp help examples'${RESET_COLOR} 获取更多配置示例
  查看 ${COLOR_CYAN}'/mcp help templates'${RESET_COLOR} 了解预定义模板

${COLOR_RED}❌ 常见问题:${RESET_COLOR}
  查看 ${COLOR_CYAN}'/mcp help troubleshooting'${RESET_COLOR} 解决配置问题`;
};

const getTemplatesHelp = (): string => {
  return `${COLOR_CYAN}${BOLD}${t('mcp.help.templates.title')}${RESET_COLOR}

${t('mcp.help.templates.description')}

${COLOR_GREEN}${t('mcp.help.templates.github.title')}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.github.purpose')}${RESET_COLOR}
   ${COLOR_GREY}${tp('mcp.help.templates.github.command', { command: `${COLOR_CYAN}/mcp add github${RESET_COLOR}` })}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.github.env')}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.github.tools')}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.github.docs')}${RESET_COLOR}

${COLOR_BLUE}${t('mcp.help.templates.sqlite.title')}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.sqlite.purpose')}${RESET_COLOR}
   ${COLOR_GREY}${tp('mcp.help.templates.sqlite.command', { command: `${COLOR_CYAN}/mcp add sqlite${RESET_COLOR}` })}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.sqlite.args')}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.sqlite.tools')}${RESET_COLOR}
   ${COLOR_GREY}${tp('mcp.help.templates.sqlite.example', { example: `${COLOR_CYAN}/mcp add sqlite --args "/path/to/database.db"${RESET_COLOR}` })}${RESET_COLOR}

${COLOR_YELLOW}${t('mcp.help.templates.filesystem.title')}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.filesystem.purpose')}${RESET_COLOR}
   ${COLOR_GREY}${tp('mcp.help.templates.filesystem.command', { command: `${COLOR_CYAN}/mcp add filesystem${RESET_COLOR}` })}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.filesystem.args')}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.filesystem.tools')}${RESET_COLOR}
   ${COLOR_GREY}${tp('mcp.help.templates.filesystem.example', { example: `${COLOR_CYAN}/mcp add filesystem --args "/home/user/projects"${RESET_COLOR}` })}${RESET_COLOR}

${COLOR_MAGENTA}${t('mcp.help.templates.search.title')}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.search.purpose')}${RESET_COLOR}
   ${COLOR_GREY}${tp('mcp.help.templates.search.command', { command: `${COLOR_CYAN}/mcp add search${RESET_COLOR}` })}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.search.env')}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.search.tools')}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.search.register')}${RESET_COLOR}

${COLOR_GREEN}${t('mcp.help.templates.slack.title')}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.slack.purpose')}${RESET_COLOR}
   ${COLOR_GREY}${tp('mcp.help.templates.slack.command', { command: `${COLOR_CYAN}/mcp add slack${RESET_COLOR}` })}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.slack.env')}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.slack.tools')}${RESET_COLOR}

${COLOR_BLUE}${t('mcp.help.templates.http.title')}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.http.purpose')}${RESET_COLOR}
   ${COLOR_GREY}${tp('mcp.help.templates.http.command', { command: `${COLOR_CYAN}/mcp add http${RESET_COLOR}` })}${RESET_COLOR}
   ${COLOR_GREY}${t('mcp.help.templates.http.tools')}${RESET_COLOR}

${COLOR_MAGENTA}${t('mcp.help.templates.tips.title')}${RESET_COLOR}
${COLOR_GREY}${t('mcp.help.templates.tips.check')}${RESET_COLOR}
${COLOR_GREY}${t('mcp.help.templates.tips.wizard')}${RESET_COLOR}
${COLOR_GREY}${t('mcp.help.templates.tips.custom')}${RESET_COLOR}
${COLOR_GREY}${tp('mcp.help.templates.tips.update', { command: `${COLOR_CYAN}'/mcp refresh'${RESET_COLOR}` })}${RESET_COLOR}

${COLOR_YELLOW}${t('mcp.help.templates.need.more')}${RESET_COLOR}
  ${t('mcp.help.templates.github.issues')}
  ${tp('mcp.help.templates.custom.wizard', { command: `${COLOR_CYAN}'/mcp add'${RESET_COLOR}` })}`;
};

const getExamplesHelp = (): string => {
  return `${COLOR_CYAN}${BOLD}💡 MCP 配置示例集合${RESET_COLOR}

这里提供了各种场景下的实际配置示例，可以直接复制使用。

${COLOR_GREEN}🔧 开发工具集成${RESET_COLOR}

${COLOR_BLUE}1️⃣ GitHub + 本地开发${RESET_COLOR}
   ${COLOR_CYAN}/mcp add github${RESET_COLOR}
   ${COLOR_CYAN}/mcp add filesystem --args "$(pwd)" --scope workspace${RESET_COLOR}
   ${COLOR_CYAN}/mcp add sqlite --args "./project.db"${RESET_COLOR}

${COLOR_BLUE}2️⃣ 全栈开发环境${RESET_COLOR}
   ${COLOR_CYAN}/mcp add github${RESET_COLOR}
   ${COLOR_CYAN}/mcp add postgres --env "DATABASE_URL=postgresql://localhost/mydb"${RESET_COLOR}
   ${COLOR_CYAN}/mcp add redis --tcp "localhost:6379"${RESET_COLOR}
   ${COLOR_CYAN}/mcp add http --description "API测试工具"${RESET_COLOR}

${COLOR_YELLOW}🌐 远程服务连接${RESET_COLOR}

${COLOR_BLUE}3️⃣ 企业内部API${RESET_COLOR}
   ${COLOR_CYAN}/mcp add company-api \\${RESET_COLOR}
   ${COLOR_CYAN}  --http-url "https://api.company.com/mcp" \\${RESET_COLOR}
   ${COLOR_CYAN}  --headers "Authorization=Bearer \${COMPANY_API_TOKEN}" \\${RESET_COLOR}
   ${COLOR_CYAN}  --headers "X-Department=Engineering" \\${RESET_COLOR}
   ${COLOR_CYAN}  --timeout 10000${RESET_COLOR}

${COLOR_BLUE}4️⃣ 云端MCP服务${RESET_COLOR}
   ${COLOR_CYAN}/mcp add cloud-service \\${RESET_COLOR}
   ${COLOR_CYAN}  --url "https://mcp.cloudprovider.com/sse" \\${RESET_COLOR}
   ${COLOR_CYAN}  --oauth \\${RESET_COLOR}
   ${COLOR_CYAN}  --trust${RESET_COLOR}

${COLOR_MAGENTA}📦 NPM包服务器${RESET_COLOR}

${COLOR_BLUE}5️⃣ 第三方工具${RESET_COLOR}
   ${COLOR_CYAN}/mcp add weather \\${RESET_COLOR}
   ${COLOR_CYAN}  --command "npx" \\${RESET_COLOR}
   ${COLOR_CYAN}  --args "@weather/mcp-server" \\${RESET_COLOR}
   ${COLOR_CYAN}  --env "WEATHER_API_KEY=\${WEATHER_KEY}" \\${RESET_COLOR}
   ${COLOR_CYAN}  --description "天气信息工具"${RESET_COLOR}

${COLOR_BLUE}6️⃣ 本地开发包${RESET_COLOR}
   ${COLOR_CYAN}/mcp add my-tools \\${RESET_COLOR}
   ${COLOR_CYAN}  --command "node" \\${RESET_COLOR}
   ${COLOR_CYAN}  --args "/path/to/my-mcp-server/index.js" \\${RESET_COLOR}
   ${COLOR_CYAN}  --cwd "/path/to/my-mcp-server" \\${RESET_COLOR}
   ${COLOR_CYAN}  --env "NODE_ENV=development"${RESET_COLOR}

${COLOR_GREEN}🐳 Docker容器部署${RESET_COLOR}

${COLOR_BLUE}7️⃣ 复杂Docker配置${RESET_COLOR}
   ${COLOR_CYAN}/mcp add ml-service \\${RESET_COLOR}
   ${COLOR_CYAN}  --command "docker" \\${RESET_COLOR}
   ${COLOR_CYAN}  --args "run" --args "-i" --args "--rm" \\${RESET_COLOR}
   ${COLOR_CYAN}  --args "--gpus" --args "all" \\${RESET_COLOR}
   ${COLOR_CYAN}  --args "-v" --args "\${PWD}:/workspace" \\${RESET_COLOR}
   ${COLOR_CYAN}  --args "my-ml-server:latest"${RESET_COLOR}

${COLOR_MAGENTA}💡 配置技巧:${RESET_COLOR}
${COLOR_GREY}•${RESET_COLOR} 使用环境变量保护敏感信息
${COLOR_GREY}•${RESET_COLOR} 设置合理的超时时间
${COLOR_GREY}•${RESET_COLOR} 为服务器添加描述便于管理
${COLOR_GREY}•${RESET_COLOR} 使用工具过滤提高安全性
${COLOR_GREY}•${RESET_COLOR} 根据项目需要选择配置范围

${COLOR_YELLOW}🔄 批量配置:${RESET_COLOR}
  可以编写脚本批量添加多个服务器
  或直接编辑settings.json文件进行配置`;
};

const getTroubleshootingHelp = (): string => {
  return `${COLOR_CYAN}${BOLD}🔧 MCP 故障排除指南${RESET_COLOR}

遇到MCP服务器连接或配置问题？这里提供了常见问题的解决方案。

${COLOR_RED}❌ 常见错误及解决方案${RESET_COLOR}

${COLOR_RED}🔴 连接超时${RESET_COLOR}
   ${COLOR_GREY}错误:${RESET_COLOR} "MCP server connection timeout"
   ${COLOR_GREY}原因:${RESET_COLOR} 服务器启动慢或网络问题
   ${COLOR_GREY}解决:${RESET_COLOR}
   ${COLOR_GREY}•${RESET_COLOR} 增加超时时间: ${COLOR_CYAN}--timeout 60000${RESET_COLOR}
   ${COLOR_GREY}•${RESET_COLOR} 检查网络连接和防火墙
   ${COLOR_GREY}•${RESET_COLOR} 验证服务器地址是否正确

${COLOR_RED}🔴 命令未找到${RESET_COLOR}
   ${COLOR_GREY}错误:${RESET_COLOR} "Command not found: npx"
   ${COLOR_GREY}原因:${RESET_COLOR} Node.js或npm未安装
   ${COLOR_GREY}解决:${RESET_COLOR}
   ${COLOR_GREY}•${RESET_COLOR} 安装Node.js: https://nodejs.org
   ${COLOR_GREY}•${RESET_COLOR} 检查PATH环境变量
   ${COLOR_GREY}•${RESET_COLOR} 使用完整路径: ${COLOR_CYAN}--command "/usr/local/bin/npx"${RESET_COLOR}

${COLOR_RED}🔴 Docker权限错误${RESET_COLOR}
   ${COLOR_GREY}错误:${RESET_COLOR} "Permission denied: docker"
   ${COLOR_GREY}原因:${RESET_COLOR} 用户无Docker权限
   ${COLOR_GREY}解决:${RESET_COLOR}
   ${COLOR_GREY}•${RESET_COLOR} 添加到docker组: ${COLOR_CYAN}sudo usermod -aG docker $USER${RESET_COLOR}
   ${COLOR_GREY}•${RESET_COLOR} 重新登录系统
   ${COLOR_GREY}•${RESET_COLOR} 或使用sudo: ${COLOR_CYAN}--command "sudo docker"${RESET_COLOR}

${COLOR_GREEN}🔧 诊断工具${RESET_COLOR}

${COLOR_BLUE}🔍 检查服务器状态${RESET_COLOR}
   ${COLOR_CYAN}/mcp${RESET_COLOR}                      # 查看所有服务器状态
   ${COLOR_CYAN}/mcp <server-name>${RESET_COLOR}        # 查看特定服务器详情

${COLOR_BLUE}🔍 测试连接${RESET_COLOR}
   ${COLOR_CYAN}/mcp refresh${RESET_COLOR}              # 重新连接所有服务器
   ${COLOR_CYAN}/mcp refresh <server>${RESET_COLOR}     # 重新连接特定服务器

${COLOR_BLUE}🔍 验证配置${RESET_COLOR}
   ${COLOR_CYAN}cat .deepv/settings.json${RESET_COLOR}  # 检查配置文件
   ${COLOR_CYAN}/mcp help examples${RESET_COLOR}        # 对比正确配置

${COLOR_YELLOW}🆘 获取帮助${RESET_COLOR}

如果以上方法无法解决问题:

${COLOR_BLUE}📧 提交Issue${RESET_COLOR}
   仓库: https://github.com/your-repo/issues
   包含:
   ${COLOR_GREY}•${RESET_COLOR} 错误信息完整日志
   ${COLOR_GREY}•${RESET_COLOR} 配置文件内容 (移除敏感信息)
   ${COLOR_GREY}•${RESET_COLOR} 系统信息: ${COLOR_CYAN}uname -a${RESET_COLOR}
   ${COLOR_GREY}•${RESET_COLOR} DeepV版本: ${COLOR_CYAN}deepv --version${RESET_COLOR}

${COLOR_BLUE}💬 社区支持${RESET_COLOR}
   Discord: https://discord.gg/deepv
   论坛: https://community.deepv.ai

${COLOR_BLUE}📖 官方文档${RESET_COLOR}
   完整指南: https://deepv.ai/docs/mcp
   API文档: https://deepv.ai/docs/mcp-api`;
};

const getOAuthHelp = (): string => {
  return `${COLOR_CYAN}${BOLD}${t('mcp.help.oauth.title')}${RESET_COLOR}

${t('mcp.help.oauth.description')}

${COLOR_GREEN}${t('mcp.help.oauth.supported.title')}${RESET_COLOR}

${COLOR_BLUE}${t('mcp.help.oauth.dynamic.title')}${RESET_COLOR}
   ${t('mcp.help.oauth.dynamic.description')}
   ${COLOR_CYAN}${t('mcp.help.oauth.dynamic.example')}${RESET_COLOR}

${COLOR_BLUE}${t('mcp.help.oauth.google.title')}${RESET_COLOR}
   ${t('mcp.help.oauth.google.description')}
   ${COLOR_CYAN}${t('mcp.help.oauth.google.example')}${RESET_COLOR}

${COLOR_YELLOW}${t('mcp.help.oauth.quickstart.title')}${RESET_COLOR}

${COLOR_BLUE}${t('mcp.help.oauth.quickstart.step1.title')}${RESET_COLOR}
   ${COLOR_CYAN}${t('mcp.help.oauth.quickstart.step1.example')}${RESET_COLOR}

${COLOR_BLUE}${t('mcp.help.oauth.quickstart.step2.title')}${RESET_COLOR}
   ${COLOR_CYAN}${t('mcp.help.oauth.quickstart.step2.example')}${RESET_COLOR}

${COLOR_BLUE}${t('mcp.help.oauth.quickstart.step3.title')}${RESET_COLOR}
   ${COLOR_CYAN}${t('mcp.help.oauth.quickstart.step3.example')}${RESET_COLOR}

${COLOR_MAGENTA}${t('mcp.help.oauth.best.practices.title')}${RESET_COLOR}
${COLOR_GREY}${t('mcp.help.oauth.best.practices.update')}${RESET_COLOR}
${COLOR_GREY}${t('mcp.help.oauth.best.practices.minimal')}${RESET_COLOR}
${COLOR_GREY}${t('mcp.help.oauth.best.practices.protect')}${RESET_COLOR}
${COLOR_GREY}${t('mcp.help.oauth.best.practices.monitor')}${RESET_COLOR}`;
};

const getSecurityHelp = (): string => {
  return `${COLOR_CYAN}${BOLD}🛡️ MCP 安全最佳实践${RESET_COLOR}

使用MCP服务器时，请遵循以下安全指导原则：

${COLOR_RED}⚠️ 安全警告${RESET_COLOR}
在使用第三方MCP服务器之前，确保您信任其来源并了解其提供的工具。
您对第三方服务器的使用风险自负。

${COLOR_GREEN}🔒 基本安全原则${RESET_COLOR}

${COLOR_BLUE}1️⃣ 验证服务器来源${RESET_COLOR}
${COLOR_GREY}•${RESET_COLOR} 只使用可信的官方MCP服务器
${COLOR_GREY}•${RESET_COLOR} 检查GitHub仓库的维护状态
${COLOR_GREY}•${RESET_COLOR} 阅读服务器文档和代码

${COLOR_BLUE}2️⃣ 最小权限原则${RESET_COLOR}
${COLOR_GREY}•${RESET_COLOR} 只授予必要的访问权限
${COLOR_GREY}•${RESET_COLOR} 使用工具过滤限制功能
${COLOR_GREY}•${RESET_COLOR} 定期审查权限设置

${COLOR_BLUE}3️⃣ 环境变量保护${RESET_COLOR}
${COLOR_GREY}•${RESET_COLOR} 使用环境变量存储敏感信息
${COLOR_GREY}•${RESET_COLOR} 不在配置文件中硬编码密钥
${COLOR_GREY}•${RESET_COLOR} 使用.env文件并加入.gitignore

${COLOR_YELLOW}🔧 安全配置示例${RESET_COLOR}

${COLOR_BLUE}限制工具访问${RESET_COLOR}
${COLOR_CYAN}/mcp add github --exclude-tools "delete_repository,force_push"${RESET_COLOR}

${COLOR_BLUE}设置超时保护${RESET_COLOR}
${COLOR_CYAN}/mcp add external-api --timeout 5000${RESET_COLOR}

${COLOR_BLUE}工作区隔离${RESET_COLOR}
${COLOR_CYAN}/mcp add filesystem --args "./safe-directory" --scope workspace${RESET_COLOR}

${COLOR_MAGENTA}💡 监控和审计${RESET_COLOR}
${COLOR_GREY}•${RESET_COLOR} 定期检查MCP服务器状态
${COLOR_GREY}•${RESET_COLOR} 监控异常连接和错误
${COLOR_GREY}•${RESET_COLOR} 审查工具使用日志
${COLOR_GREY}•${RESET_COLOR} 及时更新服务器版本`;
};

// Help command implementation
const helpCommand: SlashCommand = {
  name: 'help',
  description: t('mcp.help.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, args: string): Promise<SlashCommandActionReturn> => {
    const topic = args.trim().toLowerCase();

    let helpContent: string;

    switch (topic) {
      case 'add':
        helpContent = getAddHelp();
        break;
      case 'templates':
        helpContent = getTemplatesHelp();
        break;
      case 'examples':
        helpContent = getExamplesHelp();
        break;
      case 'troubleshooting':
        helpContent = getTroubleshootingHelp();
        break;
      case 'oauth':
        helpContent = getOAuthHelp();
        break;
      case 'security':
        helpContent = getSecurityHelp();
        break;
      default:
        helpContent = getMainHelp();
        break;
    }

    return {
      type: 'message',
      messageType: 'info',
      content: helpContent,
    };
  },
};

export { helpCommand };