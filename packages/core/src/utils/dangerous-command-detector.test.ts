/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  detectDangerousCommand,
  shouldAlwaysConfirmCommand,
  getDangerousCommandInfo,
} from './dangerous-command-detector.js';

describe('DangerousCommandDetector', () => {
  describe('Rule 1: Recursive delete commands', () => {
    it('should detect rm -rf command', () => {
      const rule = detectDangerousCommand('rm -rf /some/path');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('recursive-rm-command');
    });

    it('should detect rm -r command', () => {
      const rule = detectDangerousCommand('rm -r ./node_modules');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('recursive-rm-command');
    });

    it('should detect rm --recursive command', () => {
      const rule = detectDangerousCommand('rm --recursive ./dist');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('recursive-rm-command');
    });

    it('should detect del /s on Windows', () => {
      const rule = detectDangerousCommand('del /s /q C:\\temp', 'win32');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('del-recurse-command');
    });

    it('should not detect del /s on non-Windows', () => {
      const rule = detectDangerousCommand('del /s /q C:\\temp', 'linux');
      expect(rule).toBeNull();
    });

    it('should detect rd /s command on Windows', () => {
      const rule = detectDangerousCommand('rd /s /q "D:\\some\\path"', 'win32');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('rd-recurse-command');
    });

    it('should detect rmdir /s command on Windows', () => {
      const rule = detectDangerousCommand('rmdir /s /q C:\\temp', 'win32');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('rd-recurse-command');
    });

    it('should not detect rd /s on non-Windows', () => {
      const rule = detectDangerousCommand('rd /s /q /some/path', 'linux');
      expect(rule).toBeNull();
    });

    it('should detect cipher /w command on Windows', () => {
      const rule = detectDangerousCommand('cipher /w:C:', 'win32');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('cipher-wipe-command');
    });

    it('should detect robocopy /MIR command on Windows', () => {
      const rule = detectDangerousCommand('robocopy C:\\source C:\\dest /MIR', 'win32');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('robocopy-mirror-delete');
    });

    it('should not detect robocopy /MIRROR command on Windows (not a real robocopy switch)', () => {
      const rule = detectDangerousCommand(
        'robocopy C:\\source C:\\dest /MIRROR',
        'win32'
      );
      expect(rule).toBeNull();
    });

    it('should detect takeown command on Windows', () => {
      const rule = detectDangerousCommand('takeown /f C:\\path /r /d Y', 'win32');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('takeown-command');
    });

    it('should detect icacls /grant command on Windows', () => {
      const rule = detectDangerousCommand('icacls C:\\path /grant "*:F" /t', 'win32');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('icacls-reset-acl');
    });

    it('should detect icacls /remove command on Windows', () => {
      const rule = detectDangerousCommand('icacls C:\\path /remove "DOMAIN\\User" /t', 'win32');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('icacls-reset-acl');
    });

    it('should detect attrib -r -s -h command on Windows', () => {
      const rule = detectDangerousCommand('attrib -r -s -h C:\\file.txt', 'win32');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('attrib-hide-system');
    });

    it('should not detect attrib when no +/- attribute switch is present', () => {
      const rule = detectDangerousCommand('attrib C:\\file.txt', 'win32');
      expect(rule).toBeNull();
    });

    it('should detect mkfs command on Linux', () => {
      const rule = detectDangerousCommand('mkfs.ext4 /dev/sda1', 'linux');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('mkfs-command');
    });

    it('should detect mkfs on macOS', () => {
      const rule = detectDangerousCommand('mkfs /dev/disk1', 'darwin');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('mkfs-command');
    });

    it('should detect format command on Windows', () => {
      const rule = detectDangerousCommand('format C:', 'win32');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('format-command');
    });

    it('should not detect format on non-Windows', () => {
      const rule = detectDangerousCommand('format C:', 'linux');
      expect(rule).toBeNull();
    });

    it('should detect diskpart clean', () => {
      const rule = detectDangerousCommand(
        'diskpart\nselect disk 0\nclean',
        'win32'
      );
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('diskpart-clean');
    });
  });

  describe('Rule 2: Git checkout without stash', () => {
    it('should detect git checkout -- .', () => {
      const rule = detectDangerousCommand('git checkout -- .');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('git-checkout-without-stash');
    });

    it('should detect git checkout -- *', () => {
      const rule = detectDangerousCommand('git checkout -- *');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('git-checkout-without-stash');
    });

    it('should detect git checkout -- "*"', () => {
      const rule = detectDangerousCommand('git checkout -- "*"');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('git-checkout-without-stash');
    });

    it('should not detect regular git checkout branch switch', () => {
      const rule = detectDangerousCommand('git checkout main');
      expect(rule).toBeNull();
    });

    it('should not detect git checkout -- file path', () => {
      const rule = detectDangerousCommand('git checkout -- src/index.ts');
      expect(rule).toBeNull();
    });

    it('should detect git reset --hard', () => {
      const rule = detectDangerousCommand('git reset --hard HEAD');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('git-reset-hard');
    });

    it('should detect git reset --hard HEAD~1', () => {
      const rule = detectDangerousCommand('git reset --hard HEAD~1');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('git-reset-hard');
    });

    it('should detect git clean -f', () => {
      const rule = detectDangerousCommand('git clean -f');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('git-clean-force');
    });

    it('should detect git clean -fd', () => {
      const rule = detectDangerousCommand('git clean -fd');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('git-clean-force');
    });

    it('should detect git clean -fdx', () => {
      const rule = detectDangerousCommand('git clean -fdx');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('git-clean-force');
    });

    it('should detect git clean --force', () => {
      const rule = detectDangerousCommand('git clean --force');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('git-clean-force');
    });
  });

  describe('Rule 3: Multiple file deletion with wildcards', () => {
    it('should detect rm with wildcard *.js', () => {
      const rule = detectDangerousCommand('rm *.js');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('rm-with-wildcard');
    });

    it('should detect rm with pattern', () => {
      const rule = detectDangerousCommand('rm ./src/*.ts');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('rm-with-wildcard');
    });

    it('should detect rm with multiple files', () => {
      const rule = detectDangerousCommand('rm file1 file2 file3');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('rm-multiple-files');
    });

    it('should detect rm with multiple files even with -f option', () => {
      const rule = detectDangerousCommand('rm -f file1 file2 file3');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('rm-multiple-files');
    });

    it('should not detect rm-multiple-files when wildcard is present in any file arg', () => {
      const rule = detectDangerousCommand('rm file1 dir/*/file2 file3');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('rm-with-wildcard');
    });

    it('should detect del with wildcard on Windows', () => {
      const rule = detectDangerousCommand('del *.txt', 'win32');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('del-with-wildcard');
    });

    it('should detect find with exec rm', () => {
      const rule = detectDangerousCommand(
        'find . -name "*.js" -exec rm {} \\;'
      );
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('find-exec-rm');
    });

    it('should detect find with -delete', () => {
      const rule = detectDangerousCommand('find . -type f -name "*.log" -delete');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('find-exec-rm');
    });

    it('should detect PowerShell Remove-Item -Recurse', () => {
      const rule = detectDangerousCommand(
        'Remove-Item -Path C:\\temp -Recurse',
        'win32'
      );
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('powershell-remove-item-recurse');
    });

    it('should detect PowerShell ri -r shorthand', () => {
      const rule = detectDangerousCommand('ri -r C:\\temp', 'win32');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('powershell-remove-item-recurse');
    });

    it('should not detect PowerShell Remove-Item -Force as recursive', () => {
      const rule = detectDangerousCommand('Remove-Item -Path C:\\temp -Force', 'win32');
      expect(rule).toBeNull();
    });

    it('should detect PowerShell Remove-Item with wildcard', () => {
      const rule = detectDangerousCommand('Remove-Item -Path "*.log"', 'win32');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('powershell-remove-item-wildcard');
    });
  });

  describe('shouldAlwaysConfirmCommand', () => {
    it('should return true for dangerous commands', () => {
      expect(shouldAlwaysConfirmCommand('rm -rf /home/user')).toBe(true);
      expect(shouldAlwaysConfirmCommand('git reset --hard')).toBe(true);
      expect(shouldAlwaysConfirmCommand('rm *.js')).toBe(true);
    });

    it('should return false for safe commands', () => {
      expect(shouldAlwaysConfirmCommand('echo hello')).toBe(false);
      expect(shouldAlwaysConfirmCommand('npm install')).toBe(false);
      expect(shouldAlwaysConfirmCommand('git commit -m "test"')).toBe(false);
    });

    it('should return false for empty command', () => {
      expect(shouldAlwaysConfirmCommand('')).toBe(false);
      expect(shouldAlwaysConfirmCommand('   ')).toBe(false);
    });
  });

  describe('getDangerousCommandInfo', () => {
    it('should return rule and warning for dangerous command', () => {
      const info = getDangerousCommandInfo('rm -rf /');
      expect(info).not.toBeNull();
      expect(info?.rule.id).toBe('recursive-rm-command');
      expect(info?.warning).toContain('recursive-rm-command');
      expect(info?.warning).toContain('⚠️');
    });

    it('should return null for safe command', () => {
      const info = getDangerousCommandInfo('echo test');
      expect(info).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should handle case-insensitive matching', () => {
      const rule = detectDangerousCommand('RM -RF /some/path');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('recursive-rm-command');
    });

    it('should handle commands with extra whitespace', () => {
      const rule = detectDangerousCommand('rm  -rf  /some/path');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('recursive-rm-command');
    });

    it('should handle safe rm command without -r flag', () => {
      const rule = detectDangerousCommand('rm file.txt');
      expect(rule).toBeNull();
    });

    it('should handle rm with only -f flag', () => {
      const rule = detectDangerousCommand('rm -f file.txt');
      expect(rule).toBeNull();
    });

    it('should detect git reset --hard even with additional args', () => {
      const rule = detectDangerousCommand('git reset --hard HEAD~5');
      expect(rule).not.toBeNull();
      expect(rule?.id).toBe('git-reset-hard');
    });

    it('should not match git reset without --hard', () => {
      const rule = detectDangerousCommand('git reset HEAD~1');
      expect(rule).toBeNull();
    });
  });

  describe('Platform-specific rules', () => {
    it('should only apply Windows rules on win32', () => {
      const rule = detectDangerousCommand('del /s test', 'win32');
      expect(rule).not.toBeNull();

      const ruleLinux = detectDangerousCommand('del /s test', 'linux');
      expect(ruleLinux).toBeNull();
    });

    it('should only apply Linux rules on linux', () => {
      const rule = detectDangerousCommand('mkfs /dev/sda1', 'linux');
      expect(rule).not.toBeNull();

      const ruleWin = detectDangerousCommand('mkfs /dev/sda1', 'win32');
      expect(ruleWin).toBeNull();
    });

    it('should only apply macOS rules on darwin', () => {
      const rule = detectDangerousCommand('mkfs /dev/disk1', 'darwin');
      expect(rule).not.toBeNull();

      const ruleWin = detectDangerousCommand('mkfs /dev/disk1', 'win32');
      expect(ruleWin).toBeNull();
    });

    it('should apply cross-platform rules on all platforms', () => {
      const platforms: ('linux' | 'darwin' | 'win32')[] = ['linux', 'darwin', 'win32'];
      for (const platform of platforms) {
        const rule = detectDangerousCommand('git reset --hard', platform);
        expect(rule).not.toBeNull();
        expect(rule?.id).toBe('git-reset-hard');
      }
    });
  });
});
