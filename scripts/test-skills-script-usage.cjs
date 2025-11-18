#!/usr/bin/env node
/**
 * Skills 脚本使用测试验证
 *
 * 验证 AI 是否能正确识别和使用 Skill 提供的脚本
 */

const path = require('path');
const fs = require('fs-extra');
const os = require('os');

// 测试配置
const TEST_SKILL_DIR = path.join(os.homedir(), '.deepv', 'skills', 'test-pdf-skill');

async function setupTestSkill() {
  console.log('📦 Setting up test skill...\n');

  // 创建目录结构
  await fs.ensureDir(path.join(TEST_SKILL_DIR, 'scripts'));

  // 创建 SKILL.md
  const skillMd = `---
name: test-pdf
description: Test PDF processing skill with ready-to-use scripts for form filling and data extraction
allowed-tools:
  - run_shell_command
  - read_file
  - write_file
---

# Test PDF Processing Skill

This skill provides tested scripts for PDF manipulation tasks.

## Quick Start

**IMPORTANT**: Use the provided scripts instead of writing new code.

### Fill PDF Form

Use \`fill_form.py\` to fill form fields in a PDF:

\`\`\`bash
python3 scripts/fill_form.py input.pdf fields.json output.pdf
\`\`\`

### Extract Form Data

Use \`extract_data.py\` to extract form field information:

\`\`\`bash
python3 scripts/extract_data.py input.pdf output.json
\`\`\`

## Parameters

### fill_form.py
- \`input.pdf\`: Source PDF file path
- \`fields.json\`: JSON file with field values
- \`output.pdf\`: Output file path

### extract_data.py
- \`input.pdf\`: Source PDF file path
- \`output.json\`: Output JSON file path
`;

  await fs.writeFile(path.join(TEST_SKILL_DIR, 'SKILL.md'), skillMd);

  // 创建测试脚本 1: fill_form.py
  const fillFormScript = `#!/usr/bin/env python3
"""
PDF Form Fill Script
Simulates filling a PDF form with provided data
"""
import sys
import json

if len(sys.argv) != 4:
    print("Usage: fill_form.py <input.pdf> <fields.json> <output.pdf>")
    sys.exit(1)

input_pdf = sys.argv[1]
fields_json = sys.argv[2]
output_pdf = sys.argv[3]

print(f"✅ PDF Form Filling Script")
print(f"   Input: {input_pdf}")
print(f"   Fields: {fields_json}")
print(f"   Output: {output_pdf}")
print()
print("📋 Processing form fields...")
print("✔️  Field 'name' filled")
print("✔️  Field 'email' filled")
print("✔️  Field 'date' filled")
print()
print(f"💾 Saved filled form to: {output_pdf}")
print("✅ Success!")
`;

  await fs.writeFile(path.join(TEST_SKILL_DIR, 'scripts', 'fill_form.py'), fillFormScript);
  await fs.chmod(path.join(TEST_SKILL_DIR, 'scripts', 'fill_form.py'), 0o755);

  // 创建测试脚本 2: extract_data.py
  const extractDataScript = `#!/usr/bin/env python3
"""
PDF Data Extract Script
Extracts form field information from a PDF
"""
import sys
import json

if len(sys.argv) != 3:
    print("Usage: extract_data.py <input.pdf> <output.json>")
    sys.exit(1)

input_pdf = sys.argv[1]
output_json = sys.argv[2]

print(f"✅ PDF Data Extraction Script")
print(f"   Input: {input_pdf}")
print(f"   Output: {output_json}")
print()
print("🔍 Scanning form fields...")
print("   Found field: 'name' (text)")
print("   Found field: 'email' (text)")
print("   Found field: 'date' (date)")
print("   Found field: 'signature' (signature)")
print()

# 模拟输出
data = {
    "fields": [
        {"name": "name", "type": "text", "value": ""},
        {"name": "email", "type": "text", "value": ""},
        {"name": "date", "type": "date", "value": ""},
        {"name": "signature", "type": "signature", "value": ""}
    ],
    "total_fields": 4
}

print(f"💾 Saved field data to: {output_json}")
print(f"✅ Extracted {data['total_fields']} fields")
`;

  await fs.writeFile(path.join(TEST_SKILL_DIR, 'scripts', 'extract_data.py'), extractDataScript);
  await fs.chmod(path.join(TEST_SKILL_DIR, 'scripts', 'extract_data.py'), 0o755);

  console.log('✅ Test skill created successfully!\n');
  console.log(`   Location: ${TEST_SKILL_DIR}`);
  console.log('   Files:');
  console.log('   - SKILL.md');
  console.log('   - scripts/fill_form.py');
  console.log('   - scripts/extract_data.py\n');
}

