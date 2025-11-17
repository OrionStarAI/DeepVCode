# Extensions SetTools 流程分析

## 📋 问题：新增的 Extensions 是否被 SetTool 了？

**答案：✅ 是的，Extensions 已经被完整 SetTool 了。**

---

## 🔄 完整的 Extensions 集成流程

### 1️⃣ **Extension 加载阶段** (gemini.tsx)
```typescript
// 第一次参数解析 + workdir 处理
let tempArgv = await parseArguments([]);
if (tempArgv.workdir) { /* 处理 workdir */ }

// 核心：加载 Extensions
const extensions = await loadExtensions(workspaceRoot);

// 加载 Prompt Extensions（TOML 命令文件）
const { loadPromptExtensions } = await import('./config/prompt-extensions.js');
const promptExtensions = await loadPromptExtensions(extensions);

// 第二次参数解析（已经知道有哪些 extensions）
const argv = await parseArguments(extensions);
```

**Extensions 包含的内容：**
- `config.mcpServers`：MCP 服务器配置
- `config.excludeTools`：要排除的工具列表
- `contextFiles`：上下文文件（如 GEMINI.md、DEEPV.md）
- `path`：Extension 目录路径

---

### 2️⃣ **Config 初始化阶段** (loadCliConfig)

#### A. 活跃 Extensions 过滤
```typescript
const allExtensions = annotateActiveExtensions(
  extensions,
  argv.extensions || [],
);

const activeExtensions = extensions.filter(
  (_, i) => allExtensions[i].isActive,
);
```

#### B. Extension 上下文文件加入内存
```typescript
const extensionContextFilePaths = activeExtensions.flatMap(
  (e) => e.contextFiles,
);

// 在 loadHierarchicalGeminiMemory 中使用这些文件路径
const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
  process.cwd(),
  debugMode,
  fileService,
  settings,
  extensionContextFilePaths,  // ✅ 这里加入了 Extension 的 GEMINI.md
  fileFiltering,
);
```

#### C. Extension MCP 服务器合并
```typescript
let mcpServers = mergeMcpServers(settings, activeExtensions);

// 在 mergeMcpServers 函数中：
// - 合并 Extension 的 mcpServers 到全局配置
// - 替换 ${extensionPath} 占位符
// - 添加 extensionName 标记
```

#### D. Extension 排除工具合并
```typescript
const excludeTools = mergeExcludeTools(settings, activeExtensions);

// 在 mergeExcludeTools 函数中：
// - 收集所有 Extension 的 excludeTools
// - 合并到全局排除列表
```

#### E. Config 构造
```typescript
return new Config({
  sessionId,
  embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
  sandbox: sandboxConfig,
  targetDir: process.cwd(),
  // ... 其他配置 ...
  excludeTools,           // ✅ Extension 的排除工具
  mcpServers,            // ✅ Extension 的 MCP 服务器
  userMemory: memoryContent,  // ✅ 包含 Extension 的上下文文件
  geminiMdFileCount: fileCount,
  extensionContextFilePaths,  // ✅ Extension 上下文文件路径
  extensions: allExtensions,  // ✅ Extension 元数据
  // ... 其他配置 ...
});
```

---

### 3️⃣ **Config 初始化 + SetTools** (Config.initialize)

```typescript
async initialize(): Promise<void> {
  // ... 初始化文件服务、Git 等 ...

  // 快速初始化工具注册表（core tools + command line tools）
  this.toolRegistry = await this.createToolRegistry();

  // MCP 异步后台发现
  // ✅ 这里开始异步加载 MCP 工具（包括 Extension MCP 服务器的工具）
  setImmediate(() => {
    this.discoverMcpToolsAsync();
  });
}

private async discoverMcpToolsAsync(): Promise<void> {
  try {
    await this.toolRegistry.discoverMcpTools();

    // ✅ 关键：MCP 工具发现完成后，更新 AI 模型
    if (this.geminiClient && this.geminiClient.isInitialized()) {
      await this.geminiClient.setTools();  // 🎯 SetTools 在这里！
    }
  } catch (error) {
    // MCP 错误已记录，继续运行
  }
}
```

