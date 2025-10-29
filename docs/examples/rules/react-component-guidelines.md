---
title: React 组件开发规范
type: context_aware
priority: high
description: React 组件的开发规范和最佳实践
enabled: true
tags:
  - react
  - components
  - frontend
triggers:
  fileExtensions:
    - .tsx
    - .jsx
  pathPatterns:
    - src/components/**
    - src/pages/**
    - packages/*/src/components/**
    - webview/src/components/**
---

# React 组件开发规范

## 组件结构

### 函数组件模板

✅ **推荐的组件结构**:

```typescript
import React, { useState, useEffect, useCallback } from 'react';
import './MyComponent.css';

interface MyComponentProps {
  title: string;
  onSave?: (data: Data) => void;
  className?: string;
}

export const MyComponent: React.FC<MyComponentProps> = ({
  title,
  onSave,
  className
}) => {
  // 🎯 1. State 声明
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);

  // 🎯 2. Refs
  const inputRef = useRef<HTMLInputElement>(null);

  // 🎯 3. 自定义 Hooks
  const { user } = useAuth();

  // 🎯 4. useEffect（副作用）
  useEffect(() => {
    loadData();
    return () => cleanup();
  }, []);

  // 🎯 5. 事件处理函数
  const handleSave = useCallback(() => {
    if (data) {
      onSave?.(data);
    }
  }, [data, onSave]);

  // 🎯 6. 辅助函数
  const loadData = async () => {
    setLoading(true);
    try {
      const result = await fetchData();
      setData(result);
    } finally {
      setLoading(false);
    }
  };

  // 🎯 7. 条件渲染
  if (loading) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <EmptyState />;
  }

  // 🎯 8. 主渲染
  return (
    <div className={`my-component ${className || ''}`}>
      <h2>{title}</h2>
      <DataDisplay data={data} />
      <button onClick={handleSave}>Save</button>
    </div>
  );
};
```

## Props 定义

### 命名规范

- Props 接口命名：`{ComponentName}Props`
- 可选 props 使用 `?`
- 回调函数以 `on` 开头

```typescript
interface UserCardProps {
  user: User;
  editable?: boolean;
  onEdit?: (user: User) => void;
  onDelete?: (userId: string) => void;
  className?: string;
  style?: React.CSSProperties;
}
```

### 默认值

使用解构赋值设置默认值：

```typescript
export const UserCard: React.FC<UserCardProps> = ({
  user,
  editable = false,
  onEdit,
  className = '',
}) => {
  // ...
};
```

### Children Props

正确处理 children：

```typescript
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
};
```

## Hooks 使用

### useState

- 使用描述性的状态名称
- 复杂状态使用 `useReducer`

```typescript
// ✅ 好的命名
const [isLoading, setIsLoading] = useState(false);
const [userData, setUserData] = useState<User | null>(null);
const [formErrors, setFormErrors] = useState<Record<string, string>>({});

// ❌ 不好的命名
const [flag, setFlag] = useState(false);
const [data, setData] = useState(null);
```

### useEffect

- 明确依赖项数组
- 返回清理函数（如果需要）
- 拆分不相关的副作用

✅ **推荐**:
```typescript
// 独立的副作用
useEffect(() => {
  document.title = `User: ${user.name}`;
}, [user.name]);

useEffect(() => {
  const timer = setInterval(() => {
    checkStatus();
  }, 5000);

  return () => clearInterval(timer);
}, []);
```

❌ **不推荐**:
```typescript
// 混合多个不相关的副作用
useEffect(() => {
  document.title = `User: ${user.name}`;
  const timer = setInterval(() => checkStatus(), 5000);
  return () => clearInterval(timer);
}, [user.name]);
```

### useCallback 和 useMemo

仅在必要时使用：

```typescript
// ✅ 好的用法 - 传递给子组件的回调
const handleClick = useCallback(() => {
  processData(data);
}, [data]);

<ExpensiveChild onClick={handleClick} />

// ✅ 好的用法 - 昂贵的计算
const sortedItems = useMemo(
  () => items.sort((a, b) => heavyComparison(a, b)),
  [items]
);

// ❌ 不必要的优化
const simpleValue = useMemo(() => x + y, [x, y]);
```

### 自定义 Hooks

提取可复用逻辑到自定义 Hooks：

```typescript
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue] as const;
}

// 使用
const [user, setUser] = useLocalStorage<User>('user', defaultUser);
```

## 条件渲染

### 短路运算符

```typescript
// ✅ 简单条件
{isLoggedIn && <UserProfile />}
{error && <ErrorMessage error={error} />}

// ⚠️ 注意：0 和空字符串会被渲染
{count && <span>{count} items</span>}  // 当 count=0 时会显示 "0"

// ✅ 正确做法
{count > 0 && <span>{count} items</span>}
```

### 三元运算符

```typescript
// ✅ 简单二选一
{isLoading ? <Spinner /> : <Content />}

// ❌ 嵌套过深
{isLoading ? (
  <Spinner />
) : hasError ? (
  <Error />
) : hasData ? (
  <Content data={data} />
) : (
  <Empty />
)}

// ✅ 提前返回或使用辅助函数
const renderContent = () => {
  if (isLoading) return <Spinner />;
  if (hasError) return <Error />;
  if (!hasData) return <Empty />;
  return <Content data={data} />;
};

return <div>{renderContent()}</div>;
```

## 列表渲染

### Key 的使用

```typescript
// ✅ 使用稳定的唯一 ID
{users.map(user => (
  <UserCard key={user.id} user={user} />
))}

// ❌ 使用索引（除非列表静态且不会重排序）
{users.map((user, index) => (
  <UserCard key={index} user={user} />
))}
```

### 性能优化

```typescript
// ✅ 使用 React.memo 避免不必要的重渲染
export const UserCard = React.memo<UserCardProps>(({ user, onEdit }) => {
  return (
    <div className="user-card">
      <h3>{user.name}</h3>
      <button onClick={() => onEdit(user)}>Edit</button>
    </div>
  );
});

// 自定义比较函数
export const UserCard = React.memo<UserCardProps>(
  ({ user, onEdit }) => { /* ... */ },
  (prevProps, nextProps) => {
    return prevProps.user.id === nextProps.user.id;
  }
);
```

## 样式

### CSS Modules

优先使用 CSS Modules：

```typescript
import styles from './MyComponent.module.css';

