/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { Icons } from './IconAssets';
import { FolderIcon } from './MenuIcons';

// Helper to render the icon
const IconImg = ({ src, alt }: { src: string; alt: string }) => (
  <img
    src={src}
    alt={alt}
    className="file-icon-img"
    style={{ width: '16px', height: '16px', display: 'block' }}
  />
);

const extMap: Record<string, string> = {
  'ts': 'file_type_typescript',
  'tsx': 'file_type_reactts',
  'js': 'file_type_js',
  'jsx': 'file_type_reactjs',
  'mjs': 'file_type_js',
  'cjs': 'file_type_js',
  'py': 'file_type_python',
  'html': 'file_type_html',
  'css': 'file_type_css',
  'json': 'file_type_json',
  'md': 'file_type_markdown',
  'markdown': 'file_type_markdown',
  'java': 'file_type_java',
  'c': 'file_type_c',
  'cpp': 'file_type_cpp',
  'h': 'file_type_c',
  'hpp': 'file_type_cpp',
  'go': 'file_type_go',
  'rs': 'file_type_rust',
  'vue': 'file_type_vue',
  'dockerfile': 'file_type_docker',
  'yml': 'file_type_yaml',
  'yaml': 'file_type_yaml',
  'xml': 'file_type_xml',
  'sh': 'file_type_shell',
  'bash': 'file_type_shell',
  'zsh': 'file_type_shell',
  'sql': 'file_type_sql',
  'php': 'file_type_php',
  'cs': 'file_type_csharp',
  'rb': 'file_type_ruby',
  'swift': 'file_type_swift',
  'kt': 'file_type_kotlin',
  'dart': 'file_type_dart',
  'lua': 'file_type_lua',
  'pl': 'file_type_perl',
  'r': 'file_type_r',
  'ex': 'file_type_elixir',
  'hs': 'file_type_haskell',
  'zip': 'file_type_zip',
  'pdf': 'file_type_pdf',
  'txt': 'file_type_text',
  'png': 'file_type_image',
  'jpg': 'file_type_image',
  'jpeg': 'file_type_image',
  'gif': 'file_type_image',
  'svg': 'file_type_image',
  'ico': 'file_type_image',
  'webp': 'file_type_image',
  'mp4': 'file_type_video',
  'mp3': 'file_type_audio',
  'wav': 'file_type_audio',
  'ttf': 'file_type_font',
  'otf': 'file_type_font',
  'woff': 'file_type_font',
  'exe': 'file_type_binary',
  'bin': 'file_type_binary',
  'dll': 'file_type_binary',
};

const fileMap: Record<string, string> = {
  'package.json': 'file_type_npm',
  'package-lock.json': 'file_type_npm',
  'tsconfig.json': 'file_type_typescript',
  'dockerfile': 'file_type_docker',
  '.gitignore': 'file_type_git',
  '.gitattributes': 'file_type_git',
  '.env': 'file_type_config',
  'readme.md': 'file_type_markdown',
};

export function getFileIcon(fileName: string): React.ReactNode {
  const lowerName = fileName.toLowerCase();

  // 1. Specific filename
  if (fileMap[lowerName] && Icons[fileMap[lowerName]]) {
    return <IconImg src={Icons[fileMap[lowerName]]} alt={lowerName} />;
  }

  // 2. Extension
  const parts = lowerName.split('.');
  const ext = parts.length > 1 ? parts.pop() : '';

  if (ext && extMap[ext] && Icons[extMap[ext]]) {
    return <IconImg src={Icons[extMap[ext]]} alt={ext} />;
  }

  // 3. Fallback
  return <IconImg src={Icons['default_file']} alt="file" />;
}

// 🎯 文件夹图标映射
const folderMap: Record<string, string> = {
  'src': 'folder_type_src',
  'dist': 'folder_type_dist',
  'build': 'folder_type_dist',
  'node_modules': 'folder_type_node',
  'packages': 'folder_type_package',
  'components': 'folder_type_component',
  'assets': 'folder_type_assets',
  'images': 'folder_type_images',
  'img': 'folder_type_images',
  'styles': 'folder_type_css',
  'css': 'folder_type_css',
  'utils': 'folder_type_utils',
  'lib': 'folder_type_lib',
  'test': 'folder_type_test',
  'tests': 'folder_type_test',
  '__tests__': 'folder_type_test',
  'docs': 'folder_type_docs',
  'config': 'folder_type_config',
  '.git': 'folder_type_git',
  '.vscode': 'folder_type_vscode',
  'public': 'folder_type_public',
  'api': 'folder_type_api',
  'services': 'folder_type_services',
  'hooks': 'folder_type_hook',
  'types': 'folder_type_typescript',
};

export function getFolderIcon(folderName: string): React.ReactNode {
  const lowerName = folderName.toLowerCase().replace(/\/$/, ''); // 移除尾部斜杠

  // 1. 特定文件夹名
  if (folderMap[lowerName] && Icons[folderMap[lowerName]]) {
    return <IconImg src={Icons[folderMap[lowerName]]} alt={lowerName} />;
  }

  // 2. 默认文件夹图标
  if (Icons['default_folder']) {
    return <IconImg src={Icons['default_folder']} alt="folder" />;
  }

  // 3. 使用 MenuIcons 的 FolderIcon 作为 fallback（避免 emoji）
  return <FolderIcon />;
}
