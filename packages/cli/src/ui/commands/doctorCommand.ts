import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { getCliVersion } from '../../utils/version.js';
import { CommandKind, SlashCommand } from './types.js';
import { t } from '../utils/i18n.js';

function formatCheck(label: string, ok: boolean, detail?: string): string {
  const status = ok ? 'ok' : 'missing';
  if (detail) {
    return `- ${label}: ${status} (${detail})`;
  }
  return `- ${label}: ${status}`;
}

export const doctorCommand: SlashCommand = {
  name: 'doctor',
  description: t('command.doctor.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
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

    const lines = [
      'DeepV Code Doctor',
      `- CLI version: ${cliVersion}`,
      `- Node: ${process.version}`,
      `- Platform: ${process.platform} ${process.arch}`,
      `- Project root: ${projectRoot}`,
      `- Auth type: ${settings.selectedAuthType ?? 'not configured'}`,
      `- Server URL: ${process.env.DEEPX_SERVER_URL ?? 'default'}`,
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

    return {
      type: 'message',
      messageType: 'info',
      content: lines.join('\n'),
    };
  },
};
