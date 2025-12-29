/**
 * ScriptExecutor Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { ScriptExecutor } from './script-executor.js';
import { ScriptType, type SkillScript } from './types.js';

describe.skip('ScriptExecutor', () => {
  let executor: ScriptExecutor;
  let testDir: string;

  beforeEach(async () => {
    executor = new ScriptExecutor();
    testDir = path.join(os.tmpdir(), `script-test-${Date.now()}`);
    await fs.ensureDir(testDir);
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('executePythonScript', () => {
    it('should execute simple Python script', async () => {
      const scriptPath = path.join(testDir, 'test.py');
      await fs.writeFile(scriptPath, 'print("Hello from Python")');

      const script: SkillScript = {
        name: 'test.py',
        path: scriptPath,
        type: ScriptType.PYTHON,
      };

      const result = await executor.executeScript(script);

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Hello from Python');
      expect(result.exitCode).toBe(0);
    });

    it('should handle Python script with arguments', async () => {
      const scriptPath = path.join(testDir, 'args.py');
      await fs.writeFile(
        scriptPath,
        `import sys
print(f"Args: {' '.join(sys.argv[1:])}")`,
      );

      const script: SkillScript = {
        name: 'args.py',
        path: scriptPath,
        type: ScriptType.PYTHON,
      };

      const result = await executor.executeScript(script, {
        args: ['arg1', 'arg2'],
      });

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Args: arg1 arg2');
    });

    it('should handle Python script errors', async () => {
      const scriptPath = path.join(testDir, 'error.py');
      await fs.writeFile(scriptPath, 'raise Exception("Test error")');

      const script: SkillScript = {
        name: 'error.py',
        path: scriptPath,
        type: ScriptType.PYTHON,
      };

      const result = await executor.executeScript(script);

      expect(result.success).toBe(false);
      expect(result.stderr).toContain('Test error');
    });
  });

  describe('executeBashScript', () => {
    it('should execute simple Bash script', async () => {
      const scriptPath = path.join(testDir, 'test.sh');
      await fs.writeFile(scriptPath, '#!/bin/bash\necho "Hello from Bash"');
      await fs.chmod(scriptPath, 0o755);

      const script: SkillScript = {
        name: 'test.sh',
        path: scriptPath,
        type: ScriptType.BASH,
      };

      const result = await executor.executeScript(script);

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Hello from Bash');
    });

    it('should handle Bash script with arguments', async () => {
      const scriptPath = path.join(testDir, 'args.sh');
      await fs.writeFile(scriptPath, '#!/bin/bash\necho "Args: $@"');
      await fs.chmod(scriptPath, 0o755);

      const script: SkillScript = {
        name: 'args.sh',
        path: scriptPath,
        type: ScriptType.BASH,
      };

      const result = await executor.executeScript(script, {
        args: ['arg1', 'arg2'],
      });

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Args: arg1 arg2');
    });
  });

  describe('executeNodeScript', () => {
    it('should execute simple Node.js script', async () => {
      const scriptPath = path.join(testDir, 'test.js');
      await fs.writeFile(scriptPath, 'console.log("Hello from Node")');

      const script: SkillScript = {
        name: 'test.js',
        path: scriptPath,
        type: ScriptType.NODE,
      };

      const result = await executor.executeScript(script);

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Hello from Node');
    });

    it('should handle Node.js script with arguments', async () => {
      const scriptPath = path.join(testDir, 'args.js');
      await fs.writeFile(
        scriptPath,
        'console.log("Args:", process.argv.slice(2).join(" "))',
      );

      const script: SkillScript = {
        name: 'args.js',
        path: scriptPath,
        type: ScriptType.NODE,
      };

      const result = await executor.executeScript(script, {
        args: ['arg1', 'arg2'],
      });

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe('Args: arg1 arg2');
    });
  });

  describe('timeout handling', () => {
    it('should timeout long-running scripts', async () => {
      const scriptPath = path.join(testDir, 'sleep.py');
      await fs.writeFile(
        scriptPath,
        `import time
time.sleep(10)
print("Done")`,
      );

      const script: SkillScript = {
        name: 'sleep.py',
        path: scriptPath,
        type: ScriptType.PYTHON,
      };

      await expect(
        executor.executeScript(script, { timeout: 1000 }),
      ).rejects.toThrow('timeout');
    });
  });

  describe('executeScripts', () => {
    it('should execute multiple scripts in sequence', async () => {
      const script1Path = path.join(testDir, 'script1.py');
      const script2Path = path.join(testDir, 'script2.py');

      await fs.writeFile(script1Path, 'print("Script 1")');
      await fs.writeFile(script2Path, 'print("Script 2")');

      const scripts: SkillScript[] = [
        { name: 'script1.py', path: script1Path, type: ScriptType.PYTHON },
        { name: 'script2.py', path: script2Path, type: ScriptType.PYTHON },
      ];

      const results = await executor.executeScripts(scripts);

      expect(results).toHaveLength(2);
      expect(results[0].stdout.trim()).toBe('Script 1');
      expect(results[1].stdout.trim()).toBe('Script 2');
    });

    it('should continue on error', async () => {
      const script1Path = path.join(testDir, 'error.py');
      const script2Path = path.join(testDir, 'ok.py');

      await fs.writeFile(script1Path, 'raise Exception("Error")');
      await fs.writeFile(script2Path, 'print("OK")');

      const scripts: SkillScript[] = [
        { name: 'error.py', path: script1Path, type: ScriptType.PYTHON },
        { name: 'ok.py', path: script2Path, type: ScriptType.PYTHON },
      ];

      const results = await executor.executeScripts(scripts);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });
  });

  describe('formatOutputForContext', () => {
    it('should format successful output', async () => {
      const scriptPath = path.join(testDir, 'test.py');
      await fs.writeFile(scriptPath, 'print("Test output")');

      const script: SkillScript = {
        name: 'test.py',
        path: scriptPath,
        type: ScriptType.PYTHON,
      };

      const result = await executor.executeScript(script);
      const formatted = executor.formatOutputForContext(script, result);

      expect(formatted).toContain('Script: test.py');
      expect(formatted).toContain('Type: python');
      expect(formatted).toContain('Output:');
      expect(formatted).toContain('Test output');
    });

    it('should format failed output', async () => {
      const scriptPath = path.join(testDir, 'error.py');
      await fs.writeFile(scriptPath, 'raise Exception("Error")');

      const script: SkillScript = {
        name: 'error.py',
        path: scriptPath,
        type: ScriptType.PYTHON,
      };

      const result = await executor.executeScript(script);
      const formatted = executor.formatOutputForContext(script, result);

      expect(formatted).toContain('Script: error.py');
      expect(formatted).toContain('execution failed');
    });
  });

  describe('getAvailableExecutors', () => {
    it('should detect available executors', async () => {
      const executors = await executor.getAvailableExecutors();

      // At least one should be available on most systems
      expect(
        executors.python || executors.bash || executors.node,
      ).toBe(true);
    });
  });

  describe('validateScript', () => {
    it('should validate existing script', async () => {
      const scriptPath = path.join(testDir, 'test.py');
      await fs.writeFile(scriptPath, 'print("test")');

      const script: SkillScript = {
        name: 'test.py',
        path: scriptPath,
        type: ScriptType.PYTHON,
      };

      const validation = await executor.validateScript(script);
      expect(validation.valid).toBe(true);
    });

    it('should fail for non-existent script', async () => {
      const script: SkillScript = {
        name: 'missing.py',
        path: '/non/existent/path.py',
        type: ScriptType.PYTHON,
      };

      const validation = await executor.validateScript(script);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('not found');
    });
  });

  describe('execution time tracking', () => {
    it('should track execution time', async () => {
      const scriptPath = path.join(testDir, 'sleep.py');
      await fs.writeFile(
        scriptPath,
        `import time
time.sleep(0.1)
print("Done")`,
      );

      const script: SkillScript = {
        name: 'sleep.py',
        path: scriptPath,
        type: ScriptType.PYTHON,
      };

      const result = await executor.executeScript(script);

      expect(result.executionTime).toBeGreaterThan(100);
      expect(result.executionTime).toBeLessThan(500);
    });
  });
});