---

### 4️⃣ **Extension Slash 命令集成** (CommandService)

Extension 的 TOML 命令文件通过专用加载器集成：

```typescript
// 在 slashCommandProcessor 中
const { commands: slashCommands, commandContext } = useSlashCommandProcessor(
  config,
  settings,
  addItem,
  clearItems,
  // ... 其他回调 ...
);

// CommandService 使用多个加载器：
const commandService = await CommandService.create(
  [
    new BuiltinCommandLoader(config),
    new ExtensionCommandLoader(config),    // ✅ 加载 Extension 命令
    new FileCommandLoader(config),
    new InlineCommandLoader(),
    new McpPromptLoader(config),
  ],
  signal,
);

const commands = commandService.getCommands();
```

**ExtensionCommandLoader 的工作流程：**
```typescript
// 扫描 .deepv/extensions 和 ~/.deepv/extensions 中的 commands 目录
// 查找所有 *.toml 文件
// 格式：/ext:{extension-name}:{command-path}

// 例如：
// .deepv/extensions/code-review/commands/analyze.toml
// → 转换为 /ext:code-review:analyze 命令
```

---

### 5️⃣ **Prompt Extensions 集成** (UI 层)

```typescript
// App.tsx 中接收 promptExtensions
const App = ({
  config,
  settings,
  startupWarnings = [],
  version,
  promptExtensions = []  // ✅ 这里接收
}: AppProps) => {
  // ...
};

// promptExtensions 用于显示帮助和命令补全
```

---

## 📊 SetTools 的三个触发点

| 触发点 | 时机 | 包含内容 |
|--------|------|---------|
| **MCP 发现完成** | Config 初始化后（异步） | ✅ Extension MCP 工具 |
| **/mcp refresh** | 用户手动刷新 | ✅ Extension MCP 工具 |
| **/mcp auth** | MCP 认证后 | ✅ 认证后的 Extension 工具 |

---

## ✅ Extension 被 SetTool 的完整证据

### 1. **上下文文件被加入 Prompt**
- ✅ `extensionContextFilePaths` 在 `loadHierarchicalGeminiMemory` 中使用
- ✅ Extension 的 GEMINI.md/DEEPV.md 被加入到 `userMemory`

### 2. **MCP 服务器被合并**
- ✅ `mergeMcpServers()` 收集所有 Extension 的 `mcpServers`
- ✅ MCP 工具在 `discoverMcpToolsAsync()` 中发现
- ✅ `geminiClient.setTools()` 更新模型

### 3. **Slash 命令被加载**
- ✅ `ExtensionCommandLoader` 扫描并加载 TOML 命令文件
- ✅ 命令以 `/ext:extension-name:command` 格式注册
- ✅ 在 slash 命令处理器中可用

### 4. **排除工具被合并**
- ✅ `mergeExcludeTools()` 收集所有 Extension 的 `excludeTools`
- ✅ 工具注册表在创建时排除这些工具

---

## 🎯 总结

**Extensions 在以下方面已经完整 SetTool：**

| 方面 | 状态 | 位置 |
|------|------|------|
| **上下文文件** | ✅ SetTool | loadCliConfig → loadHierarchicalGeminiMemory |
| **MCP 服务器** | ✅ SetTool | Config.discoverMcpToolsAsync → geminiClient.setTools |
| **排除工具** | ✅ SetTool | loadCliConfig → Config constructor |
| **Slash 命令** | ✅ SetTool | ExtensionCommandLoader → CommandService |

**新增的 Extensions 一定会被正确集成，只要：**
1. ✅ 放在 `.deepv/extensions/{name}/` 目录下
2. ✅ 有 `gemini-extension.json` 配置文件
3. ✅ MCP 服务器或命令文件正确配置
4. ✅ 上下文文件名在 `getDefaultContextFileNames()` 列表中（或在 config 中明确指定）

