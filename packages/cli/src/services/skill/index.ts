/**
 * Skills System - Public API
 *
 * This module re-exports the Skills system from core package.
 * The Skills system has been consolidated into core to ensure proper
 * bundling and avoid cross-package dynamic imports.
 *
 * For new code, prefer importing directly from 'deepv-code-core'.
 * This file is kept for backward compatibility with existing imports.
 */

// Re-export everything from core's skills module
export {
  // Types
  type Skill,
  type SkillMetadata,
  type SkillScript,
  type SkillsSettings,
  type InstalledPluginsRecord,
  type InstalledPluginInfo,
  type MarketplaceConfig,
  type Plugin,
  type Marketplace,
  type SkillContextResult,
  type SkillInfo,
  type SkillsContext,
  SkillLoadLevel,
  SkillType,
  SkillSource,
  ScriptType,
  SkillErrorCode,
  MarketplaceSource,

  // Core Services
  SettingsManager,
  SkillsPaths,
  settingsManager,
  MarketplaceManager,
  marketplaceManager,
  PluginInstaller,
  pluginInstaller,
  SkillLoader,
  skillLoader,
  SkillContextInjector,
  skillContextInjector,
  ScriptExecutor,
  scriptExecutor,
  type ScriptExecutionOptions,
  type ScriptExecutionResult,

  // Integration
  initializeSkillsContext,
  getSkillsContext,
  clearSkillsContextCache,

  // Utilities
  initializeSkillsSystem,
  createSkillsSystem,
} from 'deepv-code-core';

// CLI-specific: PluginCommandLoader (depends on CLI UI types)
export { PluginCommandLoader } from './loaders/plugin-command-loader.js';
