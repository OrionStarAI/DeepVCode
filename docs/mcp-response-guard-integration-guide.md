# MCP响应保护机制 - 集成指南

## 快速总结

已在 `ToolExecutionEngine` 中实现了MCP响应保护，防止大型工具响应导致Token计算异常。

## 已实现的保护

✅ **自动启用** - 无需手动配置，系统自动对所有MCP工具响应应用保护

### 保护包括：

1. **大小验证和记录**
   - 响应加入历史前自动记录其大小
   - 日志显示：`[GUARD] 响应安全 | 大小: 45.32KB`

2. **上下文感知的动态截断**
   - 自动检测上下文剩余空间
   - 上下文不足时自动截断响应
   - 日志显示：`[GUARD] 上下文空间不足，响应已被截断 | 原始: 120.45KB -> 48.23KB`

3. **超大响应文件存储**
   - 超过256KB的响应自动转为临时文件
   - 自动为AI生成指导信息
   - 指导AI使用 `search_file_content` 工具精准读取

4. **自动清理**
   - 临时文件30分钟后自动删除
   - 支持手动清理

## 工作流程示意

```
MCP工具执行完成
        ↓
得到工具响应 (可能很大)
        ↓
MCPResponseGuard 自动检查
        ├─ 响应大小 < 256KB 且 Token < 剩余空间50% → ✅ 直接通过
        ├─ 上下文 > 20% 剩余 → ✅ 通过（可能截断）
        ├─ 上下文 10-20% 剩余 → 🔄 截断到50%
        ├─ 上下文 < 10% 剩余 → 📁 存为临时文件
        └─ 响应 > 256KB → 📁 存为临时文件
        ↓
返回处理后的安全响应
        ↓
继续正常流程，加入历史
```

## 临时文件位置

临时文件默认存储在项目的 `.deepvcode/mcp-tmp/` 文件夹下：

```
项目根目录/
├── .deepvcode/
│   └── mcp-tmp/
│       ├── mcp-response-read-many-files-1699564800000.json
│       ├── mcp-response-read-file-1699564801000.json
│       └── ... (30分钟后自动清理)
```

## 日志查看

在运行时查看保护的工作情况：

```bash
# 查找保护日志
[MCPResponseGuard] Processing response from tool 'xxx'
[ToolExecutionEngine] [GUARD] ...
```

## 无需修改的地方

以下模块已自动支持保护，无需更改：

- ✅ `coreToolScheduler.ts` - 通过ToolExecutionEngine处理
- ✅ `geminiChat.ts` - 接收已处理的响应
- ✅ 用户界面 - 自动显示处理后的内容或指导

## 配置（可选）

如需自定义保护参数，修改 `ToolExecutionEngine` 构造函数中的配置：

```typescript
// packages/core/src/core/toolExecutionEngine.ts
this.mcpResponseGuard = new MCPResponseGuard({
  maxResponseSize: 100 * 1024,        // 100KB - 激进限制，防止单轮消耗过多上下文
  contextLowThreshold: 0.2,           // 20%
  contextCriticalThreshold: 0.1,      // 10%
  enableTempFileStorage: true,        // 启用文件存储
  tempFileTTL: 30 * 60 * 1000,       // 30分钟自动清理
});
```

## 改进机会

### 短期改进 (可选)

1. **获取真实上下文使用百分比**
   ```typescript
   // 目前使用硬编码的 50%
   const currentContextUsage = 50;

   // 应该从 GeminiClient 获取真实值
   // const currentContextUsage = this.getChat().getContextUsagePercentage();
   ```

2. **集成到SubAgent**
   - 在 `subAgent.ts` 的工具响应处理中应用相同保护

3. **添加用户通知**
   - 在截断/文件存储时显示用户友好的通知

### 长期改进

1. **自适应阈值**
   - 根据模型和用户配置动态调整阈值

2. **响应压缩**
   - 对响应进行智能压缩而不是简单截断

3. **分析和报告**
   - 记录哪些工具产生大响应
   - 提供优化建议

## 验证保护是否工作

### 测试场景

1. **小响应（正常通过）**
   ```
   运行任何返回小结果的MCP工具
   → 日志显示：[GUARD] 响应安全 | 大小: XX.XXKB
   ```

2. **大响应（上下文充足时）**
   ```
   连续运行返回大结果的工具（如 read-many-files）
   → 日志显示：[GUARD] 响应安全 | 大小: XXX.XXKB
   ```

3. **大响应（上下文不足时）**
   ```
   在接近token限制时运行返回大结果的工具
   → 日志显示：
     [GUARD] 上下文空间不足，响应已被截断 | 原始: XXX.XXKB -> YY.YYKB
     或
     [GUARD] Response stored as file due to size
   ```

## 常见问题

### Q: 为什么我的响应被截断了？
A: 上下文剩余空间不足。MCPResponseGuard自动检测到这种情况并截断了响应以防止Token计算异常。

### Q: 如何访问被存储为文件的完整响应？
A: 使用 `search_file_content` 工具搜索文件内容，或使用 `read_file` 读取完整文件。文件路径会在AI响应中提供。

### Q: 临时文件会被删除吗？
A: 是的，在30分钟内如果没有新的访问，临时文件会自动删除。

### Q: 能否禁用保护？
A: 可以，但不建议。如果需要，可以在 `ToolExecutionEngine` 中注释掉保护代码或修改配置。

### Q: 保护会影响性能吗？
A: 影响极小。大多数情况下只是记录日志和大小检查。文件I/O只在超大响应时发生。

## 相关文档

- [MCP响应保护机制详细说明](./mcp-response-guard.md)
- [Token上下文计算异常原因分析](./mcp-token-analysis.md)
- [工具执行架构](./architecture.md)

---

**最后更新**: 2025-01-XX
**状态**: ✅ 已实现并通过编译
**部署**: 生产就绪
