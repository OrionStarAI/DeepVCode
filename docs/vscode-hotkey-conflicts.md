# VSCode 热键冲突解决方案

## 问题描述

在VSCode内置终端中使用DeepV Code时，某些热键会被VSCode拦截，导致功能无法正常使用。

## 已知冲突热键

### 统一粘贴功能 (v1.0.135+)

**新功能**: 从 v1.0.135 版本开始，我们引入了**统一粘贴处理机制**。

**解决方案**:
- **主要快捷键**: `Ctrl+V` - 智能检测剪贴板内容，自动处理图像或文本粘贴
- **备用快捷键**: `Ctrl+G` - 仅在非VSCode环境下可用，专门用于图像粘贴

### Ctrl+G (图像粘贴功能) - 已解决

**问题**: 在VSCode内置终端中，Ctrl+G被VSCode的"跳转到行"功能拦截。

**解决方案**:
1. **推荐**: 使用 `Ctrl+V` 统一粘贴功能（自动检测图像或文本）
2. **备用**: Ctrl+G 仍在非VSCode环境下可用

**技术实现**:
- `Ctrl+V` 现在会自动检测剪贴板内容类型：
  - 如果包含图像 → 自动保存并插入图像引用
  - 如果包含文本 → 自动处理文本粘贴（支持长文本智能摘要）
- 通过 `process.env.VSCODE_PID` 或 `process.env.TERM_PROGRAM === 'vscode'` 检测VSCode环境
- 跨平台支持：Windows、macOS、Linux、WSL

## 快捷键映射表

| 功能 | 通用快捷键 | VSCode 环境 | Windows 独立终端 | macOS/Linux |
|------|-----------|-------------|------------------|-------------|
| **统一粘贴** | `Ctrl+V` | ✅ 完全支持 | ✅ 完全支持 | ✅ 完全支持 |
| **图像粘贴** | `Ctrl+G` | ❌ 被拦截 | ✅ 支持 | ✅ 支持 |
| **换行** | `Ctrl+Enter` | `Shift+Enter` (Win) / `Ctrl+J` (Mac) | ✅ 支持 | ✅ 支持 |
| **取消操作** | `Esc` | ✅ 支持 | ✅ 支持 | ✅ 支持 |

## 其他兼容性处理

### 终端粘贴模式
- **Bracketed Paste**: 自动检测并处理终端的粘贴模式
- **文本分割处理**: 智能合并被分割的大文本粘贴
- **长文本摘要**: 超过10行或100字符的文本会显示摘要，完整内容在发送时使用

## 开发者指南

如果需要添加新的热键功能，请确保：

1. 在 `InputPrompt.tsx` 中检查 `isVSCodeTerminal` 标志
2. 为VSCode环境提供替代热键或提示
3. 在国际化文件中添加相应的提示信息
4. 更新本文档说明新的冲突和解决方案

## 统一粘贴实现示例

```typescript
// 统一粘贴处理函数
const handleUnifiedPaste = async (): Promise<boolean> => {
  try {
    // 首先检查剪贴板是否包含图像
    const hasImage = await clipboardHasImage();

    if (hasImage) {
      // 自动处理图像粘贴
      await handleClipboardImage();
      return true;
    }

    // 如果没有图像，处理文本粘贴
    const clipboardText = await getClipboardText();
    if (clipboardText && clipboardText.trim()) {
      // 自动处理文本粘贴
      handleTextPaste({
        paste: true,
        sequence: clipboardText,
        ctrl: false, shift: false, meta: false, name: '',
      });
      return true;
    }

    return false; // 剪贴板为空
  } catch (error) {
    console.error('统一粘贴处理错误:', error);
    return false;
  }
};

// 快捷键绑定
if (key.ctrl && key.name === 'v') {
  await handleUnifiedPaste();
  return;
}
```

## 用户体验提升

### 问题解决对比

| 场景 | 旧版本 | 新版本 (v1.0.135+) |
|------|-------|-------------------|
| Windows VSCode | ❌ 无可用快捷键 | ✅ Ctrl+V 统一粘贴 |
| Windows 独立终端 | 🟡 只有 Ctrl+G | ✅ Ctrl+V + Ctrl+G |
| macOS/Linux VSCode | 🟡 只有 Ctrl+V (图像) | ✅ Ctrl+V 智能检测 |
| 文本+图像混合 | 🔴 需要分别处理 | ✅ 一键智能识别 |