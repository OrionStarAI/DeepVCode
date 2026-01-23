/**
 * Git URL Normalizer
 *
 * Converts GitHub shorthand (owner/repo) to full Git URLs
 */

/**
 * 转换 GitHub 简短形式为完整 URL
 * 例如：owner/repo → https://github.com/owner/repo.git
 *
 * @param input - 输入可能是以下格式之一：
 *   - 完整 URL: https://github.com/owner/repo.git
 *   - GitHub 简短形式: owner/repo
 *   - 本地路径: /path/to/repo 或 .\path\to\repo
 *
 * @returns 转换后的 URL 或路径
 *   - GitHub 简短形式 → 完整 GitHub URL
 *   - 其他格式 → 原样返回
 */
export function normalizeGitHubUrl(input: string): string {
  // 如果已经以协议开头，直接返回
  if (input.startsWith('http://') || input.startsWith('https://') || input.startsWith('git@')) {
    return input;
  }

  // 处理 github.com/owner/repo 格式
  if (input.startsWith('github.com/') || input.startsWith('www.github.com/')) {
    return `https://${input}${input.endsWith('.git') ? '' : '.git'}`;
  }

  // 如果是本地路径（包含路径分隔符或以 . / 开始），不转换
  // 注意：Windows 下包含 \，POSIX 下以 / 开始，或以 . 开始
  if (input.includes('\\') || input.startsWith('.') || input.startsWith('/')) {
    return input;
  }

  // 检查是否是 GitHub 简短形式 (owner/repo)
  // owner: 字母、数字、连字符组成，不能以连字符开始或结尾
  // repo: 字母、数字、下划线、点号、连字符组成
  const githubShortPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\/[a-zA-Z0-9._-]+$/;
  if (githubShortPattern.test(input)) {
    const suffix = input.endsWith('.git') ? '' : '.git';
    return `https://github.com/${input}${suffix}`;
  }

  // 其他情况作为本地路径返回
  return input;
}
