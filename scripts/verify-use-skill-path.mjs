#!/usr/bin/env node
/**
 * 验证 use_skill 工具的路径解析
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 验证 use_skill 工具路径解析\n');

// 模拟从 packages/core/dist/src/tools/ 的位置
const mockToolPath = path.join(__dirname, '../packages/core/dist/src/tools');

// 计算到 skill index 的路径
const relativePathToSkill = '../../../../cli/dist/src/services/skill/index.js';
const absolutePathToSkill = path.resolve(mockToolPath, relativePathToSkill);

console.log('📂 路径信息:');
console.log(`  工具位置: ${mockToolPath}`);
console.log(`  相对路径: ${relativePathToSkill}`);
console.log(`  解析结果: ${absolutePathToSkill}`);
console.log();

// 检查文件是否存在
const exists = fs.existsSync(absolutePathToSkill);
console.log(`✅ 文件存在: ${exists ? '是' : '否'}`);

if (exists) {
  console.log('\n✅ 路径解析正确！use_skill 工具可以正常加载 Skills 系统模块。');
} else {
  console.log('\n❌ 路径解析错误！需要检查相对路径。');
  console.log(`期望文件: ${absolutePathToSkill}`);
  process.exit(1);
}
