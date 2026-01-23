/**
 * Skills system exports
 *
 * This module provides the complete Skills system for DeepV Code.
 * All skill-related functionality has been consolidated here from cli package
 * to ensure proper bundling and avoid cross-package dynamic imports.
 */

// Skill types (comprehensive types from skill system)
export * from './skill-types.js';

// Models
export * from './models/index.js';

// Parsers
export * from './parsers/index.js';

// Loaders
export * from './loaders/index.js';

// Core Services
export { SettingsManager, SkillsPaths, settingsManager } from './settings-manager.js';
export { MarketplaceManager, marketplaceManager } from './marketplace-manager.js';
export { PluginInstaller, pluginInstaller } from './plugin-installer.js';
export { SkillLoader, skillLoader } from './skill-loader.js';
export { SkillContextInjector, skillContextInjector } from './skill-context-injector.js';
export { ScriptExecutor, scriptExecutor } from './script-executor.js';
export type {
  ScriptExecutionOptions,
  ScriptExecutionResult,
} from './script-executor.js';

// Integration
export {
  getSkillsContext,
  initializeSkillsContext,
  clearSkillsContextCache,
} from './skills-integration.js';

// Context Builder (legacy)
export { SkillsContextBuilder } from './skills-context-builder.js';

/**
 * Initialize Skills System
 *
 * This should be called once at startup to initialize the Skills system
 */
export async function initializeSkillsSystem(): Promise<void> {
  const { SettingsManager } = await import('./settings-manager.js');
  const settings = new SettingsManager();
  await settings.initialize();
}

/**
 * Create Skills System instances with proper dependency injection
 */
export function createSkillsSystem() {
  // Use dynamic require to avoid circular dependency issues
  const { SettingsManager } = require('./settings-manager.js');
  const { MarketplaceManager } = require('./marketplace-manager.js');
  const { PluginInstaller } = require('./plugin-installer.js');
  const { SkillLoader } = require('./skill-loader.js');
  const { SkillContextInjector } = require('./skill-context-injector.js');

  const settings = new SettingsManager();
  const marketplace = new MarketplaceManager(settings);
  const installer = new PluginInstaller(settings, marketplace);
  const loader = new SkillLoader(settings, marketplace);
  const injector = new SkillContextInjector(loader, settings);

  return {
    settings,
    marketplace,
    installer,
    loader,
    injector,
  };
}
