# 版本回退 UI 集成指南

**说明**: 如何在 VSCode 插件的 UI 层集成回退限制机制

---

## 📋 概览

在 VSCode 插件中，版本回退按钮需要根据消息的回退状态来决定是否显示和启用。

本指南说明如何使用后端提供的 API 方法来实现这一功能。

---

## 🔧 后端 API 方法

### 1. `canRevertMessage(sessionId, turnId)`

**用途**: 检查消息是否可以回退

**返回值**:
```typescript
{
  canRevert: boolean;      // 是否可以回退
  reason?: string;         // 如果不可回退，原因是什么
}
```

**使用示例**:
```typescript
const status = versionControlManager.canRevertMessage(sessionId, messageId);

if (status.canRevert) {
  // 显示并启用回退按钮
  showRevertButton(messageElement);
} else {
  // 禁用或隐藏回退按钮
  disableRevertButton(messageElement, status.reason);
}
```

### 2. `getMessageRevertStatus(sessionId, turnId)`

**用途**: 获取消息的详细回退状态（便于调试和展示）

**返回值**:
```typescript
{
  canRevert: boolean;           // 是否可以回退
  hasBeenReverted: boolean;     // 是否已被回退过
  isLocked: boolean;            // 是否被锁定
  reason?: string;              // 无法回退的原因
}
```

**使用示例**:
```typescript
const status = versionControlManager.getMessageRevertStatus(sessionId, messageId);

// 根据不同的状态显示不同的提示
if (status.hasBeenReverted) {
  tooltip = "✅ 已回退过，不可再回退";
  buttonState = "disabled";
} else if (status.isLocked) {
  tooltip = "🔒 已被锁定，无法回退";
  buttonState = "disabled";
} else if (status.canRevert) {
  tooltip = "↩️ 回退到此消息";
  buttonState = "enabled";
}
```

---

## 🎨 UI 实现示例

### 场景 1: MessageBubble 组件（消息气泡中的回退按钮）

**当前的 VersionHistoryButton.tsx**:
```typescript
export const VersionHistoryButton: React.FC<VersionHistoryButtonProps> = ({
  sessionId,
  className = ''
}) => {
  const handleRevertPrevious = useCallback(() => {
    window.vscode.postMessage({
      type: 'version_revert_previous',
      payload: { sessionId }
    });
  }, [sessionId]);

  return (
    <button
      className="version-history-button"
      onClick={handleRevertPrevious}
      title="Revert to previous"
    >
      ↩️ Revert
    </button>
  );
};
```

**改进版本：添加回退限制检查**:
```typescript
import { useEffect, useState } from 'react';

interface VersionHistoryButtonProps {
  sessionId: string;
  messageId: string;  // 👈 新增参数
  className?: string;
}

export const VersionHistoryButton: React.FC<VersionHistoryButtonProps> = ({
  sessionId,
  messageId,
  className = ''
}) => {
  const [canRevert, setCanRevert] = useState(true);
  const [revertStatus, setRevertStatus] = useState<string>('');

  // 检查消息是否可以回退
  useEffect(() => {
    const checkRevertStatus = async () => {
      // 通过消息总线查询后端
      window.vscode.postMessage({
        type: 'check_revert_status',
        payload: { sessionId, messageId }
      });
    };

    checkRevertStatus();

    // 监听回退状态响应
    const handler = (event: any) => {
      if (event.data.type === 'revert_status_response') {
        const status = event.data.payload;
        setCanRevert(status.canRevert);
        setRevertStatus(status.reason || '');
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [sessionId, messageId]);

  const handleRevert = useCallback(() => {
    if (!canRevert) {
      alert(revertStatus || 'Cannot revert this message');
      return;
    }

    window.vscode.postMessage({
      type: 'revert_to_message',
      payload: { sessionId, messageId }
    });
  }, [sessionId, messageId, canRevert, revertStatus]);

  return (
    <button
      className={`version-history-button ${className}`}
      onClick={handleRevert}
      disabled={!canRevert}
      title={canRevert ? 'Revert to this message' : revertStatus}
      style={{
        opacity: canRevert ? 1 : 0.5,
        cursor: canRevert ? 'pointer' : 'not-allowed'
      }}
    >
      ↩️ {canRevert ? 'Revert' : 'Reverted'}
    </button>
  );
};
```

---

### 场景 2: 消息列表中的状态指示

在聊天界面中，显示每条消息的回退状态：

```typescript
interface MessageItemProps {
  message: Message;
  sessionId: string;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  sessionId
}) => {
  const [revertStatus, setRevertStatus] = useState<RevertStatus | null>(null);

  useEffect(() => {
    // 查询消息的回退状态
    window.vscode.postMessage({
      type: 'get_message_revert_status',
      payload: { sessionId, messageId: message.id }
    });

    const handler = (event: any) => {
      if (event.data.type === 'message_revert_status_response') {
        setRevertStatus(event.data.payload);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [message.id, sessionId]);

  return (
    <div className="message-item">
      <div className="message-content">
        {message.content}
      </div>

      {/* 显示回退状态指示器 */}
      <div className="message-footer">
        {revertStatus && (
          <span className={`revert-status ${revertStatus.status}`}>
            {revertStatus.hasBeenReverted && '✅ Reverted'}
            {revertStatus.isLocked && '🔒 Locked'}
            {revertStatus.canRevert && '↩️ Can revert'}
          </span>
        )}

        {/* 回退按钮 */}
        {revertStatus?.canRevert && (
          <button onClick={() => handleRevert(message.id)}>
            Revert
          </button>
        )}
      </div>
    </div>
  );
};
```

