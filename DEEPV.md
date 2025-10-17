# 🚀 DeepV Code 项目上下文指南 (DEEPV.md)

## 📋 项目概览

**DeepV Code** 是一款由 Google Gemini AI 驱动的 **代码生成 Agent 终端应用**（CLI 工具）。项目采用现代化的 TypeScript + Node.js 技术栈，通过 monorepo 架构（npm workspaces）组织三个核心包，为开发者提供智能的代码生成、协助和工具集成能力。

**核心定位**：
- 🎯 **AI 代码生成助手**：与 Gemini 模型交互完成编程任务
- 🔧 **工具执行引擎**：集成 30+ 内置工具和 MCP 生态
- 🎨 **终端 UI 框架**：使用 React + Ink 提供现代化命令行界面
- 🔐 **安全沙箱**：支持 Docker、Podman 和 macOS Seatbelt 隔离

**项目链接**：https://github.com/OrionStarAI/DeepVCode
**许可证**：Apache 2.0
**维护者**：DeepV Code Team

---

## 🏗️ 项目架构

### 核心包结构（npm workspaces）

```
DeepVCode/
├── packages/cli/              # CLI 前端 - 用户交互层
│   ├── src/
│   │   ├── gemini.tsx         # 主入口和 CLI 循环（796 行）
│   │   ├── nonInteractiveCli.ts # 非交互模式处理
│   │   ├── ui/                # 89 个 React+Ink 组件（终端 UI）
│   │   ├── config/            # 配置、参数解析、设置
│   │   ├── auth/              # 认证逻辑、令牌管理
│   │   ├── services/          # 业务服务
│   │   └── utils/             # 工具函数
│   └── package.json
│
├── packages/core/             # 核心业务逻辑 - Gemini API 交互
│   ├── src/
│   │   ├── core/              # 核心引擎
│   │   │   ├── geminiChat.ts       # Gemini 聊天实现（876 行）
│   │   │   ├── client.ts           # Gemini 客户端（719 行）
│   │   │   ├── contentGenerator.ts # 内容生成
│   │   │   ├── prompts.ts          # 系统提示词管理
│   │   │   ├── tokenLimits.ts      # Token 限制规则
│   │   │   └── turn.ts             # 对话轮次管理（382 行）
│   │   ├── tools/             # 30+ 工具实现
│   │   │   ├── mcp-client.ts       # MCP 客户端（1141 行）
│   │   │   ├── mcp-tool.ts         # MCP 工具包装（289 行）
│   │   │   ├── tool-registry.ts    # 工具注册表（533 行）
│   │   │   ├── read-file.ts, write-file.ts, edit.ts, delete-file.ts
│   │   │   ├── shell.ts, grep.ts, glob.ts, ls.ts, read-lints.ts
│   │   │   ├── web-fetch.ts, web-search.ts
│   │   │   ├── memoryTool.ts, lint-fix.ts, replace.ts
│   │   │   └── ... 其他工具
│   │   ├── mcp/               # MCP OAuth 和认证
│   │   ├── auth/              # 令牌管理、Cheeth OA
│   │   ├── config/            # 配置解析
│   │   ├── services/          # 高级服务
│   │   │   ├── sessionManager.ts       # 会话和检查点
│   │   │   ├── fileDiscoveryService.ts # 文件发现
│   │   │   ├── gitService.ts          # Git 操作
│   │   │   ├── compressionService.ts  # Token 压缩
│   │   │   └── loopDetectionService.ts # 循环检测
│   │   ├── telemetry/        # OpenTelemetry 遥测
│   │   ├── events/           # 事件系统
│   │   ├── types/            # TypeScript 类型定义
│   │   └── utils/            # 工具函数
│   └── package.json
│
├── packages/vscode-ui-plugin/ # VSCode 扩展 UI 插件
├── packages/vscode-ide-companion/ # VSCode IDE 伴侣
│
├── scripts/                   # 构建脚本（15 个）
│   ├── build.js              # 主构建脚本
│   ├── bundle.js / esbuild.config.js # 打包
│   ├── copy_bundle_assets.js # 资产复制
│   ├── build_sandbox.js      # 沙箱构建
│   ├── build_vscode_companion.js # VSCode 伴侣构建
│   └── ... 其他脚本
│
├── docs/                     # 详细文档（76+ .md 文件）
├── integration-tests/        # 集成测试
├── bundle/                   # 构建输出目录
│   ├── dvcode.js             # 最终可执行文件
│   ├── assets/               # 资产文件
│   └── node_modules/         # 打包的依赖
│
├── package.json              # 工作区根配置
├── tsconfig.json             # TypeScript 编译配置
├── eslint.config.js          # ESLint 规则
├── esbuild.config.js         # esbuild 打包配置
└── .prettierrc.json          # Prettier 格式化规则
```

