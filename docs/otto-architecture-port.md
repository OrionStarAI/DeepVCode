# Otto 架构移植：全面特性清单

本文档描述从 Otto 项目移植到 EasyCode 的全部关键架构特性，涵盖 24 个模块。

---

## 1. 知识库双架构（Dual Knowledge Architecture）

**文件**: `packages/core/src/knowledge/knowledgeCapture.ts`, `packages/server/src/enterprise/db/knowledge.ts`

Otto 采用**本地+企业**双知识库架构，两者完全独立、零耦合：

| 层级 | 存储 | 适用场景 | Node 要求 |
|------|------|---------|----------|
| 本地知识库 | JSONL（`~/.otto-user/knowledge/entries.jsonl`） | 个人、离线、零依赖 | ≥20（Core 通用） |
| 企业知识库 | SQLite（`knowledge` 表） | 组织级、部门隔离 | ≥22.13.0（Server） |

**为什么 JSONL 而不是 SQLite**：Core 的 `engines` 要求 Node≥20，但 `node:sqlite` 需要 Node≥22.5+。Core 被 CLI/Electron 消费时 Node 版本不可控。JSONL 零依赖、始终可用。

关键特性：
- **信号词提取**：4 类信号词（偏好/决策/方案/调研）+ 低价值过滤器，confidence 分级（偏好=0.85, 方案=0.75, 决策=0.7, 调研=0.65），阈值 0.8 自动写入
- **秘密脱敏**：11 个 regex 检测 sk-/Bearer/GitHub PAT/AWS AKIA/JWT/Private Key 等
- **指纹去重**：SHA-256 前 16 hex + 标准化（小写+空格折叠）
- **相似合并**：字符 bigram Jaccard ≥ 0.85 合并，保留新条目
- **写链序列化**：`writeChain` 防并发 read-modify-write 竞态
- **企业知识库**：部门隔离 + `ON CONFLICT DO NOTHING` + LIKE 模糊搜索

**移植建议**：EasyCode server 层增加 SQLite enterprise knowledge 模块，保持 JSONL local store 零耦合。

---

## 2. 项目合并与分离（Company Merge/Separation）

**文件**: `packages/server/src/enterprise/db/organizations.ts`

核心 `applyCompanyLinkRedemption()`，三种邀请类型（position/company/company_link），两种合并方向（parent_invites_child / child_requests_parent），防环保护（遍历 parentCompanyId 链），占位名称策略，Ed25519 签名。

**移植建议**：增加 `CompanyLink` 类型 + 环检测 + Ed25519 签名。

---

## 3. 内核与包装层分离（Kernel vs Wrapper）

**文件**: `docs/runtime-kernel-boundary.md`, `packages/core/src/kernelBoundary.test.ts`

活文档 + 自动验证测试。内核性能预算：冷启动≤1200ms，空闲RSS≤180MB，分发≤10MB。显式禁令：禁止 UI/enterprise/provider 依赖进入内核。

**移植建议**：在 `packages/core/` 建立 `runtime-kernel-boundary.md` + `kernelBoundary.test.ts`。

---

## 4. Scene Manager — 成本适配模型路由

**文件**: `packages/core/src/core/sceneManager.ts`

11 种场景类型（CHAT_CONVERSATION, WEB_FETCH, WEB_SEARCH, CONTENT_SUMMARY, JSON_GENERATION, COMPRESSION, SUB_AGENT, CODE_ASSIST, EDIT_CORRECTION, IMAGE_READER, GOAL_EVALUATION），每种映射到成本最优模型。如 CONTENT_SUMMARY → `gemini-2.5-flash-lite`，GOAL_EVALUATION → `deepseek-v4-flash`。CHAT_CONVERSATION 从硬编码 `claude-sonnet-4` 改为 `auto`——文档明确标注"降低账单风险"。

**为什么重要**：这是 Otto 的核心成本控制机制。不用最贵模型跑所有任务，每个操作场景用最便宜的够用模型。

**移植建议**：EasyCode 的 `sceneManager.ts` 已有类似能力，应补充场景类型覆盖面（GOAL_EVALUATION, EDIT_CORRECTION 等）。

