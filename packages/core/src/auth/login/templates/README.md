# 认证页面模板管理

本目录包含认证服务器使用的 HTML 模板和相关管理代码。

## 目录结构

```
templates/
├── index.ts              # 模板管理类
├── authSelectPage.html   # 认证选择页面模板
└── README.md            # 说明文档
```

## 使用方式

### 模板管理类 (`index.ts`)

`AuthTemplates` 类提供了统一的模板管理接口：

```typescript
import { AuthTemplates } from './templates/index.js';

// 获取认证选择页面
const selectPageHtml = AuthTemplates.getAuthSelectPage();

// 获取成功页面
const feishuSuccessHtml = AuthTemplates.getFeishuSuccessPage();
const deepvlabSuccessHtml = AuthTemplates.getDeepvlabSuccessPage();

// 获取错误页面
const errorHtml = AuthTemplates.getErrorPage('错误消息');
```

### 主要功能

1. **模板缓存**: 自动缓存已加载的模板文件，提高性能
2. **降级处理**: 如果模板文件加载失败，提供基本的 HTML 替代方案
3. **国际化支持**: 所有模板都支持中英文国际化
4. **统一样式**: 所有页面使用一致的设计语言和样式

### 模板特性

- **响应式设计**: 适配桌面和移动设备
- **现代UI**: 使用 backdrop-filter、渐变、动画等现代 CSS 特性
- **自动关闭**: 成功页面会自动尝试关闭浏览器标签页
- **错误处理**: 提供友好的错误信息展示

## 维护指南

### 修改模板

1. **修改认证选择页面**: 直接编辑 `authSelectPage.html`
2. **修改成功/错误页面**: 在 `index.ts` 中的对应方法中修改
3. **添加新模板**: 
   - 在 `templates/` 目录下创建新的 HTML 文件
   - 在 `AuthTemplates` 类中添加对应的加载方法

### 样式约定

- 使用 CSS 变量便于主题定制
- 遵循 Material Design 设计原则
- 保持一致的颜色方案和间距
- 确保无障碍访问支持

### 国际化

模板使用 `data-i18n` 属性和 JavaScript 实现客户端国际化：

```html
<h1 data-i18n="auth.page.title">Choose Authentication</h1>
```

对应的翻译在页面的 JavaScript 中定义。

## 性能考虑

- 模板文件被缓存在内存中，避免重复读取
- CSS 使用高效的选择器和布局方式
- JavaScript 代码经过优化，减少 DOM 操作

## 安全性

- 所有模板都包含适当的 CSP 头信息
- 用户输入经过适当的转义处理
- 页面自动关闭机制防止敏感信息泄露