async function verifySkillsContext() {
  console.log('🔍 Verifying Skills context injection...\n');

  try {
    // 动态导入 Skills 集成模块
    const skillsModule = require('../packages/cli/src/services/skill/skills-integration.js');

    // 初始化 Skills 上下文
    console.log('⏳ Initializing Skills context...');
    await skillsModule.initializeSkillsContext();

    // 获取上下文
    const context = skillsModule.getSkillsContext();

    if (!context) {
      console.log('⚠️  No Skills context loaded (this is OK if no skills are installed)');
      return;
    }

    console.log('\n📄 Skills Context Preview:\n');
    console.log('─'.repeat(80));

    // 显示前 1000 个字符
    const preview = context.substring(0, 1000);
    console.log(preview);

    if (context.length > 1000) {
      console.log('\n... (truncated) ...\n');
    }

    console.log('─'.repeat(80));
    console.log(`\nℹ️  Total length: ${context.length} characters`);
    console.log(`ℹ️  Estimated tokens: ~${Math.ceil(context.length / 4)}`);

    // 检查关键内容
    console.log('\n🔍 Checking for key elements:\n');

    const checks = [
      { name: 'Skills header', pattern: /# Available Skills/ },
      { name: 'How to use instructions', pattern: /How to use Skills:/ },
      { name: 'Script usage rule', pattern: /Use existing scripts first|CRITICAL RULE/ },
      { name: 'Scripts marker (📜)', pattern: /📜/ },
      { name: 'run_shell_command mention', pattern: /run_shell_command/ },
      { name: 'Test PDF skill', pattern: /test-pdf/ },
      { name: 'Scripts available info', pattern: /Scripts Available/ },
    ];

    for (const check of checks) {
      const found = check.pattern.test(context);
      const status = found ? '✅' : '❌';
      console.log(`${status} ${check.name}`);
    }

    console.log('\n✅ Context verification complete!\n');

  } catch (error) {
    console.error('❌ Error verifying Skills context:', error.message);
    console.error('\nThis might be expected if the Skills system is not built yet.');
    console.error('Run `npm run build` first.\n');
  }
}

async function printTestInstructions() {
  console.log('📋 Manual Testing Instructions\n');
  console.log('─'.repeat(80));
  console.log('\n1. Start DeepV Code:');
  console.log('   dvcode\n');
  console.log('2. Test with the following prompt:');
  console.log('   "I have a PDF form called application.pdf that needs to be filled."');
  console.log('   "Can you help me fill it with data?"\n');
  console.log('3. Expected AI behavior (✅ CORRECT):');
  console.log('   - AI mentions the test-pdf skill');
  console.log('   - AI uses the fill_form.py script');
  console.log('   - AI executes: python3 ~/.deepv/skills/test-pdf-skill/scripts/fill_form.py ...');
  console.log('   - AI does NOT write new Python code\n');
  console.log('4. Wrong AI behavior (❌ INCORRECT):');
  console.log('   - AI writes new Python code to process PDF');
  console.log('   - AI installs PyPDF2 or other libraries');
  console.log('   - AI does not mention the test-pdf skill\n');
  console.log('─'.repeat(80));
  console.log('\n💡 Tip: If AI still writes code, try being more explicit:');
  console.log('   "I noticed there is a test-pdf skill with scripts. Can you use those?"\n');
}

async function cleanup() {
  console.log('\n🧹 Cleanup\n');
  console.log('To remove the test skill:');
  console.log(`   rm -rf ${TEST_SKILL_DIR}\n`);
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Skills Script Usage - Test & Verification');
  console.log('='.repeat(80) + '\n');

  try {
    // 1. 创建测试 Skill
    await setupTestSkill();

    // 2. 验证 Skills Context
    await verifySkillsContext();

    // 3. 打印测试说明
    await printTestInstructions();

    // 4. 清理说明
    await cleanup();

    console.log('✅ Test setup complete!\n');
    console.log('Next steps:');
    console.log('1. Restart DeepV Code if it is running');
    console.log('2. Try the manual test as described above');
    console.log('3. Report results\n');

  } catch (error) {
    console.error('❌ Error during test setup:', error);
    process.exit(1);
  }
}

// 运行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { setupTestSkill, verifySkillsContext };
