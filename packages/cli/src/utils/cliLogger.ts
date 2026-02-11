import process from 'node:process';

const env = process?.env ?? {};
const rawLevel = env.DEEPV_LOG_LEVEL?.toLowerCase();
const debugEnabled =
  rawLevel === 'debug' ||
  rawLevel === 'trace' ||
  env.DEBUG === '1' ||
  env.DEBUG === 'true' ||
  env.FILE_DEBUG === '1' ||
  env.FILE_DEBUG === 'true' ||
  env.DEEPV_DEBUG === '1' ||
  env.DEEPV_DEBUG === 'true';

export function logDebug(message: string, ...args: unknown[]): void {
  if (!debugEnabled) {
    return;
  }
  if (args.length > 0) {
    console.debug('[DEBUG]', message, ...args);
    return;
  }
  console.debug('[DEBUG]', message);
}
