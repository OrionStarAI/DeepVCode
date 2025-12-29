/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitService } from './gitService.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import type { ChildProcess } from 'node:child_process';
import { getProjectHash, GEMINI_DIR } from '../utils/paths.js';

const hoistedMockExec = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  exec: hoistedMockExec,
}));

// Use a shared mock object for the repo
const mockRepo: any = {
  checkIsRepo: vi.fn(),
  init: vi.fn(),
  raw: vi.fn(),
  add: vi.fn(),
  commit: vi.fn(),
  addConfig: vi.fn(),
  status: vi.fn(),
  clean: vi.fn(),
};
mockRepo.env = vi.fn().mockReturnValue(mockRepo);

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => mockRepo),
  CheckRepoActions: { IS_REPO_ROOT: 'is-repo-root' },
}));

const hoistedIsGitRepositoryMock = vi.hoisted(() => vi.fn());
vi.mock('../utils/gitUtils.js', () => ({
  isGitRepository: hoistedIsGitRepositoryMock,
}));

const hoistedMockHomedir = vi.hoisted(() => vi.fn());
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return {
    ...actual,
    homedir: hoistedMockHomedir,
  };
});

describe('GitService', () => {
  let testRootDir: string;
  let projectRoot: string;
  let homedir: string;
  let hash: string;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'git-service-test-'));
    projectRoot = path.join(testRootDir, 'project');
    homedir = path.join(testRootDir, 'home');
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(homedir, { recursive: true });

    hash = getProjectHash(projectRoot);

    vi.clearAllMocks();
    hoistedIsGitRepositoryMock.mockReturnValue(true);
    hoistedMockExec.mockImplementation((command, callback) => {
      if (command === 'git --version') {
        callback(null, 'git version 2.0.0');
      } else {
        callback(new Error('Command not mocked'));
      }
      return {};
    });

    hoistedMockHomedir.mockReturnValue(homedir);

    mockRepo.checkIsRepo.mockResolvedValue(false);
    mockRepo.init.mockResolvedValue(undefined);
    mockRepo.raw.mockResolvedValue('');
    mockRepo.add.mockResolvedValue(undefined);
    mockRepo.commit.mockResolvedValue({
      commit: 'initial',
    });
    mockRepo.addConfig.mockResolvedValue(undefined);
    mockRepo.status.mockResolvedValue({ files: [] });
    mockRepo.clean.mockResolvedValue(undefined);
    mockRepo.env.mockReturnValue(mockRepo);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(testRootDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should successfully create an instance', () => {
      expect(() => new GitService(projectRoot)).not.toThrow();
    });
  });

  describe('verifyGitAvailability', () => {
    it('should resolve true if git --version command succeeds', async () => {
      const service = new GitService(projectRoot);
      await expect(service.verifyGitAvailability()).resolves.toBe(true);
    });

    it('should resolve false if git --version command fails', async () => {
      hoistedMockExec.mockImplementation((command, callback) => {
        callback(new Error('git not found'));
        return {} as ChildProcess;
      });
      const service = new GitService(projectRoot);
      await expect(service.verifyGitAvailability()).resolves.toBe(false);
    });
  });

  describe('initialize', () => {
    it('should return disabled status if Git is not available', async () => {
      hoistedMockExec.mockImplementation((command, callback) => {
        callback(new Error('git not found'));
        return {} as ChildProcess;
      });
      const service = new GitService(projectRoot);
      const result = await service.initialize();
      expect(result.success).toBe(false);
      expect(result.disabled).toBe(true);
      expect(result.disabledReason).toContain('Git is not installed');
    });

    it('should call setupShadowGitRepository if Git is available', async () => {
      const service = new GitService(projectRoot);
      const setupSpy = vi
        .spyOn(service, 'setupShadowGitRepository')
        .mockResolvedValue(undefined);

      await service.initialize();
      expect(setupSpy).toHaveBeenCalled();
    });
  });

  describe('setupShadowGitRepository', () => {
    let repoDir: string;
    let gitConfigPath: string;

    beforeEach(() => {
      repoDir = path.join(homedir, GEMINI_DIR, 'history', hash);
      gitConfigPath = path.join(repoDir, '.gitconfig');
    });

    it('should create history and repository directories', async () => {
      const service = new GitService(projectRoot);
      await service.setupShadowGitRepository();
      const stats = await fs.stat(repoDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create a .gitconfig file with the correct content', async () => {
      const service = new GitService(projectRoot);
      await service.setupShadowGitRepository();

      const expectedConfigContent =
        '[user]\n  name = DvCode CLI\n  email = dvcode-cli@google.com\n[commit]\n  gpgsign = false\n';
      const actualConfigContent = await fs.readFile(gitConfigPath, 'utf-8');
      expect(actualConfigContent).toBe(expectedConfigContent);
    });

    it('should initialize git repo in historyDir if not already initialized', async () => {
      const service = new GitService(projectRoot);
      await service.setupShadowGitRepository();

      const { simpleGit } = await import('simple-git');
      expect(simpleGit).toHaveBeenCalledWith(repoDir);
      expect(mockRepo.init).toHaveBeenCalled();
    });

    it('should not initialize git repo if already initialized', async () => {
      const service = new GitService(projectRoot);
      // Create .git dir to simulate existing repo
      const gitDir = path.join(repoDir, '.git');
      await fs.mkdir(gitDir, { recursive: true });

      await service.setupShadowGitRepository();
      expect(mockRepo.init).not.toHaveBeenCalled();
    });

    it('should copy .gitignore from projectRoot if it exists', async () => {
      const gitignoreContent = 'node_modules/\n.env';
      const visibleGitIgnorePath = path.join(projectRoot, '.gitignore');
      await fs.writeFile(visibleGitIgnorePath, gitignoreContent);

      const service = new GitService(projectRoot);
      await service.setupShadowGitRepository();

      const hiddenGitIgnorePath = path.join(repoDir, '.gitignore');
      const copiedContent = await fs.readFile(hiddenGitIgnorePath, 'utf-8');
      expect(copiedContent).toBe(gitignoreContent);
    });

    it('should not create a .gitignore in shadow repo if project .gitignore does not exist', async () => {
      const service = new GitService(projectRoot);
      await service.setupShadowGitRepository();

      const hiddenGitIgnorePath = path.join(repoDir, '.gitignore');
      // An empty string is written if the file doesn't exist.
      const content = await fs.readFile(hiddenGitIgnorePath, 'utf-8');
      expect(content).toBe('');
    });

    it('should throw an error if reading projectRoot .gitignore fails with other errors', async () => {
      const visibleGitIgnorePath = path.join(projectRoot, '.gitignore');
      // Create a directory instead of a file to cause a read error
      await fs.mkdir(visibleGitIgnorePath);

      const service = new GitService(projectRoot);
      await expect(service.setupShadowGitRepository()).rejects.toThrow();
    });

    it('should make an initial commit if no commits exist in history repo', async () => {
      const service = new GitService(projectRoot);
      await service.setupShadowGitRepository();
      expect(mockRepo.commit).toHaveBeenCalledWith('Initial commit', {
        '--allow-empty': null,
      });
    });
  });
});