---

## 5. Turn State Machine — 会话生命周期强制

**文件**: `packages/core/src/core/turnStateMachine.ts`, `packages/core/src/core/turn.ts`

10 个状态确定性有限状态机：`CREATED → PLANNING → AWAITING_PERMISSION → EXECUTING_TOOL → OBSERVING_RESULT → PLANNING(loop) → WRITING_MEMORY → CHECKPOINTING → COMPLETED`。`ReadonlyMap<TurnState, ReadonlySet<TurnState>>` 编译时安全 + 运行时强制。非法转换抛 `InvalidTransitionError`。三个逃生出口：任何非终态可转 `FAILED` 或 `CANCELLED`。

**为什么重要**：防止 agent 进入不一致状态（跳过权限检查、未完成工具就写内存）。大多数 AI agent 框架用 ad-hoc 管理；Otto 用状态机不可绕过。

**移植建议**：EasyCode 的 turn lifecycle 应引入正式状态机 + 转换表验证。

---

## 6. Sub-Agent 三层编排

**文件**: `packages/core/src/agents/agentDefinition.ts`, `runForkedAgent.ts`, `agentResourceBudget.ts`, `subAgent.ts`

三层系统：(1) Agent 定义（5 种类型：code-analysis/explorer/reviewer/test-planner/workflow-orchestrator），(2) 设备级资源预算（检测 RAM+CPU → low/standard/high，控制并发/超时/历史长度），(3) Forked Agent（轻量单-turn /btw 侧问题，独立 AbortSignal，不共享 token 计量）。

设备级预算示例：low(8GB/4CPU) → taskMaxConcurrency=1, workflowMaxAgents=24, subAgentTimeout=20min；high(32GB/12CPU) → concurrency=3, maxAgents=64, timeout=30min。所有值可通过 `OTTO_AGENT_PROFILE` 等环境变量 override，有 `clamp()` 上下限保护。

**移植建议**：EasyCode 应实现设备级资源预算检测 + forked agent 模式。

---

## 7. CentralPolicy — Deny-by-Default 执行门

**文件**: `packages/core/src/policy/centralPolicy.ts`, `policy-engine.ts`, `highRiskTools.ts`

单一策略决策点 `canExecute()`：1. 无工具→Deny，2. 功能开关关→Deny，3. 高风险→AskUser（即使 AUTO_EDIT 模式），4. 审批模式门控。

三种审批模式：DEFAULT（全部问）、AUTO_EDIT（写操作仍问）、YOLO（全允许但功能开关仍生效）。风险分级：HIGH(shell/write/delete/send)→始终问；MEDIUM(create/replace/mcp)→DEFAULT 下问；LOW→自动放行。功能开关映射：`lark_cli→feishu_auto_reply`，`desktop_automation→park_service`，`memory_manager→knowledge_loop`。

**移植建议**：EasyCode 应实现 deny-by-default 策略引擎 + 风险分级 + 功能开关映射。

---

## 8. 审计日志双架构

**文件**: `packages/core/src/orchestration/auditLog.ts`, `packages/server/src/enterprise/auditRepository.ts`

Core层：`~/.otto-user/audit/audit-<date>.jsonl`（按日分区），自动风险推断（shell/delete→high, write→medium, read→low），敏感内容脱敏，目录权限 0o700/文件 0o600，日期范围查询 + 报告生成。

Enterprise层：`auditRepository` 记录组织事件（入职/邀请/配置变更）。

**为什么重要**：按日 JSONL 分区防膨胀 + 高效日期查询；自动风险分级无需手动标注；文件权限确保只有 OS 用户可读。

**移植建议**：EasyCode 应实现按日 JSONL 审计日志 + 风险推断 + 权限保护。

---

## 9. Workflow 系统 — Registry + Runner + VM沙箱

**文件**: `packages/core/src/core/workflowRegistry.ts`, `workflowRunner.ts`, `workflowAgentBridge.ts`

三部分：Registry（内存单例，150ms debounce UI通知，50记录上限，完成后自动 trim），Runner（vm.createContext 沙箱执行编排脚本，仅暴露 agent/phase/console/JSON/Promise），AgentBridge（串行 `agent(prompt)` + 并行 `agent.runParallel([...])`）。

