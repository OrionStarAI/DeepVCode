/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import open from 'open';
import process from 'node:process';
import { getCliVersion } from '../../utils/version.js';
import { t, tp } from '../utils/i18n.js';
import {
  CommandContext,
  CommandKind,
  MessageActionReturn,
  SlashCommand,
} from './types.js';

const ISSUE_URL = 'https://github.com/OrionStarAI/DeepVCode/issues/new';

const maskSensitiveInfo = (input: string): string => {
  const replacements: Array<[RegExp, string]> = [
    [/bearer\s+[A-Za-z0-9._\-+/=]+/gi, 'Bearer *'],
    [/(api[_-]?key|secret|token|password)\s*[:=]\s*['"]?[^\s'"\\]+/gi, '$1=*'],
    [/sk-[A-Za-z0-9]{8,}/g, 'sk-*'],
    [/ghp_[A-Za-z0-9]{8,}/g, 'ghp_*'],
    [/AKIA[0-9A-Z]{8,}/g, 'AKIA*'],
    [/\b[0-9a-f]{32,}\b/gi, '*'],
  ];

  return replacements.reduce((text, [pattern, replacement]) => {
    return text.replace(pattern, replacement);
  }, input);
};

const buildErrorLogSection = (context: CommandContext): string => {
  const errorLogs = (context.ui.debugMessages || [])
    .filter((msg) => msg.type === 'error')
    .map((msg) => `#${msg.count || 1}\n${maskSensitiveInfo(msg.content)}`)
    .join('\n\n');

  if (!errorLogs) {
    return `\n\n${t('command.issue.no_error_logs')}`;
  }

  return `\n\n\`\`\`\n${errorLogs}\n\`\`\``;
};

const buildIssueTitle = (description: string): string => {
  const firstLine = description.split(/\r?\n/)[0].trim();
  return firstLine.slice(0, 80) || t('command.issue.default_title');
};

const formatDescription = (description: string): string => {
  return description.replace(/^\s+|\s+$/g, '');
};

const getRuntimeInfo = (): string => {
  const versions = process.versions as Record<string, string | undefined>;
  if (versions.bun) {
    return `- Runtime: Bun ${versions.bun}`;
  }
  const nodeVersion = versions.node || process.version;
  return `- Runtime: Node ${nodeVersion}`;
};

const buildIssueBody = async (
  context: CommandContext,
  description: string,
): Promise<string> => {
  const cliVersion = await getCliVersion();
  const envInfo = [
    `- CLI: ${cliVersion}`,
    `- OS: ${process.platform}`,
    getRuntimeInfo(),
  ].join('\n');

  const normalizedDescription = formatDescription(description);

  return [
    `## ${t('command.issue.section.description')}\n${normalizedDescription}`,
    `## ${t('command.issue.section.environment')}\n${envInfo}`,
    `## ${t('command.issue.section.error_logs')}${buildErrorLogSection(context)}`,
  ].join('\n\n');
};

export const issueCommand: SlashCommand = {
  name: 'issue',
  description: t('command.issue.description'),
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<MessageActionReturn> => {
    const description = formatDescription(args);
    if (!description) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('command.issue.missing_description'),
      };
    }

    const title = buildIssueTitle(description);
    const body = await buildIssueBody(context, description);
    const issueUrl = `${ISSUE_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;

    if (process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec') {
      return {
        type: 'message',
        messageType: 'info',
        content: tp('command.issue.open.manual', { url: issueUrl }),
      };
    }

    try {
      await open(issueUrl);
      return {
        type: 'message',
        messageType: 'info',
        content: t('command.issue.opening'),
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: tp('command.issue.open.failed', {
          error: error instanceof Error ? error.message : String(error),
        }),
      };
    }
  },
};
