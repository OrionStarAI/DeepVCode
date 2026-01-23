import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListSkillsTool } from './list-skills.js';
import { Config } from '../config/config.js';
import { SkillsContextBuilder } from '../skills/skills-context-builder.js';

vi.mock('../skills/skills-context-builder.js');
vi.mock('../config/config.js');

describe('ListSkillsTool', () => {
  let tool: ListSkillsTool;
  let mockConfig: any;
  let mockContextBuilder: any;

  beforeEach(() => {
    mockConfig = {
      getProjectRoot: vi.fn().mockReturnValue('/mock/root'),
    };

    mockContextBuilder = {
      listSkills: vi.fn(),
    };

    (SkillsContextBuilder as any).mockImplementation(() => mockContextBuilder);

    tool = new ListSkillsTool(mockConfig as any);
  });

  it('should return a specific message when no skills are found without filters', async () => {
    mockContextBuilder.listSkills.mockReturnValue([]);

    const result = await tool.execute({}, new AbortController().signal);

    expect(result.llmContent).toBe('No skills are currently installed.');
    expect(result.returnDisplay).toBe('No skills found');
  });

  it('should return a helpful message when no skills match the filter', async () => {
    mockContextBuilder.listSkills.mockReturnValue([
      { id: 's1', marketplaceId: 'm1', pluginId: 'p1', name: 'skill1' }
    ]);

    const result = await tool.execute({ marketplaceId: 'non-existent' }, new AbortController().signal);

    expect(result.llmContent).toContain('No skills are currently installed or match the filter criteria');
    expect(result.llmContent).toContain('Try calling this tool without any arguments');
    expect(result.returnDisplay).toBe('No skills found');
  });

  it('should list matching skills when filters are applied', async () => {
    const skills = [
      { id: 's1', marketplaceId: 'm1', pluginId: 'p1', name: 'skill1', description: 'desc1', path: 'path1', skillMdPath: 'md1' },
      { id: 's2', marketplaceId: 'm2', pluginId: 'p2', name: 'skill2', description: 'desc2', path: 'path2', skillMdPath: 'md2' }
    ];
    mockContextBuilder.listSkills.mockReturnValue(skills);

    const result = await tool.execute({ marketplaceId: 'm1' }, new AbortController().signal);

    expect(result.llmContent).toContain('Found 1 skill(s)');
    expect(result.llmContent).toContain('skill1');
    expect(result.llmContent).not.toContain('skill2');
    expect(result.returnDisplay).toBe('Found 1 skill(s)');
  });
});