`extractMeta()` 用 brace-depth 计数（非 regex）解析 `export const meta = {...}`。ES module→CommonJS 转换器用 state-machine + string/comment awareness 防止模板字符串内的语法被误转换。

**移植建议**：EasyCode workflow 应采用 VM 沙箱执行 + debounce registry + 串/并行双模式。

---

## 10. 内存子系统三层架构

**文件**: `packages/core/src/memory/memorySubsystem.ts`, `autoMerge.ts`, `sessionMemoryInjector.ts`

统一接口 `capture()/search()/getStats()/rebuild()/clear()`。三层：(1) AutoMemoryEngine（cross-source 去重≥0.85，auto-merge≥0.75，auto-split>2000tokens，auto-compress>30天≥3条），(2) KnowledgeCapturePipeline（全部 try/catch，失败不影响主对话），(3) SessionMemoryInjector（关键词提取+停词过滤+中英文，时间衰减半衰期14天，预算5条/500tokens）。

**disabled 模式**：`createNoopMemorySubsystem()` 全部返回空/no-op，零崩溃。

**移植建议**：EasyCode 应实现 auto-merge/split/compress 生命周期 + 时间衰减注入 + noop 失效模式。

---

## 11. A2A 协议 — Agent间通信

**文件**: `packages/core/src/a2a/atoaProtocol.ts`

两种消息（ATOA_REQUEST/ATOA_RESPONSE），两种模式（answer/consult），4 种数据源授权（current_chat/enterprise_knowledge/work_logs/schedules），响应方显式授权哪些源。

`longestFittingPrefix()` 用**二分搜索**找 UTF-8 4000字节限制下最长前缀——不靠截断猜测。无效消息静默当普通文本（绝不崩溃）。

**移植建议**：EasyCode 多 agent 场景应采用二分搜索消息适配 + 显式数据源授权模式。

---

## 12. 园区服务系统（Park Membership）

**文件**: `packages/server/src/enterprise/park.ts`, `parkInviteRepository.ts`, `parkServiceRepository.ts`, `parkStatisticsRepository.ts`

完整园区管理：园区→邀请码→企业会员→服务专员→服务请求→统计报告。邀请码 8字符（排除 I/1/O/0 混淆字符），原子使用追踪。服务专员按 serviceType 路由请求，无匹配时 fallback 到园区管理员。服务请求状态流：pending→assigned→in_progress→resolved。

**移植建议**：EasyGrowth 的企业增长工作台可参考此模式构建 SDR 服务路由。

---

## 13. 组织岗位/部门 — 职位映射系统

**文件**: `packages/server/src/enterprise/db/organizations.ts`

三级层次：Organization→Department→Position，`role_mapping` 字段将职位标题映射为系统权限（member/department_admin/enterprise_admin）。`resolveAssignmentIdentity()` 从部分输入自动创建部门和岗位：只需说"研发部/前端工程师"，系统自动 lookup/创建。

**移植建议**：EasyGrowth SDR pool 应采用 role_mapping + auto-creation 模式。

---

## 14. 双层邀请架构

**文件**: `packages/server/src/enterprise/inviteCodeRepository.ts`, `organizationInviteRepository.ts`, `organizationInviteFacade.ts`

两套完全不同的邀请系统：(1) Legacy 6字符随机码（department scoped，atomic used_count+1），(2) Organization 12字符 HMAC-SHA256 派生码（`HMAC(org.invite_secret, "orgId:nonce")` → modular indexing），**timing-safe 比较防时序攻击**，nonce-based 无明文存储，职位/部门预设分配，新邀请自动撤销旧邀请，Facade 模式封装 Repository。

**移植建议**：EasyCode 企业邀请应采用 HMAC 派生 + timingSafeEqual + nonce-based 设计。

---

## 15. Token 用量追踪 — 幂等客户端上报

**文件**: `packages/server/src/enterprise/db/usage.ts`