### 核心流程图

```
用户输入命令
   ↓
packages/cli/index.ts (启动)
   ├─→ gemini.tsx (主循环)
   │   ├─→ 参数解析 (config/*.ts)
   │   ├─→ 认证验证 (auth/*.ts)
   │   └─→ React UI 渲染 (ui/components/*.tsx 使用 Ink)
   └─→ 调用 packages/core API
        ↓
packages/core/index.ts (业务逻辑)
   ├─→ Config 初始化
   ├─→ ContentGenerator 生成内容
   ├─→ GeminiChat 发送到 Gemini API
   ├─→ 处理响应和工具调用
   │   ├─→ ToolRegistry 工具查询
   │   ├─→ ToolExecutionEngine 执行工具
   │   └─→ MCPClient 发现和执行 MCP 工具
   ├─→ SessionManager 会话管理（检查点）
   ├─→ CompressionService Token 压缩
   ├─→ Telemetry 遥测记录
   └─→ 返回结果
        ↓
packages/cli UI 显示结果
   ↓
用户交互（继续提问 / 编辑 / 执行）
```

---

## 🛠️ 技术栈与依赖

### 编程语言与运行时

| 技术 | 版本 | 用途 |
|------|------|------|
| **Node.js** | >= 20.0.0（严格要求） | 运行时环境 |
| **TypeScript** | 5.3.3+ | 语言和类型系统 |
| **编译目标** | ES2022 | JavaScript 兼容性 |
| **模块系统** | ESM (ES6 import/export) | 模块化 |

### 核心框架和库

| 包名 | 版本 | 用途 | 关键性 |
|------|------|------|--------|
| **@google/genai** | 1.9.0 | Gemini API SDK | 🔴 Critical |
| **@modelcontextprotocol/sdk** | ^1.18.0 | MCP 服务器支持 | 🔴 Critical |
| **react** | ^19.1.0 | UI 框架（CLI） | 🔴 Critical |
| **ink** | ^6.0.1 | 终端 UI 渲染 | 🔴 Critical |
| **yargs** | ^17.7.2 | CLI 参数解析 | 🟡 Important |
| **axios** | ^1.6.0 | HTTP 请求 | 🟡 Important |
| **dotenv** | ^17.1.0 | 环境变量管理 | 🟡 Important |
| **glob** | ^10.4.5 | 文件模式匹配 | 🟡 Important |
| **simple-git** | ^3.28.0 | Git 操作 | 🟡 Important |
| **@vscode/ripgrep** | ^1.15.14 | 高速文本搜索 | 🟡 Important |
| **@opentelemetry/** | Latest | 遥测系统 | 🟢 Moderate |
| **ws** | ^8.18.0 | WebSocket | 🟢 Moderate |
| **xlsx, pdf-parse, mammoth** | Latest | 文件格式 | 🟢 Moderate |

### 开发工具

| 工具 | 版本 | 用途 |
|------|------|------|
| **Vitest** | 3.2.4+ | 单元测试框架 |
| **ESLint** | 9.24.0+ | 代码质量检查 |
| **Prettier** | 3.5.3+ | 代码格式化 |
| **esbuild** | 0.25.0+ | 快速打包工具 |
| **webpack** | 5.x | VSCode 扩展打包 |
| **TypeScript** | 5.3.3+ | 编译和类型检查 |

---

## 📦 npm 命令速查表

### 开发和构建

| 命令 | 说明 | 耗时 | 频率 |
|------|------|------|------|
| `npm install` 或 `npm i` | 首次安装所有依赖 | 1 分钟 | 一次性 |
| `npm run build` | 日常构建（cli + core） | 5-10 秒 | 每次修改 |
| `npm run dev` | 启动开发模式 | 5 秒 | 测试 UI |
| `npm run pack:prod` | 生产 .tgz 包 | 20 秒 | 发布 |



---

## 📝 开发规范和约定

### 文件和导入规范

```typescript
// 1. License Header（所有 .ts/.tsx 文件必须）
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 2. 导入顺序（严格遵循）
// 外部库（@google, @react, 第三方）
import { /* ... */ } from '@google/genai';
import React from 'react';
import axios from 'axios';

