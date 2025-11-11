/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 模糊匹配结果
 */
export interface FuzzyMatchResult {
  /** 是否匹配 */
  matched: boolean;
  /** 匹配得分（越高越相关） */
  score: number;
  /** 匹配位置索引数组 */
  indices: number[];
}

/**
 * 高亮信息
 */
export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/**
 * 智能模糊匹配算法
 * 支持真正的模糊匹配（字符可以跳过），不区分大小写
 *
 * 评分规则（越高越好）：
 * - 精确匹配（完全相同）：1000分
 * - 前缀匹配（以搜索词开头）：500分
 * - 连续子串匹配：200分 + 位置加分
 * - 模糊匹配（字符顺序匹配，可跳过）：100-199分，根据紧密度调整
 * - 位置加分：越靠前匹配得分越高
 *
 * @param text 要搜索的文本（如文件路径或命令名）
 * @param query 搜索关键词
 * @returns 匹配结果
 */
export function fuzzyMatch(text: string, query: string): FuzzyMatchResult {
  if (!query) {
    return { matched: true, score: 0, indices: [] };
  }

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // 1. 精确匹配
  if (lowerText === lowerQuery) {
    return {
      matched: true,
      score: 1000,
      indices: Array.from({ length: text.length }, (_, i) => i),
    };
  }

  // 2. 前缀匹配
  if (lowerText.startsWith(lowerQuery)) {
    return {
      matched: true,
      score: 500,
      indices: Array.from({ length: query.length }, (_, i) => i),
    };
  }

  // 3. 连续子串匹配
  const matchIndex = lowerText.indexOf(lowerQuery);
  if (matchIndex !== -1) {
    // 基础分数
    let score = 200;

    // 位置加分：越靠前分数越高
    const positionBonus = Math.max(0, 100 - matchIndex * 2);
    score += positionBonus;

    // 文件名匹配加分
    const lastSlash = text.lastIndexOf('/');
    const fileName = lastSlash !== -1 ? text.substring(lastSlash + 1) : text;
    const fileNameMatch = fileName.toLowerCase().indexOf(lowerQuery);

    if (fileNameMatch !== -1) {
      // 在文件名中匹配，额外加分
      score += 300;

      // 文件名开头匹配，再加分
      if (fileNameMatch === 0) {
        score += 100;
      }
    }

    const indices = Array.from(
      { length: query.length },
      (_, i) => matchIndex + i,
    );

    return { matched: true, score, indices };
  }

  // 4. 模糊匹配：尝试按顺序匹配字符，允许跳过
  const fuzzyResult = fuzzyMatchCharacters(lowerText, lowerQuery);
  if (fuzzyResult.matched) {
    // 基础分数：比前缀匹配低，但高于不匹配
    // 根据匹配的紧密度调整分数
    const gapPenalty = fuzzyResult.gaps * 10; // 每个间隙扣 10 分
    let score = Math.max(50, 150 - gapPenalty); // 最少 50 分

    // 如果从头开始匹配，额外加分
    if (lowerText.charCodeAt(0) === lowerQuery.charCodeAt(0)) {
      score += 50;
    }

    return {
      matched: true,
      score,
      indices: fuzzyResult.indices,
    };
  }

  // 5. 不匹配
  return { matched: false, score: 0, indices: [] };
}

/**
 * 模糊字符匹配（允许跳过字符）
 * 返回匹配的字符位置和匹配的紧密度（gap数量）
 *
 * @param text 要搜索的文本
 * @param query 搜索关键词
 * @returns 匹配结果及间隙数
 */
function fuzzyMatchCharacters(
  text: string,
  query: string,
): { matched: boolean; indices: number[]; gaps: number } {
  const indices: number[] = [];
  let textIdx = 0;
  let queryIdx = 0;
  let lastMatchIdx = -1;

  while (queryIdx < query.length && textIdx < text.length) {
    if (text[textIdx] === query[queryIdx]) {
      indices.push(textIdx);
      lastMatchIdx = textIdx;
      queryIdx++;
    }
    textIdx++;
  }

  if (queryIdx === query.length) {
    // 匹配成功，计算间隙数（相邻匹配字符之间的距离 - 1）
    let gaps = 0;
    for (let i = 1; i < indices.length; i++) {
      const gap = indices[i] - indices[i - 1] - 1;
      if (gap > 0) {
        gaps += gap;
      }
    }

    return { matched: true, indices, gaps };
  }

  return { matched: false, indices: [], gaps: 0 };
}

/**
 * 对文件列表进行智能排序
 *
 * @param items 文件列表
 * @param query 搜索关键词
 * @param getText 从item中提取文本的函数
 * @returns 排序后的文件列表
 */
export function sortByRelevance<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
): T[] {
  if (!query) {
    return items;
  }

  const itemsWithScore = items
    .map((item) => {
      const text = getText(item);
      const matchResult = fuzzyMatch(text, query);
      return { item, score: matchResult.score, matched: matchResult.matched };
    })
    .filter((x) => x.matched);

  // 按分数降序排列
  itemsWithScore.sort((a, b) => b.score - a.score);

  return itemsWithScore.map((x) => x.item);
}

/**
 * 获取高亮片段
 * 将文本按匹配位置分割为高亮和非高亮部分
 *
 * @param text 原始文本
 * @param query 搜索关键词
 * @returns 高亮片段数组
 */
export function getHighlightSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  if (!query) {
    return [{ text, highlighted: false }];
  }

  const matchResult = fuzzyMatch(text, query);
  if (!matchResult.matched || matchResult.indices.length === 0) {
    return [{ text, highlighted: false }];
  }

  const segments: HighlightSegment[] = [];
  let lastIndex = 0;

  // 假设 indices 是连续的（因为我们匹配的是连续子串）
  const startIndex = matchResult.indices[0];
  const endIndex = matchResult.indices[matchResult.indices.length - 1] + 1;

  // 匹配前的部分
  if (startIndex > 0) {
    segments.push({
      text: text.substring(0, startIndex),
      highlighted: false,
    });
  }

  // 匹配的部分
  segments.push({
    text: text.substring(startIndex, endIndex),
    highlighted: true,
  });

  // 匹配后的部分
  if (endIndex < text.length) {
    segments.push({
      text: text.substring(endIndex),
      highlighted: false,
    });
  }

  return segments;
}
