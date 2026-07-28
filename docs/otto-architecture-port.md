# Otto 架构移植：知识库、内核边界与企业级特性

本文档描述从 Otto 项目移植到 EasyCode 的关键架构特性，包括知识库双架构、项目合并分离、内核/包装层分离、以及 EasyCode 兼容性适配。

---

## 1. 知识库双架构（Dual Knowledge Architecture）

### 设计原则

Otto 采用**本地+企业**双知识库架构，两者完全独立、零耦合：

| 层级 | 存储 | 适用场景 | Node 要求 |
|------|------|---------|----------|
| 本地知识库 | JSONL（`~/.otto-user/knowledge/entries.jsonl`） | 个人、离线、零依赖 | ≥20（Core 通用） |
| 企业知识库 | SQLite（`knowledge` 表） | 组织级、部门隔离 | ≥22.13.0（Server） |

**为什么 JSONL 而不是 SQLite**：Core 的 `engines` 要求 Node≥20，但 `node:sqlite` 需要 Node≥22.5+。Core 被 CLI/Electron 消费时 Node 版本不可控。JSONL 零依赖、始终可用，个人级数据（几千条）内存全扫描足够。

### 本地知识库关键特性

- **信号词提取**：从对话中自动提取偏好、决策、方案、调研、惯例 5 类知识候选
- **置信度门控**：仅 confidence > 0.8 的条目自动写入，低置信度静默跳过
- **秘密脱敏**：写入前用正则检测 API key、bearer token、密码、私钥
- **指纹去重**：SHA-256 前 16 hex 字符，标准化（小写+空格折叠）后做 resilient dedup
- **相似合并**：字符 3-gram Jaccard 相似度，阈值 0.85——保留新条目、移除旧重复
- **写链序列化**：所有写操作用 `writeChain` 模式防止并发 read-modify-write 竞态

### 企业知识库关键特性

- **组织+部门隔离**：`getMemberKnowledge()` 只返回本部门+全局知识
- **冲突处理**：`ON CONFLICT(organization_id, source_id) WHERE source_id IS NOT NULL DO NOTHING`
- **模糊搜索**：SQL LIKE 跨 content + category，按 confidence DESC 排序，LIMIT 20

### 移植到 EasyCode 的建议

EasyCode 目前已有本地知识库能力。移植企业知识库需要：

1. 在 EasyCode server 层增加 SQLite enterprise knowledge 模块
2. 实现 department-scoped 的 `getMemberKnowledge()`
3. 保持 JSONL local store 不依赖 SQLite（零耦合原则）

---

## 2. 项目合并与分离（Company Merge/Separation）

### 设计原则

Otto 的组织架构支持企业间的合并与分离，核心是 `applyCompanyLinkRedemption()`：

**邀请类型**：
- `position`：加入一个岗位
- `company`：加入一个企业
- `company_link`：父子企业合并

**合并方向**：
- `parent_invites_child`：母公司邀请子公司
- `child_requests_parent`：子公司请求并入母公司

**防环保护**：合并前遍历 `parentCompanyId` 链检测环

**占位名称**：链接远程企业时使用 `关联企业（${remoteId.slice(-8)}）`，待可信企业目录提供完整信息后替换

**邀请签名**：Ed25519 compact claims + base64url 编码 + 一次性兑换收据

### 移植到 EasyCode 的建议

1. 在 `productWorkspace.ts` 领域模型中增加 `CompanyLink` 类型
2. 实现 `applyCompanyLinkRedemption()` + 环检测
3. 企业邀请使用 Ed25519 签名保证可信度
4. SDR 工作流的 sales pool 支持 parentCompanyId 链的跨企业分配

---

## 3. 内核与包装层分离（Kernel vs Wrapper）

### 内核边界定义

Otto 用 `docs/runtime-kernel-boundary.md` 作为**活文档**精确定义内核边界，并有 `kernelBoundary.test.ts` 自动验证。

**内核独占关注点**：