// 项目类型
import type { /* ... */ } from '../types/file.js';

// 本地导入
import { /* ... */ } from './file.js';
import { /* ... */ } from './index.js';

// 3. 导出规范
export interface MyInterface { /* ... */ }
export type MyType = /* ... */;
export class MyClass { /* ... */ }
export function myFunction() { /* ... */ }
export const MY_CONSTANT = /* ... */;

// ❌ 避免默认导出（除非必要）
// export default ...
```

### 命名约定

| 类型 | 示例 | 规则 |
|------|------|------|
| **类** | `GeminiChat`, `ToolRegistry` | PascalCase |
| **接口** | `ContentGenerator`, `Tool` | PascalCase，可选 I 前缀 |
| **类型** | `ToolResult`, `ToolParams` | PascalCase |
| **函数** | `createTool()`, `discoverMcpTools()` | camelCase，动词开头 |
| **常量** | `DEFAULT_GEMINI_MODEL`, `MCP_TIMEOUT` | UPPER_SNAKE_CASE |
| **布尔值** | `isConnected`, `shouldConfirmExecute()` | is/should + camelCase |
| **私有成员** | `private readonly config` | private 修饰符或 `_privateVar` |
| **枚举** | `enum Color { Red, Green }` | PascalCase（枚举），UPPER_CASE（值） |
| **目录** | `src/tools/`, `src/services/` | kebab-case（可选），功能性命名 |

### 代码风格（由 ESLint + Prettier 强制）

```typescript
// ✅ 强制规则
- 使用 const/let，禁止 var
- 强制 === 而非 ==（null 除外）
- arrow-body-style：使用箭头函数简写（=>{} 无 return）
- 不允许 any 类型（@typescript-eslint/no-explicit-any）
- 显式类型注解（对象、参数、返回值）
- 禁止 console.log（生产），使用 logger
- 禁止 require()，使用 ES6 import
- 禁止抛出字符串或非 Error 对象，使用 new Error()
- 单一职责原则，避免单文件多 export

// ✅ Prettier 格式化配置
printWidth: 80          # 行宽
tabWidth: 2             # 缩进
useTabs: false          # 使用空格
semi: true              # 末尾分号
singleQuote: true       # 单引号
trailingComma: 'all'    # 尾逗号

// ✅ 示例
const isValid = data === null;
const fetchData = async (): Promise<Data> => {
  try {
    const result = await api.get('/data');
    return result.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
};
```

### 类型定义规范

```typescript
// ✅ 显式类型注解
const myVar: string = 'value';
const myFunc = (param: string): Promise<string> => { /* ... */ };

// ✅ 接口 vs 类型
// 接口用于对象结构
interface MyInterface {
  prop1: string;
  prop2?: number;
  method(): void;
}

// 类型用于联合、交集、元组等
type MyType = string | number;
type MyTuple = [string, number];

// ✅ 泛型
class Container<T> {
  constructor(private value: T) {}
  getValue(): T { return this.value; }
}

// ✅ 禁止 any，改用 unknown 加类型守卫
const process = (data: unknown): void => {
  if (typeof data === 'string') {
    console.log(data.length);
  }
};
```

### 异步编程模式

```typescript
// ✅ 标准 async/await
async function loadData(): Promise<Data> {
  try {
    const result = await api.fetch();
    return result;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// ✅ Promise 竞速（超时控制）
const result = await Promise.race([
  mainPromise,
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), timeout),
  ),
]);

// ✅ 异步生成器（流处理）
async function* streamData(): AsyncGenerator<string> {
  for (const item of items) {
    yield await processItem(item);
  }
}

// ✅ 事件系统（观察者模式）
eventManager.on('event', (data) => { /* ... */ });
eventManager.emit('event', data);
```

### React 和 Ink 组件规范（packages/cli）

```typescript
// ✅ 函数式组件 + Hooks
import { FC } from 'react';
import { Box, Text, useInput } from 'ink';

