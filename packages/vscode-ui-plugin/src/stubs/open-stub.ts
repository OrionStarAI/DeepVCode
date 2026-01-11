/**
 * Stub for 'open' package in VSCode extension environment.
 *
 * The 'open' package uses import.meta.url internally which causes cross-platform
 * build issues (paths are baked in at build time).
 *
 * In VSCode extension, we should use vscode.env.openExternal() instead.
 * This stub provides a no-op implementation to prevent build errors.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function open(target: string, _options?: unknown): Promise<unknown> {
  console.warn(
    `[VSCode Extension] 'open' package called with: ${target}. ` +
      'This is a stub. Use vscode.env.openExternal() in VSCode extension context.',
  );
  // Return a mock child process object
  return {
    pid: -1,
    kill: () => false,
    on: () => {},
    once: () => {},
    emit: () => false,
    addListener: () => {},
    removeListener: () => {},
  };
}

export default open;

// Also export named for compatibility
export { open };
