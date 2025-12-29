/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ⚠️ Token限制配置从云端API获取，支持客户端准确计算
 * 
 * 更新说明：使用云端API的maxToken字段获取准确的模型token限制
 * 
 * 🎯 新设计：
 * - 优先从云端API获取准确的模型token限制（maxToken字段）
 * - 'auto'模型使用合理的默认值
 * - 保留兼容性降级处理
 */

import type { Config } from '../config/config.js';

type Model = string;
type TokenCount = number;

// auto模式的默认配置（与CLI中保持一致）
const AUTO_MODE_CONFIG = {
  name: 'auto',
  displayName: 'Auto',
  creditsPerRequest: 6.0,
  available: true,
  maxToken: 200000,
  highVolumeThreshold: 200000,
  highVolumeCredits: 12.0
};

/**
 * 从Config获取准确的Token限制
 * 优先从云端模型信息中获取maxToken，查询不到时使用AUTO_MODE_CONFIG
 */
export function tokenLimit(model: Model, config?: Config): TokenCount {
  // 如果有config，优先从云端模型信息中查询
  if (config) {
    const cloudModelInfo = config.getCloudModelInfo(model);
    if (cloudModelInfo) {
      return cloudModelInfo.maxToken;
    }
  }
  return AUTO_MODE_CONFIG.maxToken;
}