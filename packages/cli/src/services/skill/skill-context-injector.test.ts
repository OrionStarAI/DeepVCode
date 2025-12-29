/**
 * SkillContextInjector Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { SkillContextInjector } from './skill-context-injector.js';
import { SkillLoader } from './skill-loader.js';
import { SettingsManager, SkillsPaths } from './settings-manager.js';
import { MarketplaceManager } from './marketplace-manager.js';
import { PluginInstaller } from './plugin-installer.js';
import { SkillLoadLevel } from './types.js';

describe('SkillContextInjector', () => {
  let injector: SkillContextInjector;
  let loader: SkillLoader;
  let settingsManager: SettingsManager;
  let marketplaceManager: MarketplaceManager;
  let pluginInstaller: PluginInstaller;
  let testRoot: string;
  let testMarketplacePath: string;

  beforeEach(async () => {
    // 创建临时测试目录
    testRoot = path.join(
      os.tmpdir(),
      `deepv-test-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    );
    testMarketplacePath = path.join(testRoot, 'test-marketplace');

    // Mock SkillsPaths
    vi.spyOn(SkillsPaths, 'DEEPV_HOME', 'get').mockReturnValue(testRoot);
    vi.spyOn(SkillsPaths, 'SKILLS_ROOT', 'get').mockReturnValue(
      path.join(testRoot, 'skills'),
    );
    vi.spyOn(SkillsPaths, 'MARKETPLACE_ROOT', 'get').mockReturnValue(
      path.join(testRoot, 'marketplace'),
    );
    vi.spyOn(SkillsPaths, 'SETTINGS_FILE', 'get').mockReturnValue(
      path.join(testRoot, 'skills', 'settings.json'),
    );
    vi.spyOn(SkillsPaths, 'INSTALLED_PLUGINS_FILE', 'get').mockReturnValue(
      path.join(testRoot, 'skills', 'installed_plugins.json'),
    );
    vi.spyOn(SkillsPaths, 'BACKUP_DIR', 'get').mockReturnValue(
      path.join(testRoot, 'skills', 'backups'),
    );

    settingsManager = new SettingsManager();
    await settingsManager.initialize();
    settingsManager.clearCache();

    marketplaceManager = new MarketplaceManager(settingsManager);
    pluginInstaller = new PluginInstaller(settingsManager, marketplaceManager);
    loader = new SkillLoader(settingsManager, marketplaceManager);
    injector = new SkillContextInjector(loader, settingsManager);
  });

  afterEach(async () => {
    // 清理测试目录
    await fs.remove(testRoot);
    vi.restoreAllMocks();
  });

  /**
   * 创建测试用的 Marketplace
   */
  async function createTestMarketplace() {
    await fs.ensureDir(testMarketplacePath);
    await fs.ensureDir(path.join(testMarketplacePath, '.claude-plugin'));
    await fs.ensureDir(path.join(testMarketplacePath, 'test-plugin', 'skill1'));
    await fs.ensureDir(path.join(testMarketplacePath, 'test-plugin', 'skill2'));

    const marketplaceJson = {
      name: 'test-marketplace',
      plugins: [
        {
          name: 'test-plugin',
          description: 'Test Plugin',
          source: './',
          strict: false,
          skills: ['./test-plugin/skill1', './test-plugin/skill2'],
        },
      ],
    };

    await fs.writeFile(
      path.join(testMarketplacePath, '.claude-plugin', 'marketplace.json'),
      JSON.stringify(marketplaceJson, null, 2),
    );

    await fs.writeFile(
      path.join(testMarketplacePath, 'test-plugin', 'skill1', 'SKILL.md'),
      `---
name: skill1
description: Test Skill 1
allowedTools:
  - read_file
  - write_file
---

# Skill 1 Instructions

This skill helps with file operations.
`,
    );

    await fs.writeFile(
      path.join(testMarketplacePath, 'test-plugin', 'skill2', 'SKILL.md'),
      `---
name: skill2
description: Test Skill 2
---

# Skill 2 Instructions
`,
    );

    // 添加脚本
    const scriptsPath = path.join(
      testMarketplacePath,
      'test-plugin',
      'skill1',
      'scripts',
    );
    await fs.ensureDir(scriptsPath);
    await fs.writeFile(path.join(scriptsPath, 'test.py'), 'print("Hello")');

    await marketplaceManager.addLocalMarketplace(testMarketplacePath, 'test-mp');
    await pluginInstaller.installPlugin('test-mp', 'test-plugin');
  }

  describe('injectStartupContext', () => {
    it('should inject metadata-only context', async () => {
      await createTestMarketplace();

      const result = await injector.injectStartupContext();

      expect(result.context).toContain('<available_skills>');
      expect(result.context).toContain('<skill>');
      expect(result.context).toContain('test-mp:test-plugin:skill1');
      expect(result.context).toContain('Test Skill 1');
      expect(result.skillCount).toBe(2);
      expect(result.levelStats.metadata).toBe(2);
    });

    it('should estimate tokens', async () => {
      await createTestMarketplace();

      const result = await injector.injectStartupContext();

      expect(result.estimatedTokens).toBeGreaterThan(0);
      expect(result.estimatedTokens).toBeLessThan(1000);
    });

    it('should return empty context info if no skills', async () => {
      const result = await injector.injectStartupContext();

      expect(result.context).toContain('No skills installed');
      expect(result.skillCount).toBe(0);
    });
  });

  describe('loadSkillLevel2', () => {
    it('should load full skill content', async () => {
      await createTestMarketplace();

      const content = await injector.loadSkillLevel2('test-mp:test-plugin:skill1');

      expect(content).toContain('# Skill: skill1');
      expect(content).toContain('**Description**: Test Skill 1');
      expect(content).toContain('**Allowed Tools**: read_file, write_file');
      expect(content).toContain('## Instructions');
      expect(content).toContain('file operations');
    });

    it('should throw error if skill not found', async () => {
      await createTestMarketplace();

      await expect(
        injector.loadSkillLevel2('test-mp:test-plugin:non-existent'),
      ).rejects.toThrow('not found');
    });

    it('should include metadata in full content', async () => {
      await createTestMarketplace();

      const content = await injector.loadSkillLevel2('test-mp:test-plugin:skill1');

      expect(content).toContain('**Description**');
      expect(content).toContain('**Allowed Tools**');
    });
  });

  describe('loadSkillLevel3', () => {
    it('should load resources info', async () => {
      await createTestMarketplace();

      const content = await injector.loadSkillLevel3('test-mp:test-plugin:skill1');

      expect(content).toContain('# Skill Resources: skill1');
      expect(content).toContain('Available Scripts');
      expect(content).toContain('test.py');
      expect(content).toContain('python');
    });

    it('should not include script code', async () => {
      await createTestMarketplace();

      const content = await injector.loadSkillLevel3('test-mp:test-plugin:skill1');

      expect(content).not.toContain('print("Hello")');
      expect(content).toContain('Script code is not included to save tokens');
    });
  });

  describe('injectSkillsContext', () => {
    it('should inject metadata-only by default', async () => {
      await createTestMarketplace();

      const result = await injector.injectSkillsContext();

      expect(result.context).toContain('<available_skills>');
      expect(result.levelStats.metadata).toBe(2);
    });

    it('should inject full content when requested', async () => {
      await createTestMarketplace();

      const result = await injector.injectSkillsContext({
        includeFullContent: true,
      });

      expect(result.context).toContain('## Instructions');
      expect(result.levelStats.full).toBe(2);
    });

    it('should inject resources when requested', async () => {
      await createTestMarketplace();

      const result = await injector.injectSkillsContext({
        includeResources: true,
      });

      expect(result.context).toContain('## Available Scripts');
      expect(result.levelStats.resources).toBe(2);
    });

    it('should include stats when requested', async () => {
      await createTestMarketplace();

      const result = await injector.injectSkillsContext({
        includeStats: true,
      });

      expect(result.context).toContain('Skills Statistics');
      expect(result.context).toContain('Total Skills: 2');
    });

    it('should warn if exceeds max tokens', async () => {
      await createTestMarketplace();

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await injector.injectSkillsContext({
        maxTokens: 10, // 设置一个很小的限制
      });

      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('exceeds max tokens'),
      );

      warnSpy.mockRestore();
    });
  });

  describe('token estimation', () => {
    it('should estimate more tokens for full content', async () => {
      await createTestMarketplace();

      const metadataResult = await injector.injectSkillsContext();
      const fullResult = await injector.injectSkillsContext({
        includeFullContent: true,
      });

      expect(fullResult.estimatedTokens).toBeGreaterThan(metadataResult.estimatedTokens);
    });

    it('should estimate even more tokens for resources', async () => {
      await createTestMarketplace();

      const fullResult = await injector.injectSkillsContext({
        includeFullContent: true,
      });
      const resourcesResult = await injector.injectSkillsContext({
        includeResources: true,
      });

      expect(resourcesResult.estimatedTokens).toBeGreaterThan(
        fullResult.estimatedTokens,
      );
    });
  });

  describe('context formatting', () => {
    it('should use XML format for metadata context', async () => {
      await createTestMarketplace();

      const result = await injector.injectStartupContext();

      expect(result.context).toContain('<available_skills>');
      expect(result.context).toContain('<name>');
      expect(result.context).toContain('test-mp:test-plugin:skill1');
      expect(result.context).toContain('test-mp:test-plugin:skill2');
    });

    it('should include script information in description if scripts available', async () => {
      await createTestMarketplace();

      const result = await injector.injectStartupContext();

      expect(result.context).toContain('Has executable scripts: test.py');
      expect(result.context).toContain('<has_scripts>');
      expect(result.context).toContain('true');
      expect(result.context).toContain('<script>test.py</script>');
    });
  });
});
