/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SubAgent 模块导出
 * SubAgent module exports
 */

// Types
export * from './types.js';

// Built-in SubAgents
export {
  BUILT_IN_SUBAGENTS,
  getBuiltInSubAgentIds,
  getBuiltInSubAgent,
  isBuiltInSubAgentId,
} from './builtInSubAgents.js';

// SubAgent Manager
export { SubAgentManager, type SubAgentManagerEvents } from './subAgentManager.js';

// Custom SubAgent
export { CustomSubAgent, type CustomSubAgentExecutionContext } from './customSubAgent.js';
