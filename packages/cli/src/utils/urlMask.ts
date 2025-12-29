/**
 * URL掩码工具函数
 * 用于在日志中隐藏敏感的API URL信息
 */

/**
 * 掩码URL，保留域名但隐藏完整路径
 * @param url - 要掩码的URL
 * @returns 掩码后的URL字符串
 */
export function maskUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol;
    const hostname = urlObj.hostname;

    // 保留协议和主机名，但用***替代路径和查询参数
    return `${protocol}//${hostname}/***`;
  } catch (error) {
    // 如果URL解析失败，简单地用***替代中间部分
    return url.replace(/\/\/[^\/]+\/.*/, '//***');
  }
}

/**
 * 掩码服务器URL，用于云端模式启动日志
 * @param serverUrl - 服务器URL
 * @returns 掩码后的字符串
 */
export function maskServerUrl(serverUrl: string): string {
  try {
    const urlObj = new URL(serverUrl);
    return `${urlObj.protocol}//${urlObj.hostname}`;
  } catch (error) {
    return '***';
  }
}

/**
 * 掩码邮箱地址，保留第一个和最后一个字符
 * @param email - 邮箱地址
 * @returns 掩码后的邮箱字符串
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) {
    return email;
  }

  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return email;
  }

  const masked = local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
  return `${masked}@${domain}`;
}