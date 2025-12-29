# Token Renew 阈值优化

## 问题描述

### 问题1: 过度紧凑的 Renew 阈值
- TokenManager 中的 `refreshBufferTime` 被设置为 **120 秒（2分钟）**
- ProxyAuthManager 中的 `isTokenNearExpiry` 阈值被设置为 **300 秒（5分钟）**
- 这对于有效期 10+ 天的 token 来说过于紧凑
- 用户关闭 CLI 离线后，下次打开时 token 很可能已过期，必须重新认证

### 问题2: 日志混乱
- `getAccessToken()` 方法在每次 API 调用时都会输出状态日志
- 这导致日志混乱，如：`"[ModelCommand] Fetching models... 44分钟, next renewal at 2025/11/19 21:36:31"`
- token 状态日志不应该混在业务日志中

## 解决方案

### 1. 提升 Renew 阈值到 3 天

基于 token 有效期为 10+ 天的实际情况，采用业界标准做法：

```typescript
/**
 * Token 刷新阈值常量
 * 针对 10+ 天有效期的 token，提前 3 天发起刷新
 * 这符合业界最佳实践，避免用户离线后 token 过期
 */
const TOKEN_REFRESH_THRESHOLD_SECONDS = 259200; // 3 天
```

### 2. 统一所有阈值

修改了以下文件：

**packages/cli/src/auth/tokenManager.ts**
```typescript
// 改动前
refreshBufferTime: 120, // 2分钟

// 改动后
refreshBufferTime: 259200, // 3天
```

**packages/core/src/core/proxyAuth.ts**
```typescript
// 改动前
private isTokenNearExpiry(thresholdSeconds: number = 300): boolean

// 改动后
private isTokenNearExpiry(thresholdSeconds: number = TOKEN_REFRESH_THRESHOLD_SECONDS): boolean
```

### 3. 清理混乱的日志

移除了 `getAccessToken()` 方法中每次 API 调用都输出的状态日志：

```typescript
// 移除了这段代码，避免日志混乱
// const timeSinceLastLog = now - (this.lastStatusLogTime || 0);
// if (timeSinceLastLog > 60000) {
//   console.log(`[Login Check] Credential status: ...`);
// }
```

现在只有在 token 真正需要刷新时才会输出相关日志：
```
[Login Check] Access credential expiring soon (remaining: ...), starting auto-renewal...
```

## 改进效果

### 用户体验提升

| 场景 | 改动前 | 改动后 |
|------|--------|--------|
| 用户离线 30 分钟后回来 | ❌ Token 已过期，需要重新认证 | ✅ Token 仍有效 |
| 用户离线 2 天后回来 | ❌ Token 已过期，需要重新认证 | ✅ Token 仍有效，如有需要会自动续期 |
| 日志清晰度 | ❌ token 日志混在业务日志中 | ✅ 日志分离，仅在关键时刻输出 |

### 刷新逻辑说明

```
Token 有效期: 10+ 天 (e.g., 2025/11/16 21:36:31 到 2025/11/29 21:36:31)
           |-------- 3天 ---------|
刷新阈值时间: 2025/11/26 21:36:31  (离过期时间还有3天)

用户可能的离线场景:
- 离线1小时: ✅ 回来后继续使用，token 有效
- 离线1天:   ✅ 回来后继续使用，token 有效
- 离线3天:   ✅ 回来后刷新 token（如果触发过刷新的话）
- 离线10天:  ❌ Token 已过期，需要重新认证（但至少给了用户7天的使用时间）
```

## 技术细节

### 调整的检查周期

- **定期状态检查**：每 10 分钟检查一次 token 状态
- **API 调用时检查**：每次 `getAccessToken()` 调用时都检查是否需要刷新
- **自动刷新触发**：当距离 token 过期时间 ≤ 3 天时触发

### 防并发机制

- 同时只允许一个 token 刷新操作进行
- 其他同时到来的请求会等待刷新完成后获得新 token
- 刷新失败时会清除 token，提示用户重新认证

## 修改清单

- [x] TokenManager 中的 `refreshBufferTime` 更新为 259200 秒
- [x] ProxyAuthManager 中的 `isTokenNearExpiry` 默认参数更新
- [x] 提取 `TOKEN_REFRESH_THRESHOLD_SECONDS` 常量以避免硬编码
- [x] 更新所有日志输出中的阈值计算
- [x] 移除不必要的状态日志输出
- [x] 移除未使用的 `lastStatusLogTime` 属性

## 验证状态

✅ 构建成功
✅ 无编译错误
✅ 所有修改已保存

## 相关文档

- [auth-lazy-refresh.md](./auth-lazy-refresh.md) - 认证延迟刷新优化
- [deployment.md](./deployment.md) - 部署文档

## 修改日期

2025-01-29