interface Props {
  title: string;
  onSubmit?: (value: string) => void;
}

const MyComponent: FC<Props> = ({ title, onSubmit }) => {
  const [state, setState] = useState<string>('');

  useEffect(() => {
    // 副作用处理
  }, [state]);

  useInput((input) => {
    // 键盘输入处理
  });

  return (
    <Box flexDirection="column">
      <Text>{title}</Text>
      {/* JSX 内容 */}
    </Box>
  );
};

export default MyComponent;

// ✅ Ink 特定 API
- <Box> 代替 <div>（flexbox 布局）
- <Text> 代替 <span>（文本节点）
- <Static> 渲染不更新的内容
- useInput() 键盘输入
- useStdin() 标准输入
- useStdout() 标准输出
- stdout.write() 直接输出

// ✅ Context API（全局状态）
const MyContext = createContext<ContextType | undefined>(undefined);
const { value } = useContext(MyContext);
```

### 测试规范

```typescript
// ✅ 文件命名
filename.test.ts
filename.test.tsx
filename.spec.ts

// ✅ Vitest 结构
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('MyClass', () => {
  let instance: MyClass;

  beforeEach(() => {
    instance = new MyClass();
  });

  it('should do something', () => {
    const result = instance.doSomething();
    expect(result).toBe(expected);
  });

  it('should handle errors', async () => {
    await expect(instance.asyncMethod()).rejects.toThrow('Error');
  });

  it('should call external dependency', () => {
    const mock = vi.fn();
    instance.setCallback(mock);
    instance.trigger();
    expect(mock).toHaveBeenCalled();
  });
});

// ✅ 测试覆盖率
- 目标：80%+ 行覆盖率
- 重点：业务逻辑、错误处理、边界情况
```

---

## 🔑 关键模块深度解析

### 1. Gemini Chat 核心（packages/core/src/core/geminiChat.ts - 876 行）

**职责**：Gemini API 的所有通信和响应处理

**主要方法**：
- `startChat()` - 初始化聊天会话
- `sendMessage(content)` - 发送消息
- `processStreamResponse()` - 处理流式响应
- `validateChatHistory()` - 验证历史记录
- `extractToolCalls(response)` - 提取工具调用

**关键特性**：
- ✅ 自动 Token 压缩（超限时）
- ✅ 失败重试机制
- ✅ 流式和非流式支持
- ✅ 响应验证和清理

**修改指南**：
- 修改前必须理解 token 管理流程
- 所有 API 调用必须经过 client.ts
- 响应处理需要考虑工具调用和文本混合

### 2. 工具注册表（packages/core/src/tools/tool-registry.ts - 533 行）

**职责**：管理所有工具的生命周期（内置 + MCP）

**主要方法**：
- `register(tool)` - 注册工具
- `getTool(name)` - 获取工具
- `listTools()` - 列出所有工具
- `executeTool(name, params)` - 执行工具
- `discoverMcpTools()` - 发现 MCP 工具

**新增工具步骤**：
```typescript
// 1. 创建 tools/myTool.ts
export class MyTool extends BaseTool {
  constructor() {
    super('my_tool', 'My Tool', 'Description', Icon.Hammer, schema, false, false);
  }
  validateToolParams(params: unknown): string | null { /* ... */ }
  async shouldConfirmExecute(params: unknown) { /* ... */ }
  async execute(params: unknown): Promise<ToolResult> { /* ... */ }
  getAffectedFilePaths(params: unknown): string[] { /* ... */ }
}

// 2. 在 tool-registry.ts registerBuiltInTools() 中
this.register(new MyTool());

