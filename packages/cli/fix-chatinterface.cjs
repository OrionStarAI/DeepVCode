/**
 * Script to add onBuiltinCommandResult handling to ChatInterface.tsx
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../vscode-ui-plugin/webview/src/components/ChatInterface.tsx');

try {
  let content = fs.readFileSync(filePath, 'utf-8');

  // 1. Add the prop to ChatInterfaceProps interface
  const propsPattern = /interface ChatInterfaceProps \{/;
  if (content.includes('onBuiltinCommandResult?')) {
    console.log('ℹ️ ChatInterface.tsx already has onBuiltinCommandResult prop');
  } else {
    // Find the interface and add the new prop
    const interfaceMatch = content.match(/interface ChatInterfaceProps \{([\s\S]*?)\n\}/);
    if (interfaceMatch) {
      const interfaceContent = interfaceMatch[0];
      // Add the prop before the closing brace
      const newProp = `  // 🎯 内置命令结果回调
  onBuiltinCommandResult?: (result: {
    commandName: string;
    success: boolean;
    message?: string;
    error?: string;
  }) => void;\n}`;
      const updatedInterface = interfaceContent.replace(/\n\}$/, '\n' + newProp);
      content = content.replace(interfaceContent, updatedInterface);
      console.log('✅ Added onBuiltinCommandResult prop to ChatInterfaceProps');
    }
  }

  // 2. Destructure the prop in the component
  const destructurePattern = /onTogglePlanMode,\n  \} = props;/;
  if (content.match(destructurePattern)) {
    content = content.replace(
      destructurePattern,
      `onTogglePlanMode,
    onBuiltinCommandResult,
  } = props;`
    );
    console.log('✅ Added onBuiltinCommandResult to destructuring');
  }

  // 3. Pass the prop to MessageInput
  const messageInputPattern = /(<MessageInput[\s\S]*?)(messages=\{messages\}\s*\/>)/;
  const match = content.match(messageInputPattern);
  if (match && !content.includes('onBuiltinCommandResult={onBuiltinCommandResult}')) {
    content = content.replace(
      messageInputPattern,
      `$1onBuiltinCommandResult={onBuiltinCommandResult}
        messages={messages}
      />`
    );
    console.log('✅ Added onBuiltinCommandResult prop to MessageInput');
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log('✅ ChatInterface.tsx updated successfully!');

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
