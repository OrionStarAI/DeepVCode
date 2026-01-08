/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MCPServerConfig } from 'deepv-code-core';

export interface MCPTemplate {
  name: string;
  displayName: string;
  description: string;
  config: Partial<MCPServerConfig>;
  requiredEnv?: string[];
  optionalEnv?: string[];
  prompts?: {
    [key: string]: {
      message: string;
      default?: string;
      required?: boolean;
      type?: 'text' | 'password' | 'path' | 'url';
    };
  };
  setup?: {
    instructions: string[];
    links?: string[];
  };
}

export const MCP_TEMPLATES: Record<string, MCPTemplate> = {
  github: {
    name: 'github',
    displayName: 'GitHub',
    description: 'GitHub仓库操作、Issue管理、PR评论',
    config: {
      command: 'docker',
      args: [
        'run',
        '-i',
        '--rm',
        '-e',
        'GITHUB_PERSONAL_ACCESS_TOKEN',
        'ghcr.io/github/github-mcp-server'
      ],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_PERSONAL_ACCESS_TOKEN}'
      },
      description: 'GitHub MCP服务器 - 提供仓库操作工具'
    },
    requiredEnv: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    prompts: {
      token: {
        message: 'GitHub Personal Access Token',
        type: 'password',
        required: true
      }
    },
    setup: {
      instructions: [
        '1. 访问 https://github.com/settings/tokens/new',
        '2. 创建新的Personal Access Token',
        '3. 选择必要的权限: repo, issues, pull_requests',
        '4. 将token设置为环境变量 GITHUB_PERSONAL_ACCESS_TOKEN'
      ],
      links: [
        'https://github.com/github/github-mcp-server',
        'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token'
      ]
    }
  },

  sqlite: {
    name: 'sqlite',
    displayName: 'SQLite',
    description: 'SQLite数据库查询和操作工具',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite'],
      description: 'SQLite MCP服务器 - 提供数据库查询工具'
    },
    prompts: {
      database_path: {
        message: '数据库文件路径',
        type: 'path',
        required: true,
        default: './database.db'
      }
    },
    setup: {
      instructions: [
        '1. 确保已安装Node.js和npm',
        '2. 指定SQLite数据库文件路径',
        '3. 如果数据库不存在，服务器会自动创建'
      ],
      links: [
        'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite'
      ]
    }
  },

  filesystem: {
    name: 'filesystem',
    displayName: 'Filesystem',
    description: '本地文件系统操作工具',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      description: 'Filesystem MCP服务器 - 提供文件操作工具'
    },
    prompts: {
      root_path: {
        message: '允许访问的根目录路径',
        type: 'path',
        required: true,
        default: '.'
      }
    },
    setup: {
      instructions: [
        '1. 确保已安装Node.js和npm',
        '2. 指定允许访问的根目录',
        '3. 服务器只能访问指定目录及其子目录',
        '4. 建议使用相对路径或项目目录'
      ],
      links: [
        'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem'
      ]
    }
  },

  search: {
    name: 'search',
    displayName: 'Brave Search',
    description: '网络搜索功能',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      env: {
        BRAVE_API_KEY: '${BRAVE_API_KEY}'
      },
      description: 'Brave Search MCP服务器 - 提供网络搜索工具'
    },
    requiredEnv: ['BRAVE_API_KEY'],
    prompts: {
      api_key: {
        message: 'Brave Search API Key',
        type: 'password',
        required: true
      }
    },
    setup: {
      instructions: [
        '1. 访问 https://api.search.brave.com/register',
        '2. 注册Brave Search API账号',
        '3. 获取API密钥',
        '4. 将API密钥设置为环境变量 BRAVE_API_KEY'
      ],
      links: [
        'https://api.search.brave.com/register',
        'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search'
      ]
    }
  },

  slack: {
    name: 'slack',
    displayName: 'Slack',
    description: 'Slack消息发送和管理 (Beta)',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      env: {
        SLACK_BOT_TOKEN: '${SLACK_BOT_TOKEN}',
        SLACK_SIGNING_SECRET: '${SLACK_SIGNING_SECRET}'
      },
      description: 'Slack MCP服务器 - 提供Slack集成工具'
    },
    requiredEnv: ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'],
    prompts: {
      bot_token: {
        message: 'Slack Bot Token (xoxb-...)',
        type: 'password',
        required: true
      },
      signing_secret: {
        message: 'Slack Signing Secret',
        type: 'password',
        required: true
      }
    },
    setup: {
      instructions: [
        '1. 访问 https://api.slack.com/apps',
        '2. 创建新的Slack应用',
        '3. 配置Bot Token Scopes',
        '4. 安装应用到工作区',
        '5. 获取Bot User OAuth Token和Signing Secret'
      ],
      links: [
        'https://api.slack.com/apps',
        'https://github.com/modelcontextprotocol/servers/tree/main/src/slack'
      ]
    }
  },

  http: {
    name: 'http',
    displayName: 'HTTP Client',
    description: '通用HTTP请求工具',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
      description: 'HTTP Client MCP服务器 - 提供HTTP请求工具'
    },
    setup: {
      instructions: [
        '1. 确保已安装Node.js和npm',
        '2. 此服务器提供通用HTTP请求功能',
        '3. 支持GET、POST、PUT、DELETE等方法',
        '4. 可以配置自定义请求头和认证'
      ],
      links: [
        'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch'
      ]
    }
  },

  postgres: {
    name: 'postgres',
    displayName: 'PostgreSQL',
    description: 'PostgreSQL数据库操作工具',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      env: {
        DATABASE_URL: '${DATABASE_URL}'
      },
      description: 'PostgreSQL MCP服务器 - 提供数据库操作工具'
    },
    requiredEnv: ['DATABASE_URL'],
    prompts: {
      database_url: {
        message: 'PostgreSQL连接URL',
        type: 'text',
        required: true,
        default: 'postgresql://username:password@localhost:5432/database'
      }
    },
    setup: {
      instructions: [
        '1. 确保PostgreSQL服务器正在运行',
        '2. 创建数据库和用户',
        '3. 设置DATABASE_URL环境变量',
        '4. 格式: postgresql://username:password@host:port/database'
      ],
      links: [
        'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres'
      ]
    }
  },

  'weather-forecast': {
    name: 'weather-forecast',
    displayName: '天气预报',
    description: '利用高德地图查询天气的中国天气预报服务',
    config: {
      command: 'node',
      args: [],
      env: {
        AMAP_API_KEY: '${AMAP_API_KEY}'
      },
      description: '利用高德地图查询天气的中国天气预报服务'
    },
    requiredEnv: ['AMAP_API_KEY'],
    prompts: {
      api_key: {
        message: '高德地图API密钥',
        type: 'password',
        required: true
      }
    },
    setup: {
      instructions: [
        '1. 访问 https://console.amap.com/',
        '2. 注册高德开发者账号',
        '3. 创建应用并获取API Key',
        '4. 将API密钥设置为环境变量 AMAP_API_KEY'
      ],
      links: [
        'https://console.amap.com/',
        'https://lbs.amap.com/api/webservice/guide/api/weatherinfo'
      ]
    }
  }
};

export function getTemplateNames(): string[] {
  return Object.keys(MCP_TEMPLATES);
}

export function getTemplate(name: string): MCPTemplate | undefined {
  return MCP_TEMPLATES[name.toLowerCase()];
}

export function getAllTemplates(): MCPTemplate[] {
  return Object.values(MCP_TEMPLATES);
}

export function isValidTemplate(name: string): boolean {
  return name.toLowerCase() in MCP_TEMPLATES;
}