双重幂等：message_id dedup + INSERT OR IGNORE。日限额 `USAGE_DAILY_RECORD_LIMIT`（min(100000, env default 10000))）。Token 规范化：min=0, max=1B, reject NaN/negative。`totalTokens ≥ input+output` 一致性强制。

**移植建议**：EasyGrowth 广告投放 token 计量应采用幂等上报 + 日限额 + 一致性强制。

---

## 16. 员工双数据源合并

**文件**: `packages/server/src/enterprise/db/employees.ts`

A套（OrgMemoryStore/飞书同步 JSON）+ B套（SQLite 企业数据）透明合并。A套数据仅属 DEFAULT_ORGANIZATION_ID——"绝不能并入其他企业"防租户污染。getEmployee 先查 B→fallback A；listEmployees 去重合并。

**移植建议**：EasyCode 企业模块应支持双源数据迁移（飞书同步→本地 SQLite）。

---

## 17. Fail-safe 全面降级模式

**文件**: 多个 core/server 文件

系统性设计哲学（非 ad-hoc 错误处理）：
- MemorySubsystem disabled → noop，零崩溃
- AutoMemoryEngine → per-source catch，继续剩余
- KnowledgeCapture → 全部 try/catch，"沉淀失败不影响主对话流"
- AuditLogger → `.catch(() => {})`，"audit log failures are non-fatal"
- FileOperationQueue → 前操作错误不阻塞后操作
- TaskOrchestrator → LangGraph 失败→`ruleBasedAllocation()`降级
- MultiChannelGateway → 未实现渠道返回 `success: false` + "绝不谎报成功"
- CentralPolicy → 功能开关查询失败→deny-by-default
- db.ts → 迁移失败→关闭连接+抛异常（不留半初始化单例）

**移植建议**：EasyCode 每个子系统应显式定义降级路径 + "诚实边界"原则。

---

## 18. 测试隔离 — OTTO_USER_DIR 重定向

**文件**: 15+ test files

所有用户数据路径 `process.env.OTTO_USER_DIR || ~/.otto-user`。测试前设置 temp dir，后恢复。Enterprise DB 有独立 `OTTO_ENTERPRISE_DIR`。WorkLogger 有 `OTTO_WORKLOG_DIR` + pid-based temp path。运行时解析（非模块加载时冻结）——env var 后设也生效。

**移植建议**：EasyCode 测试应统一采用 `EASYCODE_USER_DIR` 环境变量重定向 + pid-based temp。

---

## 19. 多层安全体系

**文件**: `packages/server/src/enterprise/db/accounts.ts`, `organizationInviteRepository.ts`, `packages/core/src/utils/redaction.ts`, `knowledgeCapture.ts`, `packages/desktop/src/main/incremental-signature.ts`

5 层安全：
1. **scryptSync**：密码认证 N=16384, r=8, p=1, keylen=64
2. **timingSafeEqual**：邀请码验证防时序攻击
3. **Ed25519 签名链**：增量更新签名验证 `ed25519:<64-byte-base64url>`
4. **秘密检测**：11 regex（sk-/Bearer/ghp_/AKIA/eyJ/-----BEGIN PRIVATE KEY-----等）
5. **审计脱敏**：URL credentials/JSON key-value/Auth headers/query params/token prefixes/JWT 结构

**移植建议**：EasyCode 应全面采用 scryptSync + timingSafeEqual + Ed25519 签名链 + 双层脱敏。

---

## 20. 双路径配置兼容

**文件**: 贯穿 core/src

所有路径 `OTTO_USER_DIR || ~/.otto-user`，EasyCode 运行时路径 `.easycode-user/`。Enterprise 数据路径 `OTTO_ENTERPRISE_DIR || ~/.otto-enterprise` 与个人数据分离。单一二进制通过 env var 切换品牌身份，零代码改动。

**移植建议**：EasyCode 应支持 `OTTO_USER_DIR` / `EASYCODE_USER_DIR` 双环境变量 + enterprise 路径分离。

---

## 21. WorkLog — 员工活动追踪与经验搜索

**文件**: `packages/core/src/orchestration/workLog.ts`

