/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 危险命令检测器
 * 用于识别可能造成数据丢失或系统损害的shell命令
 * 这些命令即使在YOLO模式下也必须强制确认
 */

export interface DangerousCommandRule {
  /** 规则唯一标识符 */
  id: string;
  /** 规则描述 */
  description: string;
  /** 匹配模式 */
  pattern: RegExp;
  /** 是否跨平台（true表示在所有平台上适用） */
  crossPlatform: boolean;
  /** 适用的平台（如果crossPlatform为false） */
  platforms?: ('win32' | 'linux' | 'darwin')[];
  /** 检测到时的提示信息 */
  warningMessage: string;
}

/**
 * 危险命令规则库
 */
const DANGEROUS_COMMAND_RULES: DangerousCommandRule[] = [
  // ============== 规则1: 递归删除文件 ==============
  {
    id: 'recursive-rm-command',
    description: '递归删除文件命令 (rm -rf)',
    // 匹配: rm -rf / rm -r / rm --recursive 等
    pattern: /\brm\s+(?:-[a-z]*[rR][a-z]*|--recursive)/i,
    crossPlatform: true,
    warningMessage:
      '⚠️ 这是一个递归删除命令。可能导致大量文件丢失。必须确认。',
  },

  {
    id: 'del-recurse-command',
    description: '递归删除文件命令 (del /s)',
    // 匹配: del /s /q 等 Windows命令
    pattern: /\bdel(?:ete)?\s+(?:.*\/[sS]|\/[sS])/i,
    crossPlatform: false,
    platforms: ['win32'],
    warningMessage:
      '⚠️ 这是一个Windows递归删除命令。可能导致大量文件丢失。必须确认。',
  },

  {
    id: 'rd-recurse-command',
    description: '递归删除目录命令 (rd /s 或 rmdir /s)',
    // 匹配: rd /s / rmdir /s / rd /s /q 等 Windows命令
    pattern: /\b(?:rd|rmdir)\s+(?:.*\/[sS]|\/[sS])/i,
    crossPlatform: false,
    platforms: ['win32'],
    warningMessage:
      '⚠️ 这是一个Windows递归删除目录命令（rd/rmdir /s）。可能导致大量文件丢失。必须确认。',
  },

  {
    id: 'diskpart-clean',
    description: '磁盘分区格式化命令',
    // 匹配: diskpart ... clean 等（支持多行）
    pattern: /\bdiskpart\b[\s\S]*\bclean\b/i,
    crossPlatform: false,
    platforms: ['win32'],
    warningMessage:
      '⚠️ 这是一个磁盘格式化命令。会导致数据完全丢失。必须确认。',
  },

  {
    id: 'mkfs-command',
    description: '文件系统格式化命令 (mkfs)',
    // 匹配: mkfs, mkfs.ext4 等
    pattern: /\bmkfs(?:\.\w+)?\b/i,
    crossPlatform: false,
    platforms: ['linux', 'darwin'],
    warningMessage:
      '⚠️ 这是一个文件系统格式化命令。会导致分区数据完全丢失。必须确认。',
  },

  {
    id: 'format-command',
    description: '磁盘格式化命令 (format)',
    // 匹配: format C: / format D: 等
    pattern: /\bformat\s+[A-Z]:/i,
    crossPlatform: false,
    platforms: ['win32'],
    warningMessage:
      '⚠️ 这是一个磁盘格式化命令。会导致该分区数据完全丢失。必须确认。',
  },

  {
    id: 'cipher-wipe-command',
    description: 'cipher /w 命令覆盖删除',
    // 匹配: cipher /w:C: 或 cipher /w 等（覆盖写入，破坏数据恢复）
    pattern: /\bcipher\s+(?:.*\/[wW]|\/[wW])/i,
    crossPlatform: false,
    platforms: ['win32'],
    warningMessage:
      '⚠️ 这是一个cipher /w命令，会覆盖写入磁盘以清除已删除文件的痕迹。必须确认。',
  },

  {
    id: 'robocopy-mirror-delete',
    description: 'robocopy /MIR 镜像删除命令',
    // 匹配: robocopy source dest /MIR 等（删除dest中source不存在的文件）
    pattern: /\brobocopy\b.*\/(?:MIR|MIRROR)/i,
    crossPlatform: false,
    platforms: ['win32'],
    warningMessage:
      '⚠️ 这是一个robocopy /MIR命令，会删除目标目录中源目录不存在的所有文件。必须确认。',
  },

  {
    id: 'takeown-command',
    description: 'takeown 命令修改文件所有权',
    // 匹配: takeown /f 等（修改文件所有权，可能导致无法访问）
    pattern: /\btakeown\b/i,
    crossPlatform: false,
    platforms: ['win32'],
    warningMessage:
      '⚠️ 这是一个takeown命令，会修改文件/文件夹的所有权。必须确认。',
  },

  {
    id: 'icacls-reset-acl',
    description: 'icacls 命令修改文件权限',
    // 匹配: icacls * /grant 或 icacls * /remove 等（递归修改权限）
    pattern: /\bicacls\b(?:.*\/(?:grant|deny|remove|reset|inheritance))/i,
    crossPlatform: false,
    platforms: ['win32'],
    warningMessage:
      '⚠️ 这是一个icacls命令，会修改文件的访问控制列表。必须确认。',
  },

  {
    id: 'attrib-hide-system',
    description: 'attrib 命令修改文件属性',
    // 匹配: attrib -r -s -h 等（移除文件属性）
    pattern: /\battrib\b.*(?:\s+-[rsh]|\s+[rsh])/i,
    crossPlatform: false,
    platforms: ['win32'],
    warningMessage:
      '⚠️ 这是一个attrib命令，会修改文件的系统属性。必须确认。',
  },

  // ============== 规则2: git checkout大量文件且未stash ==============
  {
    id: 'git-checkout-without-stash',
    description: 'git checkout 大量文件且未先stash',
    // 匹配: git checkout -- . 或 git checkout -- * 等
    pattern: /\bgit\s+checkout\s+(?:--\s+)?[.*]/i,
    crossPlatform: true,
    warningMessage:
      '⚠️ 这是一个git checkout命令，将丢弃本地修改。建议先运行 git stash 保存你的修改。必须确认。',
  },

  {
    id: 'git-reset-hard',
    description: 'git reset --hard 命令',
    // 匹配: git reset --hard 等
    pattern: /\bgit\s+reset\s+--hard\b/i,
    crossPlatform: true,
    warningMessage:
      '⚠️ 这是一个git reset --hard命令，将丢弃所有本地修改。必须确认。',
  },

  {
    id: 'git-clean-force',
    description: 'git clean -f 强制删除未追踪文件',
    // 匹配: git clean -f / git clean -fd / git clean -fdx 等
    pattern: /\bgit\s+clean\s+(?:-[a-z]*[fF][a-z]*|--force)/i,
    crossPlatform: true,
    warningMessage:
      '⚠️ 这是一个git clean -f命令，将删除未追踪的文件。必须确认。',
  },

  // ============== 规则3: 一次性删除多个文件、或使用正则、通配符删除 ==============
  // 注意：顺序很重要，rm-multiple-files 要在 rm-with-wildcard 之前

  {
    id: 'rm-multiple-files',
    description: 'rm 命令删除多个文件路径（无通配符）',
    // 匹配: rm /path/file1 /path/file2 /path/file3 等（至少3个不含通配符的参数）
    pattern: /\brm\b(?:\s+[^\s*?[\]][^\s;]*){3,}/,
    crossPlatform: true,
    warningMessage:
      '⚠️ 这个rm命令删除多个文件。必须确认。',
  },

  {
    id: 'rm-with-wildcard',
    description: 'rm 命令使用通配符删除多个文件',
    // 匹配: rm [pattern]/*.ext 等含有通配符
    // 通配符: *, ?, [...]
    pattern: /\brm\b[^;]*[*?[\]]/,
    crossPlatform: true,
    warningMessage:
      '⚠️ 这是一个使用通配符的rm命令。可能导致大量文件丢失。必须确认。',
  },

  {
    id: 'del-with-wildcard',
    description: 'del 命令使用通配符删除多个文件',
    // 匹配: del *.ext 等
    pattern: /\bdel(?:ete)?\b[^;]*[*?]/i,
    crossPlatform: false,
    platforms: ['win32'],
    warningMessage:
      '⚠️ 这是一个使用通配符的del命令。可能导致大量文件丢失。必须确认。',
  },

  {
    id: 'find-exec-rm',
    description: 'find ... -exec rm 删除匹配文件',
    // 匹配: find . -name "*.js" -exec rm 等
    pattern: /\bfind\b.*(?:-exec\s+rm|-delete)/i,
    crossPlatform: true,
    warningMessage:
      '⚠️ 这是一个find命令配合rm执行，将删除符合条件的文件。必须确认。',
  },

  {
    id: 'powershell-remove-item-recurse',
    description: 'PowerShell Remove-Item 递归删除',
    // 匹配: Remove-Item -Path ... -Recurse 或 ri -r 等（包括简写-r）
    pattern: /\b(?:Remove-Item|ri)\b.*(?:-[a-zA-Z]*[rR](?:ecurse)?|-Recurse)/i,
    crossPlatform: false,
    platforms: ['win32'],
    warningMessage:
      '⚠️ 这是一个PowerShell递归删除命令。可能导致大量文件丢失。必须确认。',
  },

  {
    id: 'powershell-remove-item-wildcard',
    description: 'PowerShell Remove-Item 使用通配符',
    // 匹配: Remove-Item -Path "*.ext" 等
    pattern: /\b(?:Remove-Item|ri)\b.*[*?]/i,
    crossPlatform: false,
    platforms: ['win32'],
    warningMessage:
      '⚠️ 这是一个PowerShell命令，使用通配符删除文件。必须确认。',
  },
];

