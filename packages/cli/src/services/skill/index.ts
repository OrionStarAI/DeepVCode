/**
 * Skills System - Public API
 *
 * Export all public interfaces for the Skills system
 */

// Types
export * from './types.js';

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