---

## 🔄 消息总线集成

在 VSCode 扩展的 `extension.ts` 中添加消息处理器：

```typescript
// 处理 UI 查询：检查消息是否可回退
communicationService.on('check_revert_status', async (payload) => {
  const { sessionId, messageId } = payload;

  const canRevert = versionControlManager.canRevertMessage(sessionId, messageId);

  // 发送结果回 UI
  webviewService.postMessage({
    type: 'revert_status_response',
    payload: canRevert
  });
});

// 处理 UI 查询：获取消息的详细状态
communicationService.on('get_message_revert_status', async (payload) => {
  const { sessionId, messageId } = payload;

  const status = versionControlManager.getMessageRevertStatus(
    sessionId,
    messageId
  );

  // 发送结果回 UI
  webviewService.postMessage({
    type: 'message_revert_status_response',
    payload: {
      canRevert: status.canRevert,
      hasBeenReverted: status.hasBeenReverted,
      isLocked: status.isLocked,
      reason: status.reason,
      status: status.canRevert ? 'enabled' :
              status.hasBeenReverted ? 'reverted' :
              status.isLocked ? 'locked' : 'unknown'
    }
  });
});
```

---

## 🎯 推荐的实现步骤

### 第 1 步：在 VersionHistoryButton 中添加检查
```typescript
// 位置: webview/src/components/VersionHistoryButton.tsx

const [revertStatus, setRevertStatus] = useState<any>(null);

useEffect(() => {
  window.vscode.postMessage({
    type: 'check_revert_status',
    payload: { sessionId, messageId: props.messageId }
  });
}, [sessionId, props.messageId]);
```

### 第 2 步：在 extension.ts 中添加消息处理器
```typescript
// 位置: src/extension.ts

communicationService.onCheckRevertStatus(async (payload) => {
  const status = versionControlManager.canRevertMessage(
    payload.sessionId,
    payload.messageId
  );
  // 发送响应...
});
```

### 第 3 步：根据状态更新 UI
```typescript
// 在 VersionHistoryButton 中
<button
  disabled={!revertStatus?.canRevert}
  onClick={handleRevert}
  title={revertStatus?.reason || '回退到此消息'}
>
  ↩️
</button>
```

### 第 4 步：测试
- 创建多条消息
- 回退某条消息
- 验证该消息和后续消息的回退按钮被禁用

---

## 🎨 UI 样式建议

### 禁用状态样式

```css
/* 禁用的回退按钮 */
.revert-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: #ccc;
  border-color: #aaa;
}

.revert-button:disabled:hover {
  background-color: #ccc;  /* 禁用时不改变背景 */
  box-shadow: none;
}
```

### 状态指示器样式

```css
/* 已回退 */
.message-status.reverted {
  color: #28a745;  /* 绿色 */
  font-size: 12px;
}

/* 被锁定 */
.message-status.locked {
  color: #dc3545;  /* 红色 */
  font-size: 12px;
}

/* 可回退 */
.message-status.revertable {
  color: #007bff;  /* 蓝色 */
  font-size: 12px;
}
```

---

## 📝 开发检查清单

- [ ] 在 VersionHistoryButton 或相关组件中添加 `messageId` 参数
- [ ] 实现后端 API 的调用逻辑
- [ ] 在 extension.ts 中添加消息处理器
- [ ] 根据回退状态启用/禁用 UI 元素
- [ ] 添加清晰的用户提示和工具提示
- [ ] 测试单次回退限制
- [ ] 测试后续节点锁定
- [ ] 添加状态指示器（可选）

---

## 🧪 测试用例

### 用例 1: 基本回退限制
```
1. 创建消息序列
2. 点击消息2的回退按钮 → ✅ 成功
3. 再次点击消息2的回退按钮 → ❌ 按钮禁用或显示错误
```

### 用例 2: 后续节点锁定
```
1. 创建消息1、2、3
2. 回退消息2 → ✅ 成功
3. 尝试点击消息3的回退按钮 → ❌ 按钮应禁用
4. 尝试点击消息1的回退按钮 → ✅ 仍可回退
```

### 用例 3: UI 状态同步
```
1. 创建消息2
2. 在 DevTools 中检查按钮的 disabled 属性 → false
3. 点击回退 → ✅ 成功
4. 检查按钮的 disabled 属性 → true
```

---

## 🔗 相关文件

- `REVERT_LIMIT_IMPLEMENTATION.md` - 后端实现细节
- `webview/src/components/VersionHistoryButton.tsx` - 回退按钮组件
- `src/extension.ts` - 消息处理器位置

---

## 💡 实现建议

1. **渐进式实现**: 先实现基本的启用/禁用，再添加状态指示器
2. **用户友好**: 提供清晰的提示为什么按钮被禁用
3. **视觉反馈**: 使用颜色或图标区分不同的状态
4. **性能考虑**: 缓存回退状态，避免频繁查询

---

**创建日期**: 2025年10月31日
**版本**: 1.0
**状态**: 实现指南
