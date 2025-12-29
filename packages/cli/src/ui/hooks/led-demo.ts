/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * LED动态高亮长度演示
 * 这个文件展示了不同长度文本的动态高亮效果
 */

// 示例文本，展示不同长度下的高亮效果
export const LED_DEMO_TEXTS = {
  // 短文本 (2字符) - 30% ≈ 1，但最小值2，所以高亮长度=2
  veryShort: 'Hi',
  
  // 中等文本 (11字符) - 30% ≈ 3，高亮长度=3
  medium: 'Hello World',
  
  // 长文本 (35字符) - 30% ≈ 11，高亮长度=11
  long: 'Processing your request, please wait...',
  
  // 超长文本 (74字符) - 30% ≈ 22，高亮长度=22
  veryLong: 'This is a much longer text for testing dynamic highlight length calculation',
  
  // 中文文本 (20字符) - 30% = 6，高亮长度=6
  chinese: '正在处理您的请求，请稍等...',
  
  // 中英文混合 (42字符) - 30% ≈ 13，高亮长度=13
  mixed: 'Loading knowledge base 正在加载知识库，请稍等...'
};

/**
 * 计算给定文本在不同highlightRatio下的高亮长度
 */
export function calculateHighlightLengthDemo(text: string, ratio: number = 0.3): number {
  const dynamicLength = Math.round(text.length * ratio);
  return Math.max(2, Math.min(dynamicLength, Math.floor(text.length / 2)));
}

/**
 * 演示所有示例文本的高亮效果
 */
export function demoAllTexts() {
  console.log('LED动态高亮长度演示：\n');
  
  Object.entries(LED_DEMO_TEXTS).forEach(([key, text]) => {
    const highlightLength = calculateHighlightLengthDemo(text);
    const percentage = ((highlightLength / text.length) * 100).toFixed(1);
    
    console.log(`${key}:`);
    console.log(`  文本: "${text}"`);
    console.log(`  长度: ${text.length} 字符`);
    console.log(`  高亮长度: ${highlightLength} 字符 (${percentage}%)`);
    console.log('');
  });
}