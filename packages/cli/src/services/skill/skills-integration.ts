/**
 * DeepV Code Skills System - Integration with Core
 *
 * Provides Skills context to the AI system prompt
 */

import { SkillContextInjector, SkillLoadLevel } from './index.js';

let cachedSkillsContext: string | null = null;
let lastCacheTime: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get Skills context for AI system prompt (synchronous)
 *
 * Returns cached context if available, empty string otherwise.
 * Call initializeSkillsContext() at startup to populate cache.
 */
export function getSkillsContext(): string {
  return cachedSkillsContext || '';
}

/**
 * Initialize Skills context asynchronously
 *
 * This should be called once at startup to load and cache
 * the Skills metadata for injection into the system prompt.
 */
export async function initializeSkillsContext(): Promise<void> {
  // Check cache
  const now = Date.now();
  if (cachedSkillsContext && now - lastCacheTime < CACHE_TTL) {
    return; // Cache still valid
  }

  try {
    // Create dependencies
    const { SettingsManager, MarketplaceManager, SkillLoader } = await import('./index.js');

    const settings = new SettingsManager();
    await settings.initialize();

    const marketplace = new MarketplaceManager(settings);
    const loader = new SkillLoader(settings, marketplace);
    const injector = new SkillContextInjector(loader, settings);

    const result = await injector.injectStartupContext();

    if (!result.context || result.context.trim().length === 0) {
      // No skills available
      cachedSkillsContext = '';
      lastCacheTime = now;
      return;
    }

    // Format for system prompt - minimal, since detailed instructions are in use_skill tool
    const formattedContext = `
# Available Skills

You have access to specialized Skills that provide domain knowledge, workflows, and executable scripts.

${result.context}

**Important**: Skills marked with 📜 or <has_scripts>true</has_scripts> have executable scripts.
You MUST use the \`use_skill\` tool to load their instructions before executing any scripts.
See the \`use_skill\` tool description for complete usage instructions.

**Token cost**: ~${result.estimatedTokens} tokens (metadata only, full instructions loaded on-demand)
`;

    cachedSkillsContext = formattedContext.trim();
    lastCacheTime = now;
  } catch (error) {
    // Silently fail - Skills system is optional
    console.warn('[Skills] Failed to load context:', error);
    cachedSkillsContext = '';
    lastCacheTime = now;
  }
}

/**
 * Clear the Skills context cache
 *
 * Call this when skills are installed/uninstalled/enabled/disabled
 */
export function clearSkillsContextCache(): void {
  cachedSkillsContext = null;
  lastCacheTime = 0;
}
