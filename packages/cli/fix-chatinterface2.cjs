/**
 * Script to add onBuiltinCommandResult destructuring to ChatInterface.tsx
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../vscode-ui-plugin/webview/src/components/ChatInterface.tsx');

try {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Check if already added
  if (content.includes('onBuiltinCommandResult,')) {
    console.log('ℹ️ onBuiltinCommandResult already destructured');
    process.exit(0);
  }

  // Add to destructuring after isModelSwitching
  const destructurePattern = /isModelSwitching = false\n\}\) => \{/;
  if (content.match(destructurePattern)) {
    content = content.replace(
      destructurePattern,
      `isModelSwitching = false,
  onBuiltinCommandResult
}) => {`
    );
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log('✅ Added onBuiltinCommandResult to destructuring');
  } else {
    console.log('❌ Could not find destructuring pattern');
    process.exit(1);
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
