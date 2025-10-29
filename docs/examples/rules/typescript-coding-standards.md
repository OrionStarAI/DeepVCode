---
title: TypeScript 编码规范
type: context_aware
priority: high
description: TypeScript 项目的编码标准和最佳实践
enabled: true
tags:
  - typescript
  - coding-style
  - best-practices
triggers:
  fileExtensions:
    - .ts
    - .tsx
  pathPatterns:
    - src/**
    - packages/*/src/**
  languages:
    - typescript
---

# TypeScript 编码规范

## 代码风格

### 缩进和空格

- 使用 2 空格缩进
- 行尾不要有空格
- 文件末尾保留一个空行

### 命名约定

- **变量和函数**: camelCase
  ```typescript
  const userName = 'John';
  function getUserInfo() {}
  ```

- **类和接口**: PascalCase
  ```typescript
  class UserManager {}
  interface UserProfile {}
  ```

- **常量**: UPPER_SNAKE_CASE
  ```typescript
  const MAX_RETRY_COUNT = 3;
  const API_BASE_URL = 'https://api.example.com';
  ```

- **类型别名**: PascalCase
  ```typescript
  type UserId = string;
  type UserCallback = (user: User) => void;
  ```

### 引号和分号

- 字符串优先使用单引号 `'`
- 模板字符串使用反引号 `` ` ``
- 始终使用分号结尾

## 类型注解

### 函数参数和返回值

✅ **推荐**:
```typescript
function greet(name: string): string {
  return `Hello, ${name}!`;
}

const add = (a: number, b: number): number => a + b;
```

❌ **不推荐**:
```typescript
function greet(name) {
  return `Hello, ${name}!`;
}

const add = (a, b) => a + b;
```

### 接口 vs 类型别名

- 优先使用接口定义对象结构
- 使用类型别名定义联合类型、交叉类型等

✅ **推荐**:
```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

type Status = 'pending' | 'active' | 'inactive';
type Result<T> = { success: true; data: T } | { success: false; error: string };
```

### 避免 `any`

尽量避免使用 `any` 类型，使用更具体的类型或 `unknown`:

✅ **推荐**:
```typescript
function processData(data: unknown): void {
  if (typeof data === 'string') {
    console.log(data.toUpperCase());
  }
}
```

❌ **不推荐**:
```typescript
function processData(data: any): void {
  console.log(data.toUpperCase());
}
```

## 最佳实践

### 变量声明

- 优先使用 `const`
- 需要重新赋值时使用 `let`
- 永远不要使用 `var`

```typescript
const MAX_SIZE = 100;  // 常量
let counter = 0;       // 可变
```

### 函数

- 优先使用箭头函数（除非需要 `this` 绑定）
- 保持函数简短和单一职责

✅ **推荐**:
```typescript
const users = data.map(item => transformUser(item));

class Component {
  handleClick = () => {
    // 箭头函数自动绑定 this
    this.setState({ clicked: true });
  };
}
```

### 解构

使用解构语法简化代码：

```typescript
// 对象解构
const { name, email } = user;

// 数组解构
const [first, second] = items;

// 函数参数解构
function greet({ name, age }: User) {
  console.log(`${name} is ${age} years old`);
}
```

### 可选链和空值合并

使用现代 TypeScript 特性：

```typescript
// 可选链
const userName = user?.profile?.name;

// 空值合并
const displayName = userName ?? 'Guest';
```

### 异步处理

优先使用 `async/await` 而非 Promise 链：

✅ **推荐**:
```typescript
async function fetchUserData(userId: string): Promise<User> {
  try {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch user');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching user:', error);
    throw error;
  }
}
```

### 类型守卫

使用类型守卫确保类型安全：

```typescript
function isUser(obj: unknown): obj is User {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj
  );
}

if (isUser(data)) {
  // TypeScript 知道 data 是 User 类型
  console.log(data.name);
}
```

## 注释和文档

### JSDoc 注释

为公共 API 添加 JSDoc 注释：

```typescript
/**
 * 计算两个数的和
 * @param a - 第一个数字
 * @param b - 第二个数字
 * @returns 两数之和
 */
function add(a: number, b: number): number {
  return a + b;
}
```

### 行内注释

仅在必要时添加注释，解释"为什么"而非"是什么"：

```typescript
// ✅ 好的注释 - 解释原因
// 使用 setTimeout 避免阻塞 UI 线程
setTimeout(() => processLargeData(data), 0);

// ❌ 不好的注释 - 重复代码
// 给 x 加 1
x = x + 1;
```

## 文件组织

### 导入顺序

1. 第三方库
2. 内部模块
3. 相对路径导入
4. 类型导入

```typescript
// 第三方库
import React from 'react';
import { useEffect, useState } from 'react';

// 内部模块
import { apiClient } from '@/api';
import { formatDate } from '@/utils';

// 相对路径
import { UserCard } from './components/UserCard';
import type { User } from './types';
```

### 导出

优先使用命名导出而非默认导出：

✅ **推荐**:
```typescript
export function formatDate(date: Date): string { }
export class UserManager { }
```

❌ **不推荐**（除非组件）:
```typescript
export default function formatDate(date: Date): string { }
```

## 错误处理

### 自定义错误

创建有意义的错误类型：

```typescript
class ValidationError extends Error {
  constructor(
    message: string,
    public field: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

throw new ValidationError('Invalid email format', 'email');
```

### 错误边界

使用 try-catch 适当处理错误：

```typescript
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  if (error instanceof ValidationError) {
    // 处理验证错误
    showFieldError(error.field, error.message);
  } else {
    // 处理其他错误
    logError(error);
    showGenericError();
  }
  throw error; // 重新抛出或处理
}
```

## 性能优化

### 避免不必要的重新渲染（React）

```typescript
// 使用 React.memo
export const UserCard = React.memo<UserCardProps>(({ user }) => {
  return <div>{user.name}</div>;
});

// 使用 useCallback 和 useMemo
const handleClick = useCallback(() => {
  processUser(user);
}, [user]);

const sortedUsers = useMemo(
  () => users.sort((a, b) => a.name.localeCompare(b.name)),
  [users]
);
```

### 延迟加载

对大型模块使用动态导入：

```typescript
async function loadFeature() {
  const module = await import('./heavy-feature');
  return module.default;
}
```

---

遵循这些规范可以确保代码的一致性、可维护性和可读性。
