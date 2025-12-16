/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Export config
export * from './config/config.js';
export * from './config/projectSettings.js';
export * from './config/messageRoles.js';
export * from './config/serverConfig.js';
export * from './config/modelCapabilities.js';

// Export extended types
export * from './types/extendedContent.js';

// Export Core Logic
export * from './core/client.js';
export * from './core/contentGenerator.js';
export * from './core/geminiChat.js';
export * from './core/logger.js';
export * from './core/prompts.js';
export * from './core/tokenLimits.js';
export * from './core/modelConfig.js';
export * from './core/turn.js';
export * from './core/geminiRequest.js';
export * from './core/coreToolScheduler.js';
export * from './core/nonInteractiveToolExecutor.js';
export * from './tools/task.js';
export * from './core/subAgent.js';
export * from './core/proxyAuth.js';
export * from './core/toolSchedulerAdapter.js';
export { ToolExecutionEngine } from './core/toolExecutionEngine.js';
export * from './core/mainAgentAdapter.js';
export * from './core/subAgentAdapter.js';
export * from './core/sceneManager.js';
export * from './core/imageGenerator.js';

export * from './code_assist/codeAssist.js';
// clearCachedCredentialFile removed with OAuth2 - no longer needed for Cheeth OA
// OAuth2 module removed - only Cheeth OA authentication supported
export * from './code_assist/server.js';
export * from './code_assist/types.js';
export * from './code_assist/inlineCompletion.js';

// Export utilities
export * from './utils/paths.js';
export * from './utils/schemaValidator.js';
export * from './utils/errors.js';
export * from './utils/getFolderStructure.js';
export * from './utils/memoryDiscovery.js';
export * from './utils/gitIgnoreParser.js';
export * from './utils/editor.js';
export * from './utils/quotaErrorDetection.js';
export * from './utils/fileUtils.js';
export * from './utils/retry.js';
export * from './utils/functionCallValidator.js';
export * from './utils/modelDiagnostics.js';
export * from './utils/logging.js';
export * from './utils/pathUtils.js';

export * from './utils/enhancedLogger.js';

// Export auth
export * from './auth/authenticatedHttpClient.js';
export * from './auth/authNavigator.js';
export * from './auth/login/authServer.js';
export * from './auth/login/deepvlabAuth.js';
export * from './auth/login/templates/index.js';
// Explicitly export AuthServer class
export { AuthServer } from './auth/login/authServer.js';

// Export services
export * from './services/fileDiscoveryService.js';
export * from './services/gitService.js';
export * from './services/sessionManager.js';
export * from './services/mcpResponseGuard.js';

// Export IDE specific logic
export * from './ide/ide-client.js';
export * from './ide/ideContext.js';

// Export hooks
export * from './hooks/types.js';

// Export base tool definitions
export * from './tools/tools.js';
export * from './tools/tool-registry.js';

// Export prompt logic
export * from './prompts/mcp-prompts.js';

// Export specific tool logic
export * from './tools/read-file.js';
export * from './tools/ls.js';
export * from './tools/grep.js';
export * from './tools/glob.js';
export * from './tools/edit.js';
export * from './tools/write-file.js';
export * from './tools/web-fetch.js';
export * from './tools/memoryTool.js';
export * from './tools/shell.js';
export * from './tools/web-search.js';
export * from './tools/read-many-files.js';
export * from './tools/read-lints.js';
export * from './tools/lint-fix.js';
export * from './tools/mcp-client.js';
export * from './tools/mcp-tool.js';

// PPT tools
export * from './tools/ppt/index.js';

// MCP OAuth
export { MCPOAuthProvider } from './mcp/oauth-provider.js';
export {
  MCPOAuthToken,
  MCPOAuthCredentials,
  MCPOAuthTokenStorage,
} from './mcp/oauth-token-storage.js';
export type { MCPOAuthConfig } from './mcp/oauth-provider.js';
export type {
  OAuthAuthorizationServerMetadata,
  OAuthProtectedResourceMetadata,
} from './mcp/oauth-utils.js';
export { OAuthUtils } from './mcp/oauth-utils.js';

// Export telemetry functions
export * from './telemetry/index.js';
export { sessionId, getSessionId, setSessionId, resetSessionId } from './utils/session.js';
export * from './utils/browser.js';
