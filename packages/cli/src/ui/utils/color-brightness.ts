/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 调整颜色亮度的工具函数
 * 支持hex颜色码和CSS颜色名称
 */

/**
 * 将hex颜色转换为RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // 移除#号并处理3位或6位hex
  const cleanHex = hex.replace('#', '');

  if (cleanHex.length === 3) {
    // 3位hex：#RGB -> #RRGGBB
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    return { r, g, b };
  } else if (cleanHex.length === 6) {
    // 6位hex：#RRGGBB
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return { r, g, b };
  }

  return null;
}

/**
 * 将RGB转换为hex颜色
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 调整颜色亮度
 * @param color hex颜色码 (如 "#3B82F6") 或 CSS颜色名称
 * @param factor 亮度调整因子，0-1之间（0最暗，1最亮）
 * @returns 调整后的颜色
 */
export function adjustBrightness(color: string, factor: number): string {
  // 确保factor在合理范围内
  factor = Math.max(0, Math.min(1, factor));

  // 如果是hex颜色
  if (color.startsWith('#')) {
    const rgb = hexToRgb(color);
    if (rgb) {
      // 调整亮度：将RGB值乘以因子
      const adjustedR = rgb.r * factor;
      const adjustedG = rgb.g * factor;
      const adjustedB = rgb.b * factor;

      return rgbToHex(adjustedR, adjustedG, adjustedB);
    }
  }

  // 对于CSS颜色名称，我们可以添加一些常见的映射
  // 或者直接返回原色（在终端中，某些颜色名称可能不支持亮度调整）
  const cssColorMap: Record<string, string> = {
    // 一些常见颜色的暗淡版本映射
    'blue': factor < 0.7 ? '#1e3a8a' : 'blue',
    'green': factor < 0.7 ? '#166534' : 'green',
    'red': factor < 0.7 ? '#991b1b' : 'red',
    'yellow': factor < 0.7 ? '#a16207' : 'yellow',
    'purple': factor < 0.7 ? '#7c2d12' : 'purple',
    'cyan': factor < 0.7 ? '#155e75' : 'cyan',
    'orange': factor < 0.7 ? '#c2410c' : 'orange',
    'gray': factor < 0.7 ? '#374151' : 'gray',
    'grey': factor < 0.7 ? '#374151' : 'grey',
  };

  return cssColorMap[color.toLowerCase()] || color;
}

/**
 * 为LED效果创建暗淡和高亮颜色对
 * @param originalColor 原始颜色
 * @returns 包含dim和bright颜色的对象
 */
export function createLEDColorPair(originalColor: string) {
  return {
    dim: adjustBrightness(originalColor, 0.4), // 40%亮度的暗淡版本
    bright: originalColor // 原始亮度
  };
}

/**
 * 为渐变跑马灯效果创建三级颜色
 * @param originalColor 原始颜色（已废弃，现在使用固定的精细渐变配色）
 * @returns 包含dim、medium、bright三种颜色的对象
 */
export function createGradientColorSet(originalColor: string) {
  // 🎨 使用精心设计的固定配色方案，实现更细腻的跑马灯渐变效果
  return {
    dim: '#666666',      // 文本默认色 - 暗灰色背景
    medium: '#CCCCCC',   // 渐变过渡色 - 第1和第7字符
    bright: '#F2F2F2'    // 高亮中心色 - 第2-6字符（接近白色）
  };
}