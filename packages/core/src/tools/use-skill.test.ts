/**
 * UseSkillTool Tests
 *
 * Tests for the use-skill tool that loads skill information,
 * particularly verifying that plugin root directory is correctly output.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';

// Get actual paths for test assertions (before mock)
const mockDeepvHome = path.join(os.homedir(), '.deepv');
const mockSkillsPaths = {
  DEEPV_HOME: mockDeepvHome,
  SKILLS_ROOT: path.join(mockDeepvHome, 'skills'),
  MARKETPLACE_ROOT: path.join(mockDeepvHome, 'marketplace'),
};

// Create mock class constructors that can be configured per test
let mockLoaderInstance: any = null;
let mockInjectorInstance: any = null;

// Mock the skills module - all variables must be inline
vi.mock('../skills/index.js', async () => {
  const pathModule = await import('path');
  const osModule = await import('os');

  const deepvHome = pathModule.join(osModule.homedir(), '.deepv');

  return {
    SkillsPaths: {
      DEEPV_HOME: deepvHome,
      SKILLS_ROOT: pathModule.join(deepvHome, 'skills'),
      MARKETPLACE_ROOT: pathModule.join(deepvHome, 'marketplace'),
    },
    SettingsManager: class MockSettingsManager {
      async initialize() { return; }
    },
    MarketplaceManager: class MockMarketplaceManager {},
    SkillLoader: class MockSkillLoader {
      async loadEnabledSkills() {
        return mockLoaderInstance?.loadEnabledSkills?.() ?? [];
      }
    },
    SkillContextInjector: class MockSkillContextInjector {
      async loadSkillLevel2(skillId: string) {
        return mockInjectorInstance?.loadSkillLevel2?.(skillId) ?? '';
      }
    },
    SkillLoadLevel: {
      METADATA: 'METADATA',
      FULL: 'FULL',
      RESOURCES: 'RESOURCES',
    },
  };
});

// Import after mock setup
import { UseSkillTool } from './use-skill.js';
import { SkillLoadLevel } from '../skills/index.js';

describe('UseSkillTool', () => {
  const mockAbortSignal = new AbortController().signal;
  let useSkillTool: UseSkillTool;

  beforeEach(() => {
    vi.clearAllMocks();
    useSkillTool = new UseSkillTool();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic properties', () => {
    it('should have correct name and displayName', () => {
      expect(useSkillTool.name).toBe('use_skill');
      expect(useSkillTool.displayName).toBe('Use Skill');
    });

    it('should have schema with skillName parameter', () => {
      expect(useSkillTool.schema).toBeDefined();
      expect(useSkillTool.schema.parameters?.properties?.skillName).toBeDefined();
    });
  });

  describe('validateToolParams', () => {
    it('should return error for missing skillName', () => {
      const result = useSkillTool.validateToolParams({} as any);
      expect(result).toContain('skillName is required');
    });

    it('should return error for empty skillName', () => {
      const result = useSkillTool.validateToolParams({ skillName: '  ' });
      expect(result).toContain('cannot be empty');
    });

    it('should return null for valid skillName', () => {
      const result = useSkillTool.validateToolParams({ skillName: 'test-skill' });
      expect(result).toBeNull();
    });
  });

  describe('execute - plugin root directory output', () => {
    it('should include plugin root directory for marketplace skills', async () => {
      const marketplaceId = 'agent-browser';
      const skillPath = path.join(
        mockSkillsPaths.MARKETPLACE_ROOT,
        marketplaceId,
        'skills',
        'agent-browser'
      );

      const mockSkill = {
        id: 'agent-browser:agent-browser',
        name: 'agent-browser',
        description: 'Browser automation skill',
        pluginId: 'agent-browser:agent-browser',
        marketplaceId: marketplaceId,
        path: skillPath,
        skillFilePath: path.join(skillPath, 'SKILL.md'),
        metadata: { name: 'agent-browser' },
        enabled: true,
        loadLevel: SkillLoadLevel.RESOURCES,
        scripts: [],
      };

      // Setup mocks for this test via global instances
      mockLoaderInstance = {
        loadEnabledSkills: () => [mockSkill],
      };
      mockInjectorInstance = {
        loadSkillLevel2: () => '# Agent Browser\n\nUsage instructions...',
      };

      const result = await useSkillTool.execute({ skillName: 'agent-browser' }, mockAbortSignal);

      // Verify output contains plugin root directory
      const expectedPluginRoot = path.join(mockSkillsPaths.MARKETPLACE_ROOT, marketplaceId);
      expect(result.llmContent).toContain('**Plugin root directory**');
      expect(result.llmContent).toContain(expectedPluginRoot);
      expect(result.llmContent).toContain('**Skill directory**');
      expect(result.llmContent).toContain(skillPath);
      expect(result.returnDisplay).toContain('✅ Loaded skill');
    });

    it('should include scripts with full paths when available', async () => {
      const marketplaceId = 'document-skills';
      const skillPath = path.join(
        mockSkillsPaths.MARKETPLACE_ROOT,
        marketplaceId,
        'skills',
        'pptx'
      );
      const scriptsPath = path.join(skillPath, 'scripts');

      const mockSkill = {
        id: 'document-skills:pptx',
        name: 'pptx',
        description: 'PowerPoint generation skill',
        pluginId: 'document-skills:pptx',
        marketplaceId: marketplaceId,
        path: skillPath,
        skillFilePath: path.join(skillPath, 'SKILL.md'),
        scriptsPath: scriptsPath,
        metadata: { name: 'pptx' },
        enabled: true,
        loadLevel: SkillLoadLevel.RESOURCES,
        scripts: [
          { name: 'generate.js', path: path.join(scriptsPath, 'generate.js'), type: 'node' },
          { name: 'convert.py', path: path.join(scriptsPath, 'convert.py'), type: 'python' },
        ],
      };

      mockLoaderInstance = {
        loadEnabledSkills: () => [mockSkill],
      };
      mockInjectorInstance = {
        loadSkillLevel2: () => '# PPTX Skill\n\nCreate PowerPoint files...',
      };

      const result = await useSkillTool.execute({ skillName: 'pptx' }, mockAbortSignal);

      // Verify output contains scripts directory and script paths
      expect(result.llmContent).toContain('**Scripts directory**');
      expect(result.llmContent).toContain(scriptsPath);
      expect(result.llmContent).toContain('**Available scripts**');
      expect(result.llmContent).toContain('generate.js');
      expect(result.llmContent).toContain('convert.py');
    });

    it('should not show plugin root directory for non-marketplace skills', async () => {
      const skillPath = '/mock/project/.deepvcode/skills/custom-skill';

      const mockSkill = {
        id: 'project:custom-skill',
        name: 'custom-skill',
        description: 'Custom project skill',
        pluginId: '',
        marketplaceId: '', // No marketplace ID
        path: skillPath,
        skillFilePath: path.join(skillPath, 'SKILL.md'),
        metadata: { name: 'custom-skill' },
        enabled: true,
        loadLevel: SkillLoadLevel.RESOURCES,
        scripts: [],
      };

      mockLoaderInstance = {
        loadEnabledSkills: () => [mockSkill],
      };
      mockInjectorInstance = {
        loadSkillLevel2: () => '# Custom Skill\n\nCustom instructions...',
      };

      const result = await useSkillTool.execute({ skillName: 'custom-skill' }, mockAbortSignal);

      // For non-marketplace skills, should only show skill directory
      expect(result.llmContent).toContain('**Skill directory**');
      expect(result.llmContent).toContain(skillPath);
      // Should not contain Plugin root directory line
      expect(result.llmContent).not.toContain('**Plugin root directory**');
    });

    it('should return error when skill not found', async () => {
      mockLoaderInstance = {
        loadEnabledSkills: () => [],
      };

      const result = await useSkillTool.execute({ skillName: 'nonexistent' }, mockAbortSignal);

      expect(result.llmContent).toContain('❌ Skill "nonexistent" not found');
      expect(result.returnDisplay).toContain('not found');
    });
  });

  describe('getDescription', () => {
    it('should return description with skill name', () => {
      const desc = useSkillTool.getDescription({ skillName: 'test-skill' });
      expect(desc).toBe('Loading skill: test-skill');
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should return false (no confirmation needed)', async () => {
      const result = await useSkillTool.shouldConfirmExecute(
        { skillName: 'test' },
        mockAbortSignal
      );
      expect(result).toBe(false);
    });
  });
});