// 3. 添加测试 myTool.test.ts
// 4. npm run build && npm run test
```

### 3. MCP 客户端（packages/core/src/tools/mcp-client.ts - 1141 行）

**职责**：Model Context Protocol 集成、服务器连接、工具发现

**支持的传输方式**：
- 📌 Stdio（本地进程）
- 🌐 SSE（HTTP 服务器）
- 🔄 HTTP 流（双向）

**特性**：
- ✅ 异步加载（不阻塞 CLI）
- ✅ OAuth 认证支持
- ✅ 10 分钟超时控制
- ✅ 连接状态追踪
- ✅ 工具和提示发现

**配置示例**（~/.gemini/settings.json）：
```json
{
  "mcpServers": [
    {
      "name": "my-server",
      "command": "node",
      "args": ["server.js"],
      "env": { "KEY": "value" },
      "timeout": 600000,
      "trust": true,
      "auth": { "type": "oauth2", "configPath": "/path/to/config" }
    }
  ]
}
```

### 4. 会话管理（packages/core/src/services/sessionManager.ts）

**职责**：会话存储、恢复、检查点管理

**工作流**：
```
用户操作
  ↓
工具执行前 → createCheckpoint()
  ├─→ Git add/commit（项目快照）
  └─→ 保存对话历史 JSON
  ↓
执行工具
  ↓
用户可恢复 /restore
  └─→ git checkout + 历史恢复
```

**存储位置**：
```
~/.gemini/history/<project_hash>/     # Git 检查点库
~/.gemini/tmp/<project_hash>/checkpoints/ # 对话检查点
```

### 5. CLI 主循环（packages/cli/src/gemini.tsx - 796 行）

**职责**：用户交互循环、命令解析、UI 渲染

**核心流程**：
```
初始化（认证、加载配置）
  ↓
渲染 UI（InputPrompt）
  ↓
获取用户输入
  ↓
调用 Core API（geminiChat）
  ↓
流式显示结果
  ↓
处理工具确认
  ↓
循环...
```

**支持的命令**：
- `/help` - 显示帮助
- `/exit` 或 `exit` - 退出
- `/restore` - 恢复检查点
- `/clear` - 清除历史
- `/deepseek` - 深度搜索（待实现）
- 普通文本 - AI 提示

---

## 🔒 认证和配置

### 认证流程

```
启动 gemini
  ↓
检查 ~/.gemini/auth/token.json
  ├─ 有效 → 使用缓存（刷新检查）
  ├─ 过期 → 刷新令牌
  └─ 不存在 → 启动 AuthServer
       ↓
     打开浏览器（http://localhost:8080/auth）
       ↓
     用户登录（Cheeth OA）
       ↓
     回调 → 保存令牌
       ↓
     CLI 继续
```

### 配置文件位置

| 文件 | 位置 | 说明 |
|------|------|------|
| **令牌** | `~/.gemini/auth/token.json` | 认证令牌（自动管理） |
| **设置** | `~/.gemini/settings.json` | 用户配置（MCP、模型等） |
| **历史** | `~/.gemini/history/` | 会话和检查点 |
| **临时** | `~/.gemini/tmp/` | 临时文件 |
| **.env** | 项目根目录 | 开发环境变量 |

### 环境变量（开发）

```bash
# Gemini API
DEEPX_SERVER_URL=https://api-code.deepvlab.ai
GEMINI_API_KEY=<your-key>

# 开发模式
FILE_DEBUG=1          # 启用文件调试日志
LOG_TO_FILE=true      # 日志写入文件
NODE_ENV=development  # 开发环境

# 测试
GEMINI_SANDBOX=false  # 禁用沙箱测试
```

---

## 🛠️ 常见开发任务

### 修改 Core 业务逻辑

```bash
# 1. 编辑文件
vim packages/core/src/core/client.ts

# 2. 构建 core 包
npm run build --workspace=packages/core

# 3. 运行单元测试
npm run test --workspace=packages/core -- client.test.ts

# 4. 完整验证
npm run build && npm run test && npm run lint
```

### 修改 CLI UI 组件

```bash
# 1. 编辑 React 组件
vim packages/cli/src/ui/components/InputPrompt.tsx

# 2. 快速测试（Ink 热重载）
npm run dev

# 3. 运行单元测试
npm run test --workspace=packages/cli -- InputPrompt.test.tsx

# 4. 构建验证
npm run bundle:dev
```

### 添加新工具

```bash
# 1. 创建工具文件
# packages/core/src/tools/myTool.ts
cat > packages/core/src/tools/myTool.ts << 'EOF'
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult, Icon } from './tools.js';

export class MyTool extends BaseTool {
  constructor() {
    super('my_tool', 'My Tool', 'Description', Icon.Hammer, {
      type: 'object',
      properties: {
        param1: { type: 'string', description: 'Parameter' },
      },
    }, false, false);
  }

