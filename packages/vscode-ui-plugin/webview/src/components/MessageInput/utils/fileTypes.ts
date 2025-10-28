/**
 * 文件上传相关的类型定义和常量
 */

export enum FileType {
  IMAGE = 'image',
  TEXT = 'text',  // 统一包含：Markdown + 代码文件
}

// 支持的文本文件扩展名（代码 + Markdown）
export const SUPPORTED_TEXT_EXTENSIONS = [
  // TypeScript/JavaScript
  'ts', 'tsx', 'js', 'jsx',
  // Python
  'py', 'pyw',
  // JVM Languages
  'java', 'kt', 'scala',
  // System Languages
  'go', 'rs', 'cpp', 'c', 'h', 'hpp',
  // Other Languages
  'php', 'rb', 'swift', 'cs',
  // Shell Scripts
  'sh', 'bash', 'zsh', 'fish',
  // Configuration Files
  'json', 'yaml', 'yml', 'xml', 'toml',
  // Web Files
  'html', 'css', 'scss', 'less', 'vue',
  // Database
  'sql',
  // Markdown
  'md', 'markdown',
];

export const SUPPORTED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

// 编程语言映射（用于标注语言类型）
export const LANGUAGE_MAP: Record<string, string> = {
  'ts': 'TypeScript',
  'tsx': 'TypeScript',
  'js': 'JavaScript',
  'jsx': 'JavaScript',
  'py': 'Python',
  'java': 'Java',
  'go': 'Go',
  'rs': 'Rust',
  'cpp': 'C++',
  'c': 'C',
  'h': 'C Header',
  'hpp': 'C++ Header',
  'php': 'PHP',
  'rb': 'Ruby',
  'swift': 'Swift',
  'cs': 'C#',
  'kt': 'Kotlin',
  'scala': 'Scala',
  'sh': 'Shell',
  'bash': 'Bash',
  'zsh': 'Zsh',
  'fish': 'Fish',
  'json': 'JSON',
  'yaml': 'YAML',
  'yml': 'YAML',
  'xml': 'XML',
  'toml': 'TOML',
  'html': 'HTML',
  'css': 'CSS',
  'scss': 'SCSS',
  'less': 'LESS',
  'vue': 'Vue',
  'sql': 'SQL',
  'md': 'Markdown',
  'markdown': 'Markdown',
};

// 统一的文件引用结果接口
export interface FileUploadResult {
  type: FileType;
  id: string;
  fileName: string;
  size: number;

  // 图片数据（仅当 type === IMAGE 时存在）
  imageData?: {
    data: string;           // base64
    mimeType: string;
    originalSize: number;
    compressedSize: number;
    width?: number;
    height?: number;
  };

  // 文本数据（仅当 type === TEXT 时存在）
  textData?: {
    content: string;
    language?: string;      // 代码语言或 'Markdown'
    encoding: string;
  };
}
