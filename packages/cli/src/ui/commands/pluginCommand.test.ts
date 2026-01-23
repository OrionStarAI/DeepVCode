import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pluginCommand } from './pluginCommand.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';

// Mock dependencies
vi.mock('deepv-code-core', () => ({
  SettingsManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
  })),
  MarketplaceManager: vi.fn().mockImplementation(() => ({
    listMarketplaces: vi.fn().mockResolvedValue([]),
    addGitMarketplace: vi.fn().mockResolvedValue({ name: 'Test MP', id: 'test-mp', plugins: [] }),
    getPlugins: vi.fn().mockResolvedValue([]),
  })),
  PluginInstaller: vi.fn().mockImplementation(() => ({
    getInstalledPlugins: vi.fn().mockResolvedValue([]),
    installPlugin: vi.fn().mockResolvedValue({ name: 'Test Plugin', id: 'test-mp:test-plugin', skillPaths: [] }),
  })),
  SkillLoader: vi.fn(),
  SkillLoadLevel: { METADATA: 0, FULL: 1, RESOURCES: 2 },
  SkillsPaths: { SKILLS_ROOT: '/mock/skills' },
  clearSkillsContextCache: vi.fn(),
  PROJECT_DIR_PREFIX: '.deepvcode',
}));

// Mock i18n
vi.mock('../utils/i18n.js', () => ({
  t: (key: string) => key,
  tp: (key: string, args: any) => `${key}:${JSON.stringify(args)}`,
}));

describe('pluginCommand', () => {
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      ui: {
        addItem: vi.fn(),
      },
    };
  });

  it('should have the correct name and kind', () => {
    expect(pluginCommand.name).toBe('plugin');
    expect(pluginCommand.kind).toBe(CommandKind.BUILT_IN);
  });

  it('should contain expected subcommands from skill system', () => {
    const subCommandNames = pluginCommand.subCommands?.map(c => c.name);
    expect(subCommandNames).toContain('marketplace');
    expect(subCommandNames).toContain('install');
    expect(subCommandNames).toContain('list');
  });

  describe('Subcommand: marketplace add', () => {
    it('should handle github shorthand owner/repo', async () => {
      const marketplaceCmd = pluginCommand.subCommands?.find(c => c.name === 'marketplace');
      const addCmd = marketplaceCmd?.subCommands?.find(c => c.name === 'add');

      await addCmd?.action(mockContext, 'nextlevelbuilder/ui-ux-pro-max-skill');

      // Verify progress message shows normalized URL
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git'),
        }),
        expect.any(Number)
      );
    });
  });

  describe('Subcommand: install', () => {
    it('should handle plugin@marketplace syntax', async () => {
      const installCmd = pluginCommand.subCommands?.find(c => c.name === 'install');

      await installCmd?.action(mockContext, 'ui-ux-pro-max@ui-ux-pro-max-skill');

      // The action might be async but the call to ui.addItem for progress should happen
      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('ui-ux-pro-max'),
        }),
        expect.any(Number)
      );
    });
  });
});