JSONL 按日日志，`inferCategory()` 自动分类（40+ 工具名→14 类别）。`searchRelevantExperience()`：CJK 2-3 gram 提取 + recency×scope×type×success 四维评分。飞书卡片格式日报/周报。所有内容写入前 `redactSensitiveText()` 脱敏。

**移植建议**：EasyCode agent 应实现 WorkLog + experience search + CJK tokenization。

---

## 22. 诚实边界模式（Honest Boundary Pattern）

**文件**: `packages/core/src/a2a/multi-channels.ts`

`isChannelReady()` 未实现→始终返回 `false`；`connectChannel()` 返回明确失败消息："微信渠道尚未实现：拒绝谎报已连接"。飞书显式排除："飞书不在 multi_channel 网关内直连"。这是**信任架构**——绝不在能力状态上撒谎。

**移植建议**：EasyCode 所有 channel adapter 应遵循 honest boundary——未实现就返回 false + 明确原因。

---

## 23. 企业 DB 成本规范化 — 反通胀保护

**文件**: `packages/server/src/enterprise/db/schema.ts`

`ESTIMATE` 常量：manualTimeMultiplier=2, cnyPerHour=50，全部可通过 env var override。`normalizeCostCNY()`：非正成本→fallback 0.028（防"显式0"坍塌成本比）。`normalizeTokens()`：非正→fallback 2000。`laborPerTokenCap`：防 ROI dashboard 极端稀疏数据通胀。

**移植建议**：EasyGrowth 归因引擎应采用成本规范化 + fallback 值 +通胀 cap。

---

## 24. 数据库安全迁移

**文件**: `packages/server/src/enterprise/db/schema.ts`

`PRAGMA user_version` 版本追踪，降级拒绝（新 schema→抛错），预迁移备份 `.pre-b2b-v2.bak`（COPYFILE_EXCL 不覆盖）。Legacy auth迁移：auth_sessions→auth_sessions_legacy_v195→hash tokens→新 schema→drop legacy table——全部在事务内。

**移植建议**：EasyCode enterprise DB 应采用 PRAGMA 版本追踪 + 降级拒绝 + 预备份 + 事务迁移。

---

## 25. 并发写保护 — FileOperationQueue

**文件**: `packages/core/src/services/fileOperationQueue.ts`

per-file Promise 链序列化并发写操作。`enqueue()` 获取队列尾→链新操作→更新 tracker。错误隔离：前操作失败不阻塞当前。`enqueueMultiple()` 多文件操作按路径字母序防死锁。全局单例 `getGlobalFileOperationQueue()`。

**为什么重要**：解决 AI `Promise.all([replace(file,spot1), replace(file,spot2)])` 竞态——第二个 replace 读的是已修改文件而非原始文件。

**移植建议**：EasyCode 文件编辑引擎应采用 per-file Promise 链 + 字母序防死锁。

---

## 26. EasyCode 兼容性适配

**文件**: `packages/server/src/coreConfig.ts`, `feishu/register.ts`, `feishu/feishuAdapter.ts`

- npm 包名仍 `easycode-ai`（向后兼容）
- 配置目录 `.easycode/` + `.easycode-user/` 与 `.otto-user/` 并存
- `EASYCODE.md` 项目配置约定仍存在
- 飞书会话隔离：session-per-chat 隔离初始化
- 双路径配置读取
- coreConfig proxy routing 替代方案

**移植建议**：飞书会话隔离 + 配置双路径 + 测试隔离机制 + 核心配置代理。

---

## 代码约定

- **双语代码库**：注释和变量名中英双语，信号词词典重度中文
- **领域 ID 模式**：`${prefix}_${randomUUID()}`（如 `company_xxxx-xxxx`）
- **JSONL-first 存储**：本地数据优先用 JSONL append-only 格式
- **写链序列化**：所有写操作用 `writeChain` 防竞态
- **Fail-safe 设计**：捕获失败静默吞掉，内存注入失败不打断 turn
- **测试隔离约定**：环境变量覆盖，永不污染真实用户目录
- **Deny-by-default 策略**：缺配置时默认 Deny
- **诚实边界原则**：未实现能力返回 false + 明确原因，绝不谎报成功

---

*Signed: king*
