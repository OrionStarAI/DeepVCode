<div align="center">

# 🚀 DeepV Code

**AI-Powered Intelligent Software Engineering Assistant**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-007ACC.svg)](https://code.visualstudio.com/)

English | [简体中文](./README.md)

<img src="docs/assets/demo.gif" alt="DeepV Code Demo" width="800">

</div>

---

## ✨ Introduction

**DeepV Code** is a revolutionary AI-powered intelligent software engineering assistant that deeply integrates artificial intelligence technology to comprehensively enhance software development efficiency, quality, and innovation.

Unlike traditional code completion tools, DeepV Code is an intelligent agent capable of **understanding the entire project context** and **autonomously orchestrating tools to complete complex tasks**, freeing developers from tedious, repetitive work to focus on higher-level innovation and problem-solving.

### 🎯 Key Features

| Feature | Description |
|:---:|:---|
| 🧠 **AI Code Generation** | Generate complete functions, classes, or modules from natural language descriptions |
| 🔍 **Intelligent Debugging** | Deeply analyze error logs, quickly locate root causes, and auto-fix issues |
| 📦 **MCP Context Management** | Build comprehensive awareness of project structure, dependencies, and code semantics |
| 🛠️ **Extensible Tool System** | Built-in Shell, File System, Web Fetch tools with custom extension support |
| 🎨 **Multi-Mode Interaction** | CLI command line + VS Code plugin for different use cases |
| 🔄 **Session Management** | Support session save, restore, and history compression |
| 🪝 **Hooks Mechanism** | Inject custom logic at key workflow nodes for automated task orchestration |

---

## 📦 Quick Installation

### Option 1: npm Global Install (Recommended)

```bash
npm install -g deepv-code
```

Or using yarn / pnpm:

```bash
yarn global add deepv-code
# or
pnpm add -g deepv-code
```

### Option 2: Build from Source

```bash
# Clone repository
git clone https://github.com/OrionStarAI/DeepVCode.git
cd DeepVCode

# Install dependencies
npm install

# Build project
npm run build

# Run locally
npm run dev

### 🌐 Using Open Source Server (Self-hosted)

If you want to deploy the DeepV Code server locally or in a private environment, you can use our open-source version:

**Open Source Server:** [DeepVCode-Server-mini](https://github.com/OrionStarAI/DeepVCode-Server-mini)

To start the CLI and connect to your local server:

```bash
# Set server URL and start
cross-env DEEPX_SERVER_URL=http://localhost:8000 npm run start
```

---

## 🚀 Quick Start

After installation, start in any project directory:

```bash
dvcode
```

### Basic Usage Examples

```bash
# Start interactive session
dvcode

# Use specific model
dvcode -m gemini-2.0-flash

# Execute single prompt (non-interactive mode)
dvcode -p "Explain the architecture of this project"

# Continue last session
dvcode -c

# Enable YOLO mode (auto-execute all operations)
dvcode -y
```

### Slash Commands

Use slash commands in interactive mode for quick common tasks:

| Command | Description |
|:---:|:---|
| `/help` | Display help information |
| `/model` | Switch AI model |
| `/session` | Session management (list/new/select) |
| `/mcp` | MCP server management |
| `/plan` | Toggle plan mode (disable code modifications) |
| `/yolo` | Toggle YOLO mode |
| `/tools` | View available tools |
| `/memory` | Long-term memory management |
| `/compress` | Compress conversation history |
| `/restore` | Restore file checkpoint |
| `/quit` | Exit application |

---

## 🏗️ Project Architecture

```
DeepVCode/
├── packages/
│   ├── cli/                    # Command Line Interface
│   │   ├── src/
│   │   │   ├── commands/       # Slash command implementations
│   │   │   ├── ui/             # Terminal UI components (React Ink)
│   │   │   ├── services/       # Service layer
│   │   │   └── utils/          # Utility functions
│   │   └── package.json
│   │
│   ├── core/                   # Core Library
│   │   ├── src/
│   │   │   ├── tools/          # AI tools (shell, file, web...)
│   │   │   ├── mcp/            # MCP engine
│   │   │   ├── prompts/        # Prompt template management
│   │   │   ├── auth/           # Authentication module
│   │   │   ├── hooks/          # Hooks system
│   │   │   └── skills/         # Skills extension system
│   │   └── package.json
│   │
│   ├── vscode-ide-companion/   # VS Code Lightweight Companion Extension
│   │   └── package.json
│   │
│   └── vscode-ui-plugin/       # VS Code Full UI Plugin
│       ├── src/                # Extension source code
│       ├── webview/            # Webview frontend
│       └── package.json
│
├── docs/                       # Documentation
├── scripts/                    # Build and utility scripts
├── package.json                # Root config (Monorepo)
└── README.md
```

### Tech Stack

- **Language**: TypeScript
- **Runtime**: Node.js 20+
- **CLI UI**: React (Ink)
- **Build Tool**: esbuild
- **Testing**: Vitest
- **Code Style**: ESLint + Prettier

---

## 🔌 VS Code Extensions

DeepV Code provides two VS Code extensions for enhanced IDE integration:

### IDE Companion

Connects VS Code with CLI running in the integrated terminal, sensing currently opened files and selected code.

```bash
cd packages/vscode-ide-companion
npm install
npm run build
npm run package  # Generate .vsix file
```

### UI Plugin

Complete graphical AI coding assistant interface, supporting:
- Sidebar AI conversation window
- Context menu code actions (explain/optimize/generate tests)
- Inline code completion suggestions
- MCP server status management

```bash
cd packages/vscode-ui-plugin
npm install
cd webview && npm install && npm run build && cd ..
npm run build
npm run package  # Generate .vsix file
```

---

## 🛠️ Built-in Tools

DeepV Code's AI interacts with the external environment through an extensible tool system:

| Tool | Description |
|:---:|:---|
| `shell` | Execute shell commands |
| `read_file` | Read file contents |
| `write_file` | Create/write files |
| `replace` | Precise file content replacement |
| `delete_file` | Delete files |
| `glob` | File pattern matching search |
| `grep` | Content regex search |
| `web_fetch` | Fetch web content |
| `web_search` | Google search |
| `task` | Launch code analysis sub-agent |
| `mcp_tool` | Call MCP service tools |

---

## 🔗 MCP Protocol Support

**Model Context Protocol (MCP)** is the core protocol for DeepV Code's deep context understanding.

### What is MCP?

MCP allows AI models to:
- Connect to external data sources and tools
- Access real-time information
- Interact with third-party services

### Configuring MCP Servers

Create `.deepvcode/settings.json` in your project root:

#### Method 1: Standard Mode (Command-based)

For local MCP servers that start via command line.

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/path/to/allowed/dir"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-github"],
      "env": {
        "GITHUB_TOKEN": "your-token"
      }
    }
  }
}
```

**Field descriptions:**
- `command` (required): Command to start the server
- `args` (optional): Command arguments array
- `env` (optional): Environment variables object
- `cwd` (optional): Working directory
- `timeout` (optional): Request timeout (milliseconds)
- `trust` (optional): Trust server, skip confirmation
- `includeTools` (optional): Whitelist specific tools
- `excludeTools` (optional): Blacklist specific tools

#### Method 2: Streamable HTTP Mode (Recommended for Cloud Services)

For remote MCP servers that support HTTP, no local process needed.

```json
{
  "mcpServers": {
    "Web-Search-by-Z.ai": {
      "httpUrl": "https://open.bigmodel.cn/api/mcp-broker/proxy/web-search/mcp",
      "headers": {
        "Authorization": "Bearer **************************"
      }
    },
    "myHttpServer": {
      "httpUrl": "https://api.example.com/mcp/endpoint",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY",
        "Custom-Header": "custom-value"
      }
    }
  }
}
```

**Streamable HTTP mode field descriptions:**
- `httpUrl` (required): HTTP endpoint URL of the MCP server
- `headers` (optional): HTTP request headers for authentication or custom info
  - Common auth method: `Authorization: Bearer <token>`
- Other fields (`includeTools`, `excludeTools`, `trust`, etc.) also apply

**Mode comparison:**

| Feature | Standard Mode | Streamable HTTP Mode |
|:---|:---|:---|
| **Connection** | Local process | HTTP request |
| **Use Case** | Local MCP servers | Cloud services, remote MCP |
| **Config Complexity** | Command and path required | URL and optional headers only |
| **Resource Usage** | Local process resources | No local process |
| **Network Requirement** | Not required | Required |

### Managing MCP Servers

```bash
# View all MCP server status
/mcp

# Add new server
/mcp add github

# Refresh server connection
/mcp refresh github

# OAuth authentication
/mcp auth github
```

---

## 🤖 Custom Model Support

DeepV Code supports configuring custom models with OpenAI-compatible and Anthropic Claude API formats, allowing you to use any compatible AI service.

### Why Use Custom Models?

- 🔓 **Freedom of Choice** - Use your favorite AI service provider
- 💰 **Cost Control** - Pay directly to providers, no middleman
- 🏠 **Local Deployment** - Support for local models (LM Studio, Ollama, etc.)
- 🚀 **Flexible Configuration** - Adjust parameters and endpoints as needed

### Quick Configuration

#### Method 1: Model Management UI (Recommended)

In the CLI, type:

```bash
/model
```

Then select **"Model Management"** option and follow the wizard prompts:
1. Select provider type (OpenAI Compatible / Anthropic Claude)
2. Enter display name
3. Enter API base URL
4. Enter API key (environment variable format `${OPENAI_API_KEY}` recommended)
5. Enter model ID
6. Set max tokens (optional)
7. Confirm configuration

#### Method 2: Manual Configuration File

Edit `~/.deepv/custom-models.json`:

```json
{
  "models": [
    {
      "displayName": "GPT-4 Turbo",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "${OPENAI_API_KEY}",
      "modelId": "gpt-4-turbo",
      "maxTokens": 128000,
      "enabled": true
    },
    {
      "displayName": "Claude Sonnet",
      "provider": "anthropic",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "${ANTHROPIC_API_KEY}",
      "modelId": "claude-sonnet-4-5",
      "maxTokens": 200000,
      "enabled": true
    }
  ]
}
```

### Supported Providers

#### OpenAI Compatible (`openai`)

For any API following the OpenAI Chat Completions format:

- **OpenAI Official API**
  ```json
  {
    "displayName": "GPT-4 Turbo",
    "provider": "openai",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "${OPENAI_API_KEY}",
    "modelId": "gpt-4-turbo"
  }
  ```

- **Azure OpenAI**
  ```json
  {
    "displayName": "Azure GPT-4",
    "provider": "openai",
    "baseUrl": "https://your-resource.openai.azure.com/openai/deployments/your-deployment",
    "apiKey": "${AZURE_OPENAI_KEY}",
    "modelId": "gpt-4",
    "headers": {
      "api-version": "2024-02-01"
    }
  }
  ```

- **Local Models (LM Studio, Ollama)**
  ```json
  {
    "displayName": "Local Llama",
    "provider": "openai",
    "baseUrl": "http://localhost:1234/v1",
    "apiKey": "not-needed",
    "modelId": "llama-3-70b"
  }
  ```

- **Third-party Services (Groq, Together AI, etc.)**
  ```json
  {
    "displayName": "Groq Llama 3",
    "provider": "openai",
    "baseUrl": "https://api.groq.com/openai/v1",
    "apiKey": "${GROQ_API_KEY}",
    "modelId": "llama-3-70b-8192"
  }
  ```

#### Anthropic Claude (`anthropic`)

For Claude API endpoints with extended thinking support:

```json
{
  "displayName": "Claude Sonnet (Thinking)",
  "provider": "anthropic",
  "baseUrl": "https://api.anthropic.com",
  "apiKey": "${ANTHROPIC_API_KEY}",
  "modelId": "claude-sonnet-4-5",
  "enableThinking": true
}
```

### Configuration Fields

**Required Fields:**

| Field | Description | Example |
|-------|-------------|---------|
| `displayName` | Display name | `GPT-4 Turbo` |
| `provider` | Provider type | `openai` or `anthropic` |
| `baseUrl` | API base URL | `https://api.openai.com/v1` |
| `apiKey` | API key | `${OPENAI_API_KEY}` |
| `modelId` | Model name | `gpt-4-turbo` |

**Optional Fields:**

| Field | Description | Default |
|-------|-------------|---------|
| `maxTokens` | Maximum context window | Provider-dependent |
| `enabled` | Whether enabled | `true` |
| `headers` | Additional HTTP headers | None |
| `timeout` | Request timeout (ms) | `300000` |
| `enableThinking` | Enable Anthropic extended thinking | `false` |

### Using Custom Models

#### Via Model Selection Dialog

```bash
/model
```

Custom models display with a `[Custom]` tag and cyan color, use arrow keys to select.

#### Direct Switch

```bash
/model custom:openai:gpt-4-turbo@abc123
```

### Environment Variables

Recommended to use environment variables for API keys:

**Linux/macOS:**
```bash
export OPENAI_API_KEY="sk-your-key-here"
export ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

**Windows PowerShell:**
```powershell
$env:OPENAI_API_KEY="sk-your-key-here"
$env:ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

### Features and Limitations

✅ **Supported Features:**
- Streaming and non-streaming responses
- Tool calling (Function Calling)
- Multimodal input (text, images)
- Full integration with all DeepV Code features

⚠️ **Notes:**
- Custom models don't consume DeepV credits
- Pay directly to API providers
- Some advanced features may be unavailable depending on provider limitations
- Token counting determined by provider

### Related Documentation

- 📖 [Custom Models Quickstart](./docs/custom-models-quickstart.md)
- 📖 [Custom Models Guide](./docs/custom-models-guide.md)
- 📖 [Custom Models Architecture](./docs/custom-models-architecture.md)

---

## 📖 Documentation

- 📘 **[Whitepaper](./DeepV_Code_Whitepaper.md)** - Complete product and technical documentation
- 📗 **[Architecture Overview](./docs/architecture.md)** - System architecture design
- 📙 **[Hooks User Guide](./docs/hooks-user-guide.md)** - Hooks mechanism details
- 📕 **[MCP Integration](./docs/mcp-improvements-summary.md)** - MCP protocol integration

---

## 🧑‍💻 Development Guide

### Common Commands

| Command | Description |
|:---:|:---|
| `npm install` | Install all dependencies |
| `npm run build` | Build project |
| `npm run start` | Start CLI (can be used with DEEPX_SERVER_URL) |
| `npm run dev` | Run in development mode (with debugging, connects to official dev server) |
| `npm run test` | Run tests |
| `npm run lint` | Code linting |
| `npm run pack:prod` | Production build |
| `npm run clean` | Clean build artifacts |

### Development Workflow

1. Run `npm run build` after code changes
2. Run `npm run dev` to test changes
3. Use `npm run lint` to ensure code standards
4. Run `npm run test` before submitting PR

> 💡 **Tip**: We recommend using `dvcode` for self-development. The project's `DEEPV.md` provides development guidelines for the AI model.

---

## 🤝 Contributing

We welcome community contributions! Please follow these steps:

1. **Fork** this repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Submit a **Pull Request**

### Reporting Issues

If you find bugs or have feature suggestions, please [create an Issue](https://github.com/OrionStarAI/DeepVCode/issues).

---

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=OrionStarAI/DeepVCode&type=date&legend=top-left)](https://www.star-history.com/#OrionStarAI/DeepVCode&type=date&legend=top-left)

---

## 📄 License

This project is open-sourced under the [Apache License 2.0](LICENSE).

---

## 🔗 Links

- 🌐 **Official Website**: [https://dvcode.deepvlab.ai](https://dvcode.deepvlab.ai)
- 📦 **npm Package**: [deepv-code](https://www.npmjs.com/package/deepv-code)
- 🖥️ **Open Source Server**: [DeepVCode-Server-mini](https://github.com/OrionStarAI/DeepVCode-Server-mini)
- 🐦 **Issue Tracker**: [GitHub Issues](https://github.com/OrionStarAI/DeepVCode/issues)

---

<div align="center">

**💬 "AI is not just a tool, it's every developer's partner."**

🪄 **Happy Coding with DeepV Code!** 💻✨

</div>
