/**
 * Setting Item Component
 * 设置项基础组件
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React from 'react';
import './SettingItem.css';

// =============================================================================
// 基础设置项接口
// =============================================================================

interface BaseSettingItemProps {
  /** 设置项标识 */
  id: string;

  /** 设置项标签 */
  label: string;

  /** 设置项描述 */
  description?: string;

  /** 是否禁用 */
  disabled?: boolean;

  /** 是否必需 */
  required?: boolean;

  /** 自定义类名 */
  className?: string;

  /** 子元素 */
  children?: React.ReactNode;
}

// =============================================================================
// 布尔值设置项
// =============================================================================

interface BooleanSettingItemProps extends BaseSettingItemProps {
  /** 当前值 */
  value: boolean;

  /** 值变化回调 */
  onChange: (value: boolean) => void;
}

export const BooleanSettingItem: React.FC<BooleanSettingItemProps> = ({
  id,
  label,
  description,
  value,
  onChange,
  disabled = false,
  required = false,
  className = ''
}) => {
  return (
    <div className={`setting-item setting-item--boolean ${className}`}>
      <div className="setting-item__content">
        <div className="setting-item__header">
          <label htmlFor={id} className="setting-item__label">
            {label}
            {required && <span className="setting-item__required">*</span>}
          </label>
          <div className="setting-item__control">
            <label className="setting-item__switch">
              <input
                id={id}
                type="checkbox"
                checked={value}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
                className="setting-item__switch-input"
              />
              <span className="setting-item__switch-slider"></span>
            </label>
          </div>
        </div>
        {description && (
          <p className="setting-item__description">{description}</p>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// 字符串设置项
// =============================================================================

interface StringSettingItemProps extends BaseSettingItemProps {
  /** 当前值 */
  value: string;

  /** 值变化回调 */
  onChange: (value: string) => void;

  /** 占位符 */
  placeholder?: string;

  /** 输入类型 */
  type?: 'text' | 'password' | 'email' | 'url';

  /** 验证函数 */
  validation?: (value: string) => string | null;
}

export const StringSettingItem: React.FC<StringSettingItemProps> = ({
  id,
  label,
  description,
  value,
  onChange,
  placeholder,
  type = 'text',
  validation,
  disabled = false,
  required = false,
  className = ''
}) => {
  const [error, setError] = React.useState<string | null>(null);

  const handleChange = (newValue: string) => {
    if (validation) {
      const validationError = validation(newValue);
      setError(validationError);
    }
    onChange(newValue);
  };

  return (
    <div className={`setting-item setting-item--string ${className}`}>
      <div className="setting-item__content">
        <div className="setting-item__header">
          <label htmlFor={id} className="setting-item__label">
            {label}
            {required && <span className="setting-item__required">*</span>}
          </label>
        </div>
        <div className="setting-item__control">
          <input
            id={id}
            type={type}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={`setting-item__input ${error ? 'setting-item__input--error' : ''}`}
          />
        </div>
        {error && (
          <p className="setting-item__error">{error}</p>
        )}
        {description && !error && (
          <p className="setting-item__description">{description}</p>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// 选择设置项
// =============================================================================

interface SelectOption {
  label: string;
  value: string;
  description?: string;
}

interface SelectSettingItemProps extends BaseSettingItemProps {
  /** 当前值 */
  value: string;

  /** 值变化回调 */
  onChange: (value: string) => void;

  /** 选项列表 */
  options: SelectOption[];
}

export const SelectSettingItem: React.FC<SelectSettingItemProps> = ({
  id,
  label,
  description,
  value,
  onChange,
  options,
  disabled = false,
  required = false,
  className = ''
}) => {
  return (
    <div className={`setting-item setting-item--select ${className}`}>
      <div className="setting-item__content">
        <div className="setting-item__header">
          <label htmlFor={id} className="setting-item__label">
            {label}
            {required && <span className="setting-item__required">*</span>}
          </label>
        </div>
        <div className="setting-item__control">
          <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="setting-item__select"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {description && (
          <p className="setting-item__description">{description}</p>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// 数字设置项
// =============================================================================

interface NumberSettingItemProps extends BaseSettingItemProps {
  /** 当前值 */
  value: number;

  /** 值变化回调 */
  onChange: (value: number) => void;

  /** 最小值 */
  min?: number;

  /** 最大值 */
  max?: number;

  /** 步长 */
  step?: number;

  /** 单位 */
  unit?: string;
}

export const NumberSettingItem: React.FC<NumberSettingItemProps> = ({
  id,
  label,
  description,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
  required = false,
  className = ''
}) => {
  return (
    <div className={`setting-item setting-item--number ${className}`}>
      <div className="setting-item__content">
        <div className="setting-item__header">
          <label htmlFor={id} className="setting-item__label">
            {label}
            {required && <span className="setting-item__required">*</span>}
          </label>
        </div>
        <div className="setting-item__control">
          <input
            id={id}
            type="number"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className="setting-item__number-input"
          />
          {unit && <span className="setting-item__unit">{unit}</span>}
        </div>
        {description && (
          <p className="setting-item__description">{description}</p>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// 设置组
// =============================================================================

interface SettingGroupProps {
  /** 组标题 */
  title: string;

  /** 组描述 */
  description?: string;

  /** 组图标 */
  icon?: string;

  /** 是否可折叠 */
  collapsible?: boolean;

  /** 初始是否展开 */
  defaultExpanded?: boolean;

  /** 子元素 */
  children: React.ReactNode;

  /** 自定义类名 */
  className?: string;
}

export const SettingGroup: React.FC<SettingGroupProps> = ({
  title,
  description,
  icon,
  collapsible = false,
  defaultExpanded = true,
  children,
  className = ''
}) => {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  const toggleExpanded = () => {
    if (collapsible) {
      setExpanded(!expanded);
    }
  };

  return (
    <div className={`setting-group ${className}`}>
      <div
        className={`setting-group__header ${collapsible ? 'setting-group__header--clickable' : ''}`}
        onClick={toggleExpanded}
      >
        {icon && <span className="setting-group__icon">{icon}</span>}
        <h3 className="setting-group__title">{title}</h3>
        {collapsible && (
          <span className={`setting-group__toggle ${expanded ? 'setting-group__toggle--expanded' : ''}`}>
            ▼
          </span>
        )}
      </div>

      {description && (
        <p className="setting-group__description">{description}</p>
      )}

      {expanded && (
        <div className="setting-group__content">
          {children}
        </div>
      )}
    </div>
  );
};