# Installed Plugins Schema Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the installed_plugins.json schema to add `installPath` and `isLocal` fields, and change the default version from "1.0.0" to "unknown".

**Architecture:** Modify TypeScript type definitions to include new fields, update all read/write operations to handle the new schema, ensure backward compatibility with existing data, and update default version handling across the codebase.

**Tech Stack:** TypeScript, fs-extra, Node.js

---

## Task 1: Update Type Definitions

**Files:**
- Modify: `packages/cli/src/services/skill/types.ts:320-340`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/services/skill/settings-manager.test.ts
describe('InstalledPluginInfo schema', () => {
  it('should include installPath and isLocal fields', async () => {
    const manager = new SettingsManager();
    await manager.initialize();

    const pluginInfo: InstalledPluginInfo = {
      id: 'test:plugin',
      name: 'plugin',
      marketplaceId: 'test',
      installedAt: new Date().toISOString(),
      enabled: true,
      skillCount: 1,
      version: 'unknown',
      installPath: '/test/path',
      isLocal: false,
    };

    expect(pluginInfo.installPath).toBeDefined();
    expect(pluginInfo.isLocal).toBeDefined();
    expect(pluginInfo.version).toBe('unknown');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- settings-manager.test.ts -t "InstalledPluginInfo schema"`
Expected: FAIL with TypeScript compilation errors for missing fields

**Step 3: Update type definition**

```typescript
// packages/cli/src/services/skill/types.ts
export interface InstalledPluginInfo {
  /** Plugin ID */
  id: string;
  /** Plugin 名称 */
  name: string;
  /** 所属 Marketplace ID */
  marketplaceId: string;
  /** 安装时间 */
  installedAt: string;
  /** 是否启用 */
  enabled: boolean;
  /** 版本（默认 "unknown"） */
  version?: string;
  /** Skills 数量 */
  skillCount: number;
  /** 插件安装路径（完整绝对路径） */
  installPath?: string;
  /** 是否为本地插件（true = 本地路径，false = Git 克隆） */
  isLocal?: boolean;
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- settings-manager.test.ts -t "InstalledPluginInfo schema"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/services/skill/types.ts packages/cli/src/services/skill/settings-manager.test.ts
git commit -m "feat: add installPath and isLocal to InstalledPluginInfo schema"
```

---

## Task 2: Update PluginInstaller - Save installPath and isLocal

**Files:**
- Modify: `packages/cli/src/services/skill/plugin-installer.ts:100-200`
- Test: `packages/cli/src/services/skill/plugin-installer.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/services/skill/plugin-installer.test.ts
describe('installPlugin with installPath', () => {
  it('should save installPath and isLocal for local plugin', async () => {
    await createTestMarketplace();

    const result = await installer.installPlugin('test-mp:test-plugin');

    const installed = await settingsManager.getInstalledPlugin('test-mp:test-plugin');
    expect(installed?.installPath).toBeDefined();
    expect(installed?.isLocal).toBe(true); // Local marketplace
    expect(installed?.version).toBe('unknown'); // Default version
  });

  it('should save installPath and isLocal for Git plugin', async () => {
    // Test with Git-cloned plugin
    const result = await installer.installPlugin('git-mp:git-plugin');

    const installed = await settingsManager.getInstalledPlugin('git-mp:git-plugin');
    expect(installed?.installPath).toBeDefined();
    expect(installed?.isLocal).toBe(false); // Git source
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- plugin-installer.test.ts -t "installPlugin with installPath"`
Expected: FAIL - installPath and isLocal not saved

**Step 3: Implement installPath and isLocal saving**

```typescript
// packages/cli/src/services/skill/plugin-installer.ts
async installPlugin(pluginId: string): Promise<InstallResult> {
  // ... existing code ...

  // Determine installPath and isLocal
  const marketplace = await this.marketplaceManager.getMarketplace(marketplaceId);
  const isLocal = marketplace.source === MarketplaceSource.LOCAL;
  const installPath = path.join(
    marketplace.path || path.join(SkillsPaths.MARKETPLACE_ROOT, marketplaceId),
    // ... resolve plugin path ...
  );

  // Save with new fields
  await this.settingsManager.addInstalledPlugin({
    id: pluginId,
    name: plugin.name,
    marketplaceId,
    installedAt: new Date().toISOString(),
    enabled: false, // Will be enabled separately
    version: plugin.version || 'unknown', // Changed default
    skillCount: plugin.skillPaths.length,
    installPath, // NEW
    isLocal,     // NEW
  });

  // ... rest of code ...
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- plugin-installer.test.ts -t "installPlugin with installPath"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/services/skill/plugin-installer.ts packages/cli/src/services/skill/plugin-installer.test.ts
git commit -m "feat: save installPath and isLocal when installing plugins"
```

---

## Task 3: Update MarketplaceLoader - Use installPath

**Files:**
- Modify: `packages/cli/src/services/skill/loaders/marketplace-loader.ts:40-120`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/services/skill/loaders/marketplace-loader.test.ts
describe('MarketplaceLoader with installPath', () => {
  it('should use installPath from installed plugin info', async () => {
    const loader = new MarketplaceLoader(settingsManager);

    // Setup: Add plugin with installPath
    await settingsManager.addInstalledPlugin({
      id: 'test-mp:test-plugin',
      name: 'test-plugin',
      marketplaceId: 'test-mp',
      installedAt: new Date().toISOString(),
      enabled: true,
      version: 'unknown',
      skillCount: 1,
      installPath: '/custom/install/path',
      isLocal: true,
    });

    const plugins = await loader.loadPlugins();
    const plugin = plugins.find(p => p.id === 'test-mp:test-plugin');

    expect(plugin?.location.path).toBe('/custom/install/path');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- marketplace-loader.test.ts -t "MarketplaceLoader with installPath"`
Expected: FAIL - not using installPath

**Step 3: Update loadPluginFromManifest to use installPath**

```typescript
// packages/cli/src/services/skill/loaders/marketplace-loader.ts
private async loadPluginFromManifest(
  marketplaceId: string,
  mpPath: string,
  pluginDef: any
): Promise<UnifiedPlugin | null> {
  const id = `${marketplaceId}:${pluginDef.name}`;

  // Check if plugin has custom installPath
  const installedInfo = await this.settingsManager.getInstalledPlugin(id);
  let pluginDir = mpPath;

  if (installedInfo?.installPath && await fs.pathExists(installedInfo.installPath)) {
    // Use custom installPath if available
    pluginDir = installedInfo.installPath;
  } else if (this.isRemoteGitSource(source)) {
    // Existing Git cache logic
    // ...
  } else if (typeof source === 'string') {
    // Relative path logic
    // ...
  }

  // ... rest of code ...
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- marketplace-loader.test.ts -t "MarketplaceLoader with installPath"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/cli/src/services/skill/loaders/marketplace-loader.ts packages/cli/src/services/skill/loaders/marketplace-loader.test.ts
git commit -m "feat: use installPath from installed plugin info in loader"
```

---

## Task 4: Update Default Version Handling

**Files:**
- Modify: `packages/cli/src/services/skill/marketplace-manager.ts:500-600`
- Modify: `packages/cli/src/services/skill/loaders/marketplace-loader.ts:200-300`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/services/skill/marketplace-manager.test.ts
describe('plugin version defaults', () => {
  it('should use "unknown" when version is not specified', async () => {
    await createTestMarketplace();
    const mp = await manager.addLocalMarketplace(testMarketplacePath);

    const plugin = mp.plugins[0];
    expect(plugin.version).toBe('unknown');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- marketplace-manager.test.ts -t "plugin version defaults"`
Expected: FAIL - version is "1.0.0" instead of "unknown"

**Step 3: Update version defaults in marketplace-manager**

```typescript
// packages/cli/src/services/skill/marketplace-manager.ts
private async parsePlugin(
  marketplaceId: string,
  marketplacePath: string,
  pluginDef: MarketplacePluginEntry,
): Promise<Plugin> {
  // ... existing code ...

  const plugin: Plugin = {
    id: pluginId,
    name: finalPluginDef.name,
    description: finalPluginDef.description || '',
    marketplaceId,
    source: finalPluginDef.source,
    strict: isStrict,
    skillPaths,
    items,
    installed: isInstalled,
    enabled: isEnabled,
    version: finalPluginDef.version || 'unknown', // Changed from '1.0.0'
    // ... rest of fields ...
  };

  return plugin;
}
```

**Step 4: Update version defaults in marketplace-loader**

```typescript
// packages/cli/src/services/skill/loaders/marketplace-loader.ts
private async loadPluginFromDir(
  marketplaceId: string,
  pluginDir: string
): Promise<UnifiedPlugin | null> {
  // ... existing code ...

  let metadata: any = {
    name: pluginName,
    description: '',
    version: 'unknown' // Changed from '0.0.0'
  };

  // ... rest of code ...

  return {
    id,
    name: metadata.name || pluginName,
    description: metadata.description || '',
    version: metadata.version || 'unknown', // Changed from '0.0.0'
    // ... rest of fields ...
  };
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- marketplace-manager.test.ts -t "plugin version defaults"`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/cli/src/services/skill/marketplace-manager.ts packages/cli/src/services/skill/loaders/marketplace-loader.ts packages/cli/src/services/skill/marketplace-manager.test.ts
git commit -m "feat: change default plugin version from '1.0.0' to 'unknown'"
```

---

## Task 5: Update SkillsContextBuilder - Use installPath

**Files:**
- Modify: `packages/core/src/skills/skills-context-builder.ts:88-110`

**Step 1: Write the failing test**

```typescript
// packages/core/src/skills/skills-context-builder.test.ts
describe('SkillsContextBuilder with installPath', () => {
  it('should use installPath when available', () => {
    const builder = new SkillsContextBuilder();

    // Mock installed_plugins.json with installPath
    const mockInstalled = {
      plugins: {
        'test:plugin': {
          id: 'test:plugin',
          name: 'plugin',
          marketplaceId: 'test',
          installedAt: '2026-01-06',
          enabled: true,
          version: 'unknown',
          skillCount: 1,
          installPath: '/custom/path',
          isLocal: true,
        }
      }
    };

    // Test that builder uses installPath
    const context = builder.buildContext();
    expect(context.skills[0].path).toContain('/custom/path');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- skills-context-builder.test.ts -t "SkillsContextBuilder with installPath"`
Expected: FAIL - not using installPath

**Step 3: Update SkillsContextBuilder to prioritize installPath**

```typescript
// packages/core/src/skills/skills-context-builder.ts
private getAvailableSkills(): SkillInfo[] {
  // ... existing code ...

  for (const [pluginId, enabled] of Object.entries(settings.enabledPlugins)) {
    if (!enabled) continue;

    const pluginInfo = installed.plugins[pluginId];
    if (!pluginInfo) continue;

    // Prioritize installPath (new field)
    let pluginRoot: string | undefined = pluginInfo.installPath;

    if (!pluginRoot) {
      // Fallback: try to find in marketplace (backward compatibility)
      const foundPath = this.findPluginInMarketplace(
        pluginInfo.marketplaceId,
        pluginInfo.name
      );

      if (!foundPath) {
        console.warn(`[SkillsContextBuilder] Cannot find plugin ${pluginId}`);
        continue;
      }

      pluginRoot = foundPath;
      console.log(`[SkillsContextBuilder] No installPath for ${pluginId}, using fallback: ${pluginRoot}`);
    }

    // ... rest of code ...
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- skills-context-builder.test.ts -t "SkillsContextBuilder with installPath"`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/skills/skills-context-builder.ts packages/core/src/skills/skills-context-builder.test.ts
git commit -m "feat: prioritize installPath in SkillsContextBuilder"
```

---

## Task 6: Migration for Existing Data

**Files:**
- Create: `packages/cli/src/services/skill/migrations/add-install-path.ts`
- Modify: `packages/cli/src/services/skill/settings-manager.ts:50-80`

**Step 1: Write the failing test**

```typescript
// packages/cli/src/services/skill/migrations/add-install-path.test.ts
describe('installPath migration', () => {
  it('should add installPath to existing installed plugins', async () => {
    // Setup old format data
    const oldData = {
      plugins: {
        'test:plugin': {
          id: 'test:plugin',
          name: 'plugin',
          marketplaceId: 'test',
          installedAt: '2026-01-05',
          enabled: true,
          version: '1.0.0',
          skillCount: 1,
          // No installPath or isLocal
        }
      }
    };

    await fs.writeJson(installedPluginsPath, oldData);

    const migration = new AddInstallPathMigration(settingsManager, marketplaceManager);
    await migration.run();

    const updated = await fs.readJson(installedPluginsPath);
    expect(updated.plugins['test:plugin'].installPath).toBeDefined();
    expect(updated.plugins['test:plugin'].isLocal).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- add-install-path.test.ts -t "installPath migration"`
Expected: FAIL - migration not implemented

**Step 3: Implement migration**

```typescript
// packages/cli/src/services/skill/migrations/add-install-path.ts
import { SettingsManager } from '../settings-manager.js';
import { MarketplaceManager } from '../marketplace-manager.js';
import { MarketplaceSource } from '../types.js';
import path from 'path';
import { SkillsPaths } from '../settings-manager.js';

export class AddInstallPathMigration {
  constructor(
    private settingsManager: SettingsManager,
    private marketplaceManager: MarketplaceManager,
  ) {}

  async run(): Promise<void> {
    const installed = await this.settingsManager.readInstalledPlugins();
    let updated = false;

    for (const [pluginId, info] of Object.entries(installed.plugins)) {
      // Skip if already has installPath
      if (info.installPath) continue;

      try {
        const [marketplaceId, pluginName] = pluginId.split(':');
        const marketplace = await this.marketplaceManager.getMarketplace(marketplaceId);

        // Determine isLocal
        const isLocal = marketplace.source === MarketplaceSource.LOCAL;

        // Find plugin path
        const plugin = marketplace.plugins.find(p => p.name === pluginName);
        if (!plugin) continue;

        // Calculate installPath
        let installPath: string;
        if (typeof plugin.source === 'string') {
          installPath = path.join(
            marketplace.path || path.join(SkillsPaths.MARKETPLACE_ROOT, marketplaceId),
            plugin.source
          );
        } else {
          // For Git sources, use cache path or fallback
          const version = info.version || 'unknown';
          installPath = SkillsPaths.getPluginCachePath(marketplaceId, pluginName, version);
        }

        // Update plugin info
        info.installPath = installPath;
        info.isLocal = isLocal;

        // Update version if it's '1.0.0' (old default)
        if (info.version === '1.0.0') {
          info.version = plugin.version || 'unknown';
        }

        updated = true;
      } catch (error) {
        console.warn(`Failed to migrate plugin ${pluginId}:`, error);
      }
    }

    if (updated) {
      await this.settingsManager.writeInstalledPlugins(installed);
    }
  }
}
```

**Step 4: Integrate migration into SettingsManager initialization**

```typescript
// packages/cli/src/services/skill/settings-manager.ts
async initialize(): Promise<void> {
  await this.ensureDirectories();
  await this.ensureConfigFiles();

  // Run migrations
  await this.runMigrations();
}

private async runMigrations(): Promise<void> {
  try {
    const { AddInstallPathMigration } = await import('./migrations/add-install-path.js');
    const { MarketplaceManager } = await import('./marketplace-manager.js');

    const marketplaceManager = new MarketplaceManager(this);
    const migration = new AddInstallPathMigration(this, marketplaceManager);
    await migration.run();
  } catch (error) {
    console.warn('Migration failed (non-fatal):', error);
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npm test -- add-install-path.test.ts -t "installPath migration"`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/cli/src/services/skill/migrations/ packages/cli/src/services/skill/settings-manager.ts
git commit -m "feat: add migration for installPath and isLocal fields"
```

---

## Task 7: Integration Tests

**Files:**
- Create: `packages/cli/src/services/skill/integration.test.ts`

**Step 1: Write integration test**

```typescript
// packages/cli/src/services/skill/integration.test.ts
describe('Installed Plugins Schema Integration', () => {
  it('should handle complete install-load-uninstall workflow with new fields', async () => {
    const settingsManager = new SettingsManager();
    await settingsManager.initialize();

    const marketplaceManager = new MarketplaceManager(settingsManager);
    const installer = new PluginInstaller(settingsManager, marketplaceManager);
    const loader = new SkillLoader(settingsManager, marketplaceManager);

    // 1. Install plugin
    await createTestMarketplace();
    await marketplaceManager.addLocalMarketplace(testMarketplacePath, 'test-mp');
    const installResult = await installer.installPlugin('test-mp:test-plugin');

    expect(installResult.success).toBe(true);

    // 2. Verify installed_plugins.json has new fields
    const installed = await settingsManager.getInstalledPlugin('test-mp:test-plugin');
    expect(installed?.installPath).toBeDefined();
    expect(installed?.isLocal).toBe(true);
    expect(installed?.version).toBe('unknown');

    // 3. Enable plugin
    await settingsManager.enablePlugin('test-mp:test-plugin');

    // 4. Load skills
    const skills = await loader.loadEnabledSkills();
    expect(skills.length).toBeGreaterThan(0);

    // 5. Verify loader used installPath
    const skill = skills.find(s => s.pluginId === 'test-mp:test-plugin');
    expect(skill?.path).toBe(installed?.installPath);

    // 6. Uninstall
    await installer.uninstallPlugin('test-mp:test-plugin');
    const afterUninstall = await settingsManager.getInstalledPlugin('test-mp:test-plugin');
    expect(afterUninstall).toBeNull();
  });
});
```

**Step 2: Run integration test**

Run: `npm test -- integration.test.ts -t "Installed Plugins Schema Integration"`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/cli/src/services/skill/integration.test.ts
git commit -m "test: add integration tests for new schema fields"
```

---

## Task 8: Update Documentation

**Files:**
- Modify: `docs/skills-usage.md`
- Create: `docs/skills-schema-migration.md`

**Step 1: Update skills-usage.md**

Add section about new schema fields:

```markdown
### Installed Plugins Schema

The `~/.deepv/skills/installed_plugins.json` file tracks installed plugins with the following schema:

\`\`\`json
{
  "plugins": {
    "marketplace-id:plugin-name": {
      "id": "marketplace-id:plugin-name",
      "name": "plugin-name",
      "marketplaceId": "marketplace-id",
      "installedAt": "2026-01-06T12:00:00.000Z",
      "enabled": true,
      "version": "unknown",
      "skillCount": 5,
      "installPath": "/path/to/plugin/installation",
      "isLocal": true
    }
  },
  "lastUpdated": "2026-01-06T12:00:00.000Z"
}
\`\`\`

**New Fields (v2.0+):**
- `installPath`: Absolute path to plugin installation directory
- `isLocal`: Boolean indicating if plugin is from local source (true) or Git (false)
- `version`: Defaults to "unknown" instead of "1.0.0"

**Backward Compatibility:** Old plugins without these fields will be automatically migrated on next startup.
```

**Step 2: Create migration guide**

```markdown
# Skills Schema Migration Guide

## Version 2.0 Schema Changes

### Added Fields

1. **installPath** (string, optional)
   - Absolute path to plugin installation
   - Enables custom installation locations
   - Backward compatible: auto-detected if missing

2. **isLocal** (boolean, optional)
   - `true`: Plugin from local marketplace
   - `false`: Plugin from Git source
   - Used for cleanup decisions

3. **version** default changed
   - Old: `"1.0.0"`
   - New: `"unknown"`

### Migration Process

Migration runs automatically on startup via `SettingsManager.initialize()`.

For each installed plugin without `installPath`:
1. Lookup plugin in marketplace
2. Determine `isLocal` from marketplace source
3. Calculate `installPath` from source definition
4. Update version if it's "1.0.0" (old default)
5. Save updated schema

### Manual Migration

If needed, run:

\`\`\`bash
dvcode --migrate-skills
\`\`\`
```

**Step 3: Commit**

```bash
git add docs/skills-usage.md docs/skills-schema-migration.md
git commit -m "docs: document new installed plugins schema fields"
```

---

## Task 9: Build and Test

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

**Step 2: Build project**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

**Step 3: Manual testing**

```bash
# 1. Install a plugin
dvcode skill install test-marketplace:test-plugin

# 2. Check installed_plugins.json
cat ~/.deepv/skills/installed_plugins.json

# 3. Verify fields present:
#    - installPath
#    - isLocal
#    - version: "unknown"

# 4. Test loader
dvcode skill list
```

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: build and test schema update"
```

---

## Summary

This plan updates the `installed_plugins.json` schema to include:
1. ✅ `installPath` field - absolute path to plugin installation
2. ✅ `isLocal` field - boolean for local vs Git source
3. ✅ Default version changed from "1.0.0" to "unknown"
4. ✅ Automatic migration for existing data
5. ✅ Full test coverage
6. ✅ Documentation updates

**Total Steps:** 9 tasks, ~35 individual steps
**Estimated Time:** 2-3 hours
**Test Coverage:** Unit tests + Integration tests + Manual verification