export const MyComponent: React.FC = () => {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Title</h2>
    </div>
  );
};
```

### 条件类名

使用 `classnames` 库或模板字符串：

```typescript
import classNames from 'classnames';

const buttonClass = classNames(
  styles.button,
  {
    [styles.active]: isActive,
    [styles.disabled]: isDisabled,
  },
  className
);

// 或使用模板字符串
const buttonClass = `${styles.button} ${isActive ? styles.active : ''} ${className || ''}`;
```

## 表单处理

### 受控组件

```typescript
export const UserForm: React.FC<UserFormProps> = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        name="name"
        value={formData.name}
        onChange={handleChange}
        placeholder="Name"
      />
      <input
        name="email"
        type="email"
        value={formData.email}
        onChange={handleChange}
        placeholder="Email"
      />
      <button type="submit">Submit</button>
    </form>
  );
};
```

### 表单验证

```typescript
interface FormErrors {
  [key: string]: string;
}

export const UserForm: React.FC = () => {
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [errors, setErrors] = useState<FormErrors>({});

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.includes('@')) {
      newErrors.email = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      // Submit form
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <input name="name" value={formData.name} onChange={handleChange} />
        {errors.name && <span className="error">{errors.name}</span>}
      </div>
      {/* ... */}
    </form>
  );
};
```

## 错误处理

### Error Boundary

创建错误边界组件：

```typescript
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-fallback">
          <h2>Something went wrong</h2>
          <p>{this.state.error?.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

// 使用
<ErrorBoundary fallback={<ErrorFallback />}>
  <MyComponent />
</ErrorBoundary>
```

## 测试

### 组件测试模板

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { UserCard } from './UserCard';

describe('UserCard', () => {
  const mockUser = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
  };

  it('renders user information', () => {
    render(<UserCard user={mockUser} />);

    expect(screen.getByText(mockUser.name)).toBeInTheDocument();
    expect(screen.getByText(mockUser.email)).toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', () => {
    const handleEdit = jest.fn();
    render(<UserCard user={mockUser} onEdit={handleEdit} />);

    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    expect(handleEdit).toHaveBeenCalledWith(mockUser);
  });
});
```

## 可访问性 (a11y)

### 语义化 HTML

```typescript
// ✅ 好的做法
<button onClick={handleClick}>Click me</button>
<nav><ul><li><a href="/home">Home</a></li></ul></nav>

// ❌ 不好的做法
<div onClick={handleClick}>Click me</div>
<div className="nav"><div className="menu">...</div></div>
```

### ARIA 属性

```typescript
<button
  onClick={handleToggle}
  aria-label="Toggle menu"
  aria-expanded={isOpen}
  aria-controls="menu-items"
>
  Menu
</button>

<div id="menu-items" role="menu" hidden={!isOpen}>
  {/* Menu items */}
</div>
```

---

遵循这些 React 组件开发规范可以提高代码质量、可维护性和团队协作效率。
