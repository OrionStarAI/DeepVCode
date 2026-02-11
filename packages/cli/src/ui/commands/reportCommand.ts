import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { getCliVersion } from '../../utils/version.js';
import { copyToClipboard } from '../utils/commandUtils.js';
import { CommandKind, SlashCommand } from './types.js';
import { t } from '../utils/i18n.js';

type ReportOptions = {
  copy: boolean;
  full: boolean;
};

const parseReportOptions = (args: string): ReportOptions => {
  const tokens = args.split(/\s+/).filter(Boolean);
  let copy = true;
  let full = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '--no-copy') {
      copy = false;
      continue;
    }
    if (token === '--copy') {
      copy = true;
      continue;
    }
    if (token === '--full') {
      full = true;
    }
  }

  return { copy, full };
};

const formatCheck = (label: string, ok: boolean, detail?: string): string => {
  const status = ok ? 'ok' : 'missing';
  if (detail) {
    return `- ${label}: ${status} (${detail})`;
  }
  return `- ${label}: ${status}`;
};

const formatRecentLines = (title: string, items: string[]): string => {
  if (items.length === 0) {
    return `${title}: (none)`;
  }
  return [title, ...items.map((item) => `- ${item}`)].join('\n');
};

export const reportCommand: SlashCommand = {
  name: 'report',
  description: t('command.report.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const options = parseReportOptions(args);
    const cliVersion = await getCliVersion();
    const config = context.services.config;
    const projectRoot = config?.getProjectRoot() ?? process.cwd();
    const settings = context.services.settings.merged;

    const cliBuildStamp = path.join(
      projectRoot,
      'packages',
      'cli',
      'dist',
      '.last_build',
    );
    const coreBuildStamp = path.join(
      projectRoot,
      'packages',
      'core',
      'dist',
      '.last_build',
    );
    const genaiTypes = path.join(
      projectRoot,
      'node_modules',
      '@google',
      'genai',
      'dist',
      'genai.d.ts',
    );

    const reportLines: string[] = [
      '# DeepV Code Report',
      '',
      '## Environment',
      `- CLI version: ${cliVersion}`,
      `- Node: ${process.version}`,
      `- Platform: ${process.platform} ${process.arch}`,
      `- Project root: ${projectRoot}`,
      `- Auth type: ${settings.selectedAuthType ?? 'not configured'}`,
      `- Server URL: ${process.env.DEEPX_SERVER_URL ?? 'default'}`,
      '',
      '## Build & Dependencies',
      formatCheck(
        'CLI build stamp',
        fs.existsSync(cliBuildStamp),
        'packages/cli/dist/.last_build',
      ),
      formatCheck(
        'Core build stamp',
        fs.existsSync(coreBuildStamp),
        'packages/core/dist/.last_build',
      ),
      formatCheck(
        'GenAI types',
        fs.existsSync(genaiTypes),
        'node_modules/@google/genai/dist/genai.d.ts',
      ),
    ];

    if (options.full) {
      const recentErrors = (context.ui.history ?? [])
        .filter((item) => item.type === 'error' && item.text)
        .slice(-5)
        .map((item) => item.text ?? '');

      const recentDebug = (context.ui.debugMessages ?? [])
        .slice(-5)
        .map((item) => item.content ?? '')
        .filter((item) => item);

      reportLines.push(
        '',
        '## Recent Errors',
        formatRecentLines('Errors', recentErrors),
        '',
        '## Recent Debug Messages',
        formatRecentLines('Debug', recentDebug),
      );
    }

    const report = reportLines.join('\n');

    if (options.copy) {
      try {
        await copyToClipboard(report);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error ?? 'unknown');
        return {
          type: 'message',
          messageType: 'error',
          content: `${t('command.report.copy_failed')} ${message}`,
        };
      }
    }

    return {
      type: 'message',
      messageType: 'info',
      content: options.copy
        ? `${report}\n\n${t('command.report.copied')}`
        : report,
    };
  },
};
