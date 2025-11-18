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

    // Format for system prompt
    const formattedContext = `
# Available Skills

You have access to specialized Skills that provide domain knowledge and workflows.
Skills are organized as: Marketplace → Plugin → Skill

${result.context}

**🔥 CRITICAL WORKFLOW for Skills with Scripts:**

When you see a skill has scripts (marked with 📜):

1. **DO NOT write code or execute scripts immediately**
2. **MUST use the \`use_skill\` tool first** to load full instructions
   - Call: use_skill(skillName="skill-name")
   - Example: use_skill(skillName="test-pdf")
   - This loads the skill's SKILL.md with exact command syntax
3. **The loaded SKILL.md contains**:
   - Detailed usage examples for each script
   - Complete parameter descriptions
   - Exact command format (python3? bash? node?)
   - Important notes and best practices
4. **After loading**: Execute the script using \`run_shell_command\` with the exact syntax from the loaded documentation
5. **Script code stays out of context** (0 tokens) - only output is captured

**Why you MUST use the \`use_skill\` tool:**
- It automatically loads the correct SKILL.md file
- You get exact command syntax - no guessing needed
- Parameters and their order are clearly documented
- Special requirements (env vars, dependencies) are noted
- Using wrong syntax wastes time and tokens

**Example workflow:**
\`\`\`
User: "Fill this PDF form"
AI: "I see the test-pdf skill has fill_form.py. Let me load its instructions..."
   → use_skill(skillName="test-pdf")
System: [Returns full SKILL.md]
AI: [Sees: "python3 scripts/fill_form.py input.pdf data.json output.pdf"]
AI: [Sees: "Parameters: input.pdf (source), data.json (field values), output.pdf (output)"]
AI: "Now I'll use the fill_form.py script as documented..."
   → run_shell_command("python3 /path/to/scripts/fill_form.py application.pdf fields.json filled.pdf")
\`\`\`

**What NOT to do:**
- ❌ Guess the script syntax without using \`use_skill\` first
- ❌ Try to read SKILL.md manually with \`read_file\`
- ❌ Write new Python/Bash code instead of using the script
- ❌ Execute a script without loading the skill first

**Token estimate for loaded metadata**: ~${result.estimatedTokens} tokens
**Loading a skill with \`use_skill\`**: ~1000-2000 tokens (one-time cost)
**Writing new code instead**: ~5000-10000 tokens (wasteful!)
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