  validateToolParams(params: unknown): string | null {
    // 验证参数
    return null;
  }

  async shouldConfirmExecute(params: unknown) {
    return false; // 或返回确认详情
  }

  async execute(params: unknown): Promise<ToolResult> {
    // 执行逻辑
    return { output: 'result' };
  }

  getAffectedFilePaths(params: unknown): string[] {
    return [];
  }
}
EOF

# 2. 在 tool-registry.ts 中注册
vim packages/core/src/tools/tool-registry.ts
# 添加到 registerBuiltInTools()：
# this.register(new MyTool());

# 3. 创建测试
cat > packages/core/src/tools/myTool.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';
import { MyTool } from './myTool.js';

describe('MyTool', () => {
  it('should execute correctly', async () => {
    const tool = new MyTool();
    const result = await tool.execute({ param1: 'value' });
    expect(result.output).toBe('result');
  });
});
EOF

# 4. 构建和测试
npm run build
npm run test -- myTool.test.ts
```

### 调试和排查

```bash
# 启用调试日志
npm run debug

# 运行特定集成测试
npm run test:integration:sandbox:none -- --grep "myTest"

# 查看类型错误
npm run typecheck

# 检查 ESLint 错误
npm run lint -- --format=compact

# 测试特定工具
npm run test -- tools/readFile.test.ts
```

---

## 🚀 构建和发布工作流

### 本地开发循环

```bash
# 1. 初始设置（一次性）
npm install
npm run build

# 2. 开发循环
# 修改代码...
npm run build          # 快速构建
npm run dev            # 启动测试
npm run test           # 验证

# 3. 提交前检查
npm run preflight      # 完整验证（10-15 分钟）
```

### 生产构建

```bash
# 生产环境打包（完全最小化）
npm run bundle:prod    # 打包源代码
npm run pack:prod      # 生成 .tgz 包

# 发布
npm publish            # 上传到 npm

# VSCode 扩展
npm run pack:vscode    # 生成 .vsix 文件
```

### 跨平台构建

```bash
# 下载所有平台的 ripgrep 二进制
npm run bundle:cross-platform:prod

# 构建完整包（含 VSCode 插件）
npm run pack:full
```

---

## 📊 代码度量和质量

### 项目规模

| 指标 | 数值 |
|------|------|
| 总代码行数 | ~100K+ |
| TypeScript 文件 | 400+ |
| 测试文件 | 63 |
| 文档文件 | 76+ |
| React 组件 | 89 |
| 内置工具 | 30+ |
| 依赖包数（直接） | 30+ |

### 质量检查

```bash
# 代码覆盖率
npm run test -- --coverage

# 类型覆盖率
npm run typecheck

# 代码复杂度（人工审查）
# 文件大于 800 行的考虑拆分：
# - geminiChat.ts (876 行)
# - client.ts (719 行)
# - App.tsx (1555 行 React)
# - mcp-client.ts (1141 行)
```

---

## ⚠️ 常见陷阱和解决方案

### 1. Token 限制问题

**症状**：提示 "Token limit exceeded"

**原因**：对话历史过长或单个请求过大

**解决**：
- CompressionService 自动压缩（正常工作）
- 或使用 Flash 模型回退（自动）
- 手动 `/clear` 清除历史

### 2. MCP 服务器无法连接

**症状**：`ERROR: Failed to connect to MCP server`

**原因**：配置错误、进程崩溃、超时

**解决**：
```bash
# 检查配置
cat ~/.gemini/settings.json | grep mcpServers

# 验证命令
node /path/to/server.js  # 直接运行测试

# 增加超时
"timeout": 600000  # 10 分钟

# 查看日志
FILE_DEBUG=1 npm run dev
```

### 3. 认证失败

**症状**：`Authentication failed` 或 `Token expired`

**原因**：令牌过期、刷新失败

**解决**：
```bash
# 清除令牌
rm ~/.gemini/auth/token.json

