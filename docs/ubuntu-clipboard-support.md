# Ubuntu 剪切板图片支持

## 概述

DeepV Code 现在完全支持在 Ubuntu/Linux 系统上处理剪切板中的图片，实现了与 Windows 和 macOS 相同的图片粘贴功能。

## 功能特性

### 支持的图片来源
1. **直接图片数据**: 通过截图工具或复制图片文件获得的真实图片数据
2. **Base64 编码图片**: `data:image/...;base64,` 格式的文本数据
3. **图片 URL**: 指向图片文件的网址（检测但暂不自动下载）

### 支持的图片格式
- PNG (推荐)
- JPEG/JPG
- GIF
- BMP
- WebP
- SVG

## 系统要求

### 必需工具
- **xclip** 或 **xsel**: 访问 X11 剪切板系统
- **ImageMagick** (可选): 提供额外的图片处理能力

### 安装命令
```bash
# Ubuntu/Debian 系统
sudo apt update
sudo apt install xclip          # 推荐
# 或者
sudo apt install xsel           # 替代方案

# 可选：安装 ImageMagick
sudo apt install imagemagick
```

## 工作原理

### 图片检测流程
1. 检查系统是否安装了 xclip 或 xsel
2. 查询剪切板中的可用 MIME 类型
3. 查找图片相关的 MIME 类型（如 `image/png`, `image/jpeg` 等）
4. 如果没有直接图片数据，检查文本内容是否包含 Base64 图片或图片 URL

### 图片保存流程
1. 按优先级尝试保存不同格式的图片：
   - PNG (最高优先级)
   - JPEG
   - GIF
   - BMP
   - WebP
   - SVG
2. 如果直接图片保存失败，尝试解析 Base64 编码的图片数据
3. 将图片保存到临时目录（`.clipboard/`）
4. 返回保存的文件路径供后续处理

## API 接口

### `clipboardHasImage(): Promise<boolean>`
检查剪切板是否包含图片或图片相关内容。

### `saveClipboardImage(targetDir?: string): Promise<string | null>`
将剪切板中的图片保存到临时文件，返回文件路径。

### `checkLinuxClipboardSupport(): Promise<{...}>`
检查 Linux 系统的剪切板支持状态和缺失的依赖。

```typescript
const support = await checkLinuxClipboardSupport();
if (!support.supported) {
  console.log('缺少依赖:', support.missingDependencies);
  console.log('安装说明:', support.installInstructions);
}
```

## 错误处理

### 常见问题及解决方案

1. **"缺少剪切板工具"错误**
   ```
   ❌ 缺少剪切板工具: 请安装 xclip 或 xsel
      Ubuntu: sudo apt install xclip
      或: sudo apt install xsel
   ```
   **解决方案**: 按提示安装 xclip 或 xsel

2. **图片检测失败**
   - 确保在图形界面环境下运行（不是纯终端）
   - 检查剪切板中确实包含图片数据
   - 尝试重新复制图片

3. **图片保存失败**
   - 检查文件系统权限
   - 确保有足够的磁盘空间
   - 查看控制台日志获取详细错误信息

## 测试工具

项目提供了几个测试脚本来验证剪切板功能：

### 基础检测测试
```bash
node test-ubuntu-clipboard.js
```

### 图片保存测试
```bash
node test-clipboard-save.js
```

### 完整功能测试
```bash
node test-clipboard-utils.js
```

## 使用示例

### 在代码中使用
```typescript
import { clipboardHasImage, saveClipboardImage } from './clipboardUtils';

// 检查是否有图片
if (await clipboardHasImage()) {
  // 保存图片
  const imagePath = await saveClipboardImage();
  if (imagePath) {
    console.log('图片已保存到:', imagePath);
    // 在对话中使用这个图片路径...
  }
}
```

### 在 DeepV Code 中使用
1. 复制任意图片到剪切板（截图、从浏览器复制等）
2. 在 DeepV Code 对话界面按 Ctrl+V
3. 图片将自动检测并插入对话中进行 AI 分析

## 兼容性

### 支持的环境
- ✅ Ubuntu 18.04+
- ✅ Debian 10+
- ✅ 其他基于 X11 的 Linux 发行版
- ❌ Wayland（部分支持，取决于兼容层）
- ❌ 纯终端环境（无图形界面）

### WSL 支持
在 WSL 环境下，系统会自动检测并使用 Windows 的剪切板支持，无需额外配置。

## 性能优化

- 图片数据直接通过管道传输，避免创建中间文件
- 使用时间戳确保文件名唯一性
- **智能清理机制**: AI 推理完成后立即清理使用过的图片文件
- **备份清理**: 定时清理 1 小时前的临时图片文件（从原来的 24 小时优化）
- 按格式优先级尝试，减少不必要的转换

### 自动清理功能
- **即时清理**: 对话完成后自动删除本次使用的剪切板图片
- **安全保护**: 只清理系统生成的临时文件，不影响用户重要文件
- **性能提升**: 避免临时文件积累，减少磁盘空间占用

## 安全考虑

- 临时图片文件存储在项目目录下，避免权限问题
- 自动清理机制防止磁盘空间浪费
- Base64 解码前验证数据格式，防止恶意内容

## 日志和调试

启用详细日志查看剪切板处理过程：
```typescript
// 控制台会显示类似以下信息：
// 🔍 [Linux剪贴板] 使用工具: xclip
// 🔍 [Linux剪贴板] 临时目录: /path/to/.clipboard
// 🔍 [Linux剪贴板] 可用类型: image/png, text/html, ...
// ✅ [Linux剪贴板] 成功保存图片: /path/to/.clipboard/clipboard-123456789.png
```

## 未来改进

- [ ] 支持从图片 URL 自动下载
- [ ] 增加对 Wayland 的原生支持
- [ ] 支持更多图片格式（HEIC、AVIF 等）
- [ ] 图片压缩和优化选项
- [ ] 批量图片处理支持