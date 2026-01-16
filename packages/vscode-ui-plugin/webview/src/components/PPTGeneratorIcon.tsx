/**
 * PPT Generator Icon Component
 * PPT图标组件，用于PPT生成功能入口
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React from 'react';

interface PPTGeneratorIconProps {
  size?: number;
  className?: string;
  onClick?: () => void;
  title?: string;
}

export const PPTGeneratorIcon: React.FC<PPTGeneratorIconProps> = ({
  size = 18,
  className = '',
  onClick,
  title
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
      className={`ppt-generator-icon ${className}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      aria-label={title}
    >
      {/* 圆角矩形背景 */}
      <rect
        x="1"
        y="3"
        width="22"
        height="18"
        rx="3"
        fill="#2196F3"
      />
      {/* 内部浅色区域 */}
      <rect
        x="2.5"
        y="4.5"
        width="19"
        height="15"
        rx="2"
        fill="#E3F2FD"
      />
      {/* PPT 粗体文字 */}
      <text
        x="12"
        y="15.5"
        textAnchor="middle"
        fontSize="9"
        fontWeight="800"
        fontFamily="Arial Black, Arial, sans-serif"
        fill="#1565C0"
        letterSpacing="-0.5"
      >
        PPT
      </text>
      {/* 底部装饰条 */}
      <rect
        x="5"
        y="17"
        width="14"
        height="1.5"
        rx="0.75"
        fill="#1976D2"
        opacity="0.6"
      />
    </svg>
  );
};

export default PPTGeneratorIcon;