# 重新登录
npm run dev
```

### 4. 构建失败

**症状**：`npm run build` 失败

**原因**：依赖不一致、缓存问题

**解决**：
```bash
npm run clean      # 清理
npm install        # 重装
npm run build      # 重新构建
```

### 5. 工具执行报错

**症状**：工具执行返回错误但 UI 无法显示

**原因**：错误处理不完整

**解决**：
- 检查 tool 的 `execute()` 方法
- 添加 try-catch 和错误消息
- 使用 `getErrorMessage()` 统一格式

---

## 🔍 文件导航快速索引

### 核心文件（修改需谨慎）

| 文件 | 行数 | 说明 | 复杂度 |
|------|------|------|--------|
| `packages/core/src/core/geminiChat.ts` | 876 | Gemini API 核心 | 🔴 High |
| `packages/core/src/core/client.ts` | 719 | 客户端管理 | 🔴 High |
| `packages/cli/src/gemini.tsx` | 796 | CLI 主循环 | 🔴 High |
| `packages/core/src/tools/tool-registry.ts` | 533 | 工具系统枢纽 | 🟡 Medium |
| `packages/core/src/tools/mcp-client.ts` | 1141 | MCP 集成 | 🔴 High |

### 功能模块（相对独立）

| 目录 | 文件数 | 说明 | 修改难度 |
|------|--------|------|---------|
| `packages/core/src/tools/` | 20+ | 工具实现 | 🟢 Easy |
| `packages/cli/src/ui/` | 89 | UI 组件 | 🟢 Easy |
| `packages/core/src/services/` | 5+ | 业务服务 | 🟡 Medium |
| `packages/core/src/auth/` | 3+ | 认证逻辑 | 🟡 Medium |
| `packages/cli/src/config/` | 3+ | 配置管理 | 🟢 Easy |

### 测试文件

```
packages/cli/src/
├── gemini.test.tsx
├── nonInteractiveCli.test.ts
└── validateNonInterActiveAuth.test.ts

packages/core/src/
├── index.test.ts
├── tools/
│   ├── read-file.test.ts
│   ├── write-file.test.ts
│   └── ... (工具测试)
└── ... (其他测试)

