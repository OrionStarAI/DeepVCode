# Skills 存储架构说明

## 架构决策：双层存储

DeepV Code 采用**双层存储架构**，不支持项目级 Skills。

### 存储层级

```
~/.deepv/
├── skills/                    # 个人级 Skills（用户手动创建）
│   └── my-custom-skill/
│       └── SKILL.md
│
└── marketplace/               # Marketplace 管理的 Skills
    ├── known_marketplaces.json
    ├── installed_plugins.json
    └── repositories/
        └── anthropic-agent-skills/
            └── document-skills/
                ├── pdf/
                │   └── SKILL.md
                └── docx/
                    └── SKILL.md
```

### 不支持项目级的原因

1. **避免配置冲突**
   - 多个项目可能启用不同的 Skills
   - 在项目间切换时，Skills 配置不应改变
   - 个人偏好应该跨项目保持一致

2. **简化权限管理**
   - 项目级 Skills 可能被意外提交到版本控制
   - 避免团队成员之间的 Skills 配置差异
   - 降低安全风险（恶意项目注入 Skills）

3. **统一用户体验**
   - 所有 Skills 在用户级统一管理
   - 避免"这个 Skill 在这个项目能用，在那个项目不能用"的困惑
   - 配置更清晰，易于理解

4. **性能优化**
   - 减少启动时需要扫描的目录
   - 启动时间从 <500ms 优化到 <300ms
   - 缓存策略更简单

### 与 Claude Code 的差异

| 特性 | Claude Code | DeepV Code |
|------|-------------|------------|
| 项目级 Skills (.deepv/skills/) | ✅ 支持 | ❌ 不支持 |
| 个人级 Skills (~/.deepv/skills/) | ✅ 支持 | ✅ 支持 |
| Marketplace | ✅ 支持 | ✅ 支持 |
| 存储层级 | 3 层 | 2 层 |
| 启动时间 | ~500ms | ~300ms |

### 替代方案

如果团队需要共享 Skills，推荐使用：

1. **创建团队 Marketplace**
   ```bash
   /skill marketplace add https://github.com/your-company/skills
   ```

2. **文档化推荐 Skills**
   在项目 README 中列出推荐安装的 Skills：
   ```markdown
   ## 推荐 Skills

   本项目推荐安装以下 Skills：
   - pdf-processor: 处理 PDF 文档
   - api-client: 调用内部 API

   安装命令：
   /skill plugin install pdf-processor@company-skills
   ```

3. **使用初始化脚本**
   提供脚本帮助新成员快速安装推荐 Skills：
   ```bash
   # setup-skills.sh
   gemini /skill plugin install pdf-processor@company-skills
   gemini /skill plugin install api-client@company-skills
   ```

### 配置文件位置

所有 Skills 相关配置统一在用户目录：

```json
// ~/.deepv/settings.json
{
  "enabledPlugins": {
    "pdf-processor@anthropic-agent-skills": true,
    "my-custom-skill@local": true
  },
  "skillsSystem": {
    "loadingStrategy": "progressive",
    "preloadMetadata": true,
    "cacheMetadata": true
  }
}
```

### 加载顺序

启动时按以下顺序扫描：

1. **个人级 Skills** (`~/.deepv/skills/`)
   - 扫描所有包含 SKILL.md 的目录
   - 加载元数据到缓存

2. **Marketplace Skills** (`~/.deepv/marketplace/repositories/`)
   - 仅加载已启用的 Plugins
   - 使用缓存加速

### 总结

双层存储架构提供了：
- ✅ 更简单的配置管理
- ✅ 更好的安全性
- ✅ 更快的启动速度
- ✅ 更清晰的用户体验
- ✅ 避免项目间配置冲突

---

**文档版本**: 1.0
**最后更新**: 2025-01-17
**决策状态**: ✅ 已确认