| 关注点 | 关键文件 |
|--------|---------|
| Turn 生命周期 & 状态机 | `turn.ts`, `turnStateMachine.ts` |
| 工具执行引擎 | `toolExecutionEngine.ts` |
| 工具调度边界 | `coreToolScheduler.ts`, `toolSchedulerAdapter.ts` |
| 中央策略门 | `policy/centralPolicy.ts`（deny-by-default） |
| 审计事件发射 | `orchestration/auditLog.ts` |
| 模型路由（Scene Manager） | `sceneManager.ts`（11 种场景 → 成本适配模型） |
| Chat 会话核心 | `ottoChat.ts` |
| Prompt 构造 | `prompts.ts` |
| 子 Agent 生命周期 | `subAgent.ts`, `agentResourceBudget.ts` |
| Workflow 系统 | `workflowRegistry.ts`, `workflowRunner.ts` |
| 内存子系统接口 | `memory/memorySubsystem.ts` |
| A2A 协议 | `a2a/atoaProtocol.ts` |
| Kernel 分发清单 | `kernel/kernelDistributionManifest.ts`（签名编译产物） |

**内核性能预算（企业底线）**：
- 冷启动 ≤ 1200ms，Registry 就绪 ≤ 500ms
- 空闲 RSS ≤ 180MB，子 Agent RSS delta ≤ 80MB
- 分发体积 ≤ 10MB

**内核禁止项（显式禁令）**：
- ❌ `import from 'react', 'ink', 'electron'`
- ❌ `import from '../../desktop/', '../../cli/', '../../server/'`
- ❌ Provider-specific adapters
- ❌ Memory ranking/scoring internals
- ❌ Document workflows（PPT、Office）
- ❌ Desktop/web automation tools
- ❌ IDE/LSP-specific code
- ❌ Feishu org sync, enterprise collaboration

### 移植到 EasyCode 的建议

1. 在 `packages/core/` 中建立 `docs/runtime-kernel-boundary.md`
2. 创建 `kernelBoundary.test.ts` 自动验证无违规 import
3. EasyCode 的 `core/` 和 `desktop/` 包之间维持相同的 thin-shell 模式
4. 企业级特性全部放在 server 层，core 保持零 UI/零 enterprise 依赖

---

## 4. EasyCode 兼容性适配

### Otto 中的 EasyCode 兼容现状

Otto（前身 EasyCode）的兼容性处于**过渡期**：

- npm 包名仍为 `easycode-ai`（向后兼容）
- 配置目录：`.easycode/` 和 `.easycode-user/` 与 `.otto-user/` 并存
- `EASYCODE.md` 项目配置文件约定仍然存在
- README 明确声明："Package names and config directories kept for backward compatibility; new docs and UI use the new brand name"

### 具体兼容代码位置

1. `packages/server/src/coreConfig.ts`（line 83）："已废弃的 easycode 代理分支"
2. `packages/server/src/feishu/register.ts`（line 21）："同款的真实 core runtime；这对应官方 EasyCode 的隔离 Config/LLM client 初始化"
3. `packages/server/src/feishu/feishuAdapter.ts`（line 115）："官方 EasyCode会在每个 chat 首条消息到达时先初始化隔离 Config/LLM client"
4. 双路径配置：系统同时读取 `.otto-user/`（新）和 `.easycode-user/`（旧），`OTTO_USER_DIR` 环境变量覆盖两者
5. `WhatsNewDialog.tsx`：显示"对齐 EasyCode 的飞书会话隔离逻辑"作为发布说明

### 移植到 EasyCode 的建议

1. **飞书会话隔离**：移植 Otto 的 `feishuAdapter.ts` 中的 session-per-chat 隔离初始化逻辑到 EasyCode
2. **配置双路径兼容**：EasyCode 需要能同时读取 `.easycode-user/` 和 `.easycode/` 中的配置
3. **OTTO_USER_DIR 环境变量**：移植测试隔离机制，避免污染真实用户目录
4. **核心配置代理**：移植 coreConfig.ts 中的 proxy routing 逻辑（已废弃 easycode 分支的替代实现）

---

## 5. 代码约定

- **双语代码库**：注释和变量名中英双语，信号词词典重度中文（偏好、解决、根因）
- **领域 ID 模式**：`${prefix}_${randomUUID()}`（如 `company_xxxx-xxxx`）
- **JSONL-first 存储**：本地数据优先用 JSONL append-only 格式
- **写链序列化**：所有写操作用 `writeChain` 防竞态
- **Fail-safe 设计**：知识捕获失败静默吞掉，内存注入失败不打断 turn
- **测试隔离约定**：`OTTO_USER_DIR` 环境变量覆盖，永不污染真实 `~/.otto-user`
- **Deny-by-default 策略**：`CentralPolicy.canExecute()` 缺配置时默认 Deny

---

*Signed: king*
