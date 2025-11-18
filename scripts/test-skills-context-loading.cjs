#!/usr/bin/env node
/**
 * Test Skills Context Loading
 *
 * Verifies that Skills context is correctly loaded and injected into system prompt
 */

const path = require('path');

async function testSkillsContext() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing Skills Context Loading');
  console.log('='.repeat(80) + '\n');

  try {
    // Step 1: Initialize Skills context
    console.log('📋 Step 1: Initializing Skills context...\n');

    const { initializeSkillsContext, getSkillsContext } = require('../packages/cli/dist/src/services/skill/skills-integration.js');

    await initializeSkillsContext();
    console.log('✅ Skills context initialized\n');

    // Step 2: Get the context
    console.log('📋 Step 2: Getting Skills context...\n');

    const context = getSkillsContext();

    if (!context || context.trim().length === 0) {
      console.log('⚠️  No Skills context loaded (no skills installed or error occurred)\n');
      console.log('This is expected if:');
      console.log('  - No skills are installed in ~/.deepv/skills/');
      console.log('  - No marketplaces are added');
      console.log('  - No plugins are installed\n');
      return false;
    }

    console.log('✅ Skills context loaded successfully!\n');
    console.log('─'.repeat(80));
    console.log('📄 Context Preview (first 2000 characters):\n');
    console.log(context.substring(0, 2000));
    if (context.length > 2000) {
      console.log('\n... (truncated) ...');
    }
    console.log('─'.repeat(80));

    console.log(`\nℹ️  Full context length: ${context.length} characters`);
    console.log(`ℹ️  Estimated tokens: ~${Math.ceil(context.length / 4)}\n`);

    // Step 3: Test system prompt injection
    console.log('📋 Step 3: Testing system prompt injection...\n');

    const { getCoreSystemPrompt } = require('../packages/core/dist/src/core/prompts.js');
    const systemPrompt = getCoreSystemPrompt();

    const hasSkillsContext = systemPrompt.includes('Available Skills');

    if (hasSkillsContext) {
      console.log('✅ Skills context is correctly injected into system prompt!\n');

      // Check for key elements
      const checks = [
        { name: 'Skills header', pattern: /# Available Skills/ },
        { name: 'Critical workflow instructions', pattern: /🔥 CRITICAL WORKFLOW/ },
        { name: 'Script usage guidance', pattern: /read_file.*SKILL\.md/ },
        { name: 'Example workflow', pattern: /Example workflow:/ },
      ];

      console.log('🔍 Checking key elements:\n');
      for (const check of checks) {
        const found = check.pattern.test(systemPrompt);
        console.log(`${found ? '✅' : '❌'} ${check.name}`);
      }
      console.log('');

      return true;
    } else {
      console.log('❌ Skills context NOT found in system prompt!\n');
      console.log('Possible issues:');
      console.log('  - require() path is incorrect');
      console.log('  - getSkillsContext() returns empty string');
      console.log('  - getDynamicSystemPrompt() is not called\n');
      return false;
    }

  } catch (error) {
    console.error('❌ Error during testing:', error);
    console.error('\nStack trace:');
    console.error(error.stack);
    return false;
  }
}

// Run test
testSkillsContext()
  .then(success => {
    console.log('='.repeat(80));
    if (success) {
      console.log('✅ All tests passed! Skills context is working correctly.');
    } else {
      console.log('⚠️  Test completed with warnings. Check output above.');
    }
    console.log('='.repeat(80) + '\n');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