/**
 * 检测命令是否危险
 * @param command 要检查的shell命令
 * @param platform 当前平台 (默认为 process.platform)
 * @returns 如果是危险命令，返回匹配的规则；否则返回null
 */
export function detectDangerousCommand(
  command: string,
  platform: string = process.platform,
): DangerousCommandRule | null {
  if (!command || !command.trim()) {
    return null;
  }

  for (const rule of DANGEROUS_COMMAND_RULES) {
    // 检查平台是否匹配
    if (!rule.crossPlatform && rule.platforms) {
      if (!rule.platforms.includes(platform as any)) {
        continue;
      }
    }

    // 检查命令是否匹配规则
    if (rule.pattern.test(command)) {
      return rule;
    }
  }

  return null;
}

/**
 * 检查命令是否应该强制确认（跳过YOLO模式）
 * @param command 要检查的shell命令
 * @param platform 当前平台
 * @returns true表示必须强制确认，false表示可以跳过
 */
export function shouldAlwaysConfirmCommand(
  command: string,
  platform: string = process.platform,
): boolean {
  return detectDangerousCommand(command, platform) !== null;
}

/**
 * 获取命令的危险原因和警告信息
 * @param command 要检查的shell命令
 * @param platform 当前平台
 * @returns 包含规则和警告的对象，或null
 */
export function getDangerousCommandInfo(
  command: string,
  platform: string = process.platform,
): { rule: DangerousCommandRule; warning: string } | null {
  const rule = detectDangerousCommand(command, platform);
  if (!rule) {
    return null;
  }

  return {
    rule,
    warning: `[${rule.id}] ${rule.description}: ${rule.warningMessage}`,
  };
}

/**
 * 添加自定义规则
 * 注意：这应该谨慎使用，通常在应用启动时调用
 */
export function addCustomDangerousCommandRule(rule: DangerousCommandRule): void {
  // 检查是否已存在相同ID的规则
  const existingIndex = DANGEROUS_COMMAND_RULES.findIndex(
    (r) => r.id === rule.id,
  );
  if (existingIndex >= 0) {
    DANGEROUS_COMMAND_RULES[existingIndex] = rule;
  } else {
    DANGEROUS_COMMAND_RULES.push(rule);
  }
}

/**
 * 获取所有规则（用于调试、测试、UI展示）
 */
export function getAllDangerousCommandRules(): DangerousCommandRule[] {
  return [...DANGEROUS_COMMAND_RULES];
}