integration-tests/
└── run-tests.js
```

---

## 📚 文档和资源

### 核心文档

| 文档 | 说明 |
|------|------|
| `docs/architecture.md` | 项目架构详解 |
| `docs/build-workflow.md` | 构建流程 |
| `docs/deployment.md` | 部署指南 |
| `docs/mcp-improvements-summary.md` | MCP 改进汇总 |
| `docs/checkpointing.md` | 检查点系统 |
| `docs/supported-file-types.md` | 支持的文件类型 |

### 工具文档

| 文档 | 说明 |
|------|------|
| `docs/tools/index.md` | 工具系统概览 |
| `docs/tools/file-system.md` | 文件系统工具 |
| `docs/tools/shell.md` | Shell 工具 |
| `docs/tools/web-fetch.md` | Web 获取工具 |
| `docs/tools/mcp-server.md` | MCP 服务器 |

### CLI 文档

| 文档 | 说明 |
|------|------|
| `docs/cli/authentication.md` | 认证配置 |
| `docs/cli/commands.md` | 命令参考 |
| `docs/cli/configuration.md` | 用户配置 |
| `docs/cli/themes.md` | 主题和样式 |

---

## 🎯 项目特色功能

### 1. 检查点系统（Checkpointing）

- **工作原理**：工具执行前自动保存 Git 快照和对话历史
- **恢复方式**：`/restore` 命令
- **优势**：可靠的撤销机制、完整的审计追踪
- **配置**：`enableCheckpointing: true`（在 settings.json）

### 2. Token 压缩（Compression）

- **触发条件**：使用量 > 85% 限额
- **策略**：摘要化旧消息，保留最新上下文
- **自动化**：完全透明，用户无需干预
- **文件**：`packages/core/src/services/compressionService.ts`

### 3. Flash 回退（Model Fallback）

- **触发条件**：Deep X 超限错误
- **处理**：自动切换到 gemini-2.0-flash
- **透明性**：用户不感知切换
- **文件**：`packages/core/src/core/client.ts`

### 4. 循环检测（Loop Detection）

- **检测**：识别重复的代码模式或工具调用
- **阈值**：可配置
- **动作**：警告或中断
- **文件**：`packages/core/src/services/loopDetectionService.ts`

### 5. MCP 异步加载

- **优势**：不阻塞 CLI 启动
- **实现**：后台线程加载 MCP 工具
- **优先级**：支持按优先级加载
- **文件**：`packages/core/src/tools/mcp-client.ts`

---

## 🔐 安全考虑

### 工具执行确认

- 所有工具执行前需用户确认（可配置）
- `shouldConfirmExecute()` 方法控制确认流程
- 危险操作（删除、Shell 执行）强制确认

### MCP 服务器信任

- 所需在 settings.json 中显式标记为信任
- OAuth 认证支持
- 超时和进程隔离

### 沙箱隔离

- Docker：完全隔离
- Podman：兼容 Docker API
- macOS Seatbelt：系统级隔离

### 密钥管理

- 令牌存储在 `~/.gemini/auth/`（仅用户可读）
- API 密钥通过环境变量传递
- 支持 .env 文件（不提交到 Git）

---

## 📞 获取帮助

### 内置帮助

```bash
gemini --help          # 命令帮助
gemini /help           # 运行时帮助
```

### 常见问题

- 查看 `docs/troubleshooting.md`
- 浏览 GitHub Issues
- 查看源代码注释和类型定义

### 贡献指南

- Fork 仓库
- 创建功能分支
- 遵守代码规范
- 提交 Pull Request

---

## 📌 总结和建议

### 强项

✅ 架构清晰（monorepo 设计）
✅ 功能完整（30+ 工具 + MCP）
✅ 代码质量高（严格 TypeScript + ESLint）
✅ 用户体验好（Ink UI、Vim 模式）
✅ 可靠性强（检查点、压缩、回退机制）
✅ 可扩展性佳（工具系统、MCP 支持）

### 改进方向

🎯 拆分大文件（>800 行考虑模块化）
🎯 提升测试覆盖率（目标 80%+）
🎯 优化 MCP 加载性能（优先级管理）
🎯 统一文档语言（国际化）
🎯 完善错误分类体系

### 快速上手

1. **理解结构**（15 分钟）：浏览 `packages/` 目录，阅读 `docs/architecture.md`
2. **本地构建**（10 分钟）：`npm install && npm run build && npm run dev`
3. **跑测试**（5 分钟）：`npm run test -- tools/read-file.test.ts`
4. **修改组件**（20 分钟）：编辑 UI 组件，实时查看变化
5. **贡献新工具**（30 分钟）：按上面步骤添加工具

---

**📝 本文档生成于：2025-01-16**
**📚 相关文档：** `docs/` 目录
**🔗 GitHub：** https://github.com/OrionStarAI/DeepVCode
**⚖️ 许可证：** Apache 2.0

---

## 附录 A：构建命令速查表

```bash
# 快速开发
npm run build          # 构建（30 秒）
npm run dev            # 启动（5 秒）
npm run test           # 测试（1-2 分钟）

# 完整验证
npm run preflight      # 10-15 分钟
npm run lint:ci        # CI 级别检查

# 生产打包
npm run bundle:prod    # 打包源码
npm run pack:prod      # 生成 .tgz

# 清理和重建
npm run clean          # 清理所有
npm install            # 重装依赖
npm run build          # 重新构建
```

## 附录 B：常用开发命令

```bash
# 修改 core 包后
npm run build --workspace=packages/core
npm run test --workspace=packages/core -- filename.test.ts

# 修改 cli 包后
npm run build --workspace=packages/cli
npm run dev            # Ink 会热重载

# 添加新依赖
npm install package-name --workspace=packages/core
npm run build

# 运行集成测试
npm run test:integration:sandbox:none -- --verbose

# 调试模式
npm run debug          # 启用 Node.js 调试
FILE_DEBUG=1 npm run dev  # 启用文件日志
```

## 附录 C：环境变量参考

```bash
# API 和服务
DEEPX_SERVER_URL=https://api-code.deepvlab.ai
GEMINI_API_KEY=<key>

# 开发
NODE_ENV=development
FILE_DEBUG=1
LOG_TO_FILE=true
BUILD_ENV=development

# 构建
INCLUDE_VSCODE_PLUGIN=true
DOWNLOAD_ALL_PLATFORMS=true
ENABLE_CHECKPOINTING=true

# 测试
GEMINI_SANDBOX=false|docker|podman
```

## DeepV Code Added Memories
- DEEPV.md generated by /init command on 2025-01-16 17:30:00
