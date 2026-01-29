/**
 * Script to fix MessageInput.tsx to properly handle built-in slash commands
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../vscode-ui-plugin/webview/src/components/MessageInput.tsx');

const oldCode = `            if (result.success && result.prompt) {
              // 命令执行成功，用处理后的 prompt 替换原始内容
              finalContent = [{ type: 'text', value: result.prompt }];
              console.log(\`🎯 [SlashCommand] Executed /\${commandName}, prompt length: \${result.prompt.length}\`);
            } else if (result.error) {
              // 命令执行失败，但不阻止发送（可能是内置命令或无效命令）
              console.log(\`⚠️ [SlashCommand] /\${commandName} not a custom command: \${result.error}\`);
              // 继续使用原始内容发送
            }`;

const newCode = `            if (result.success && result.isBuiltIn) {
              // 🎯 内置命令执行成功（如 /tools, /compress）
              // 内置命令不发送给 AI，而是直接显示结果
              console.log(\`✅ [SlashCommand] Built-in /\${commandName} executed successfully\`);

              // 通过回调将内置命令结果传递给父组件处理
              if (props.onBuiltinCommandResult) {
                props.onBuiltinCommandResult({
                  commandName,
                  success: true,
                  message: result.message,
                });
              }

              // 清空编辑器并返回，不发送消息给 AI
              clearEditor();
              resetImageCounter();
              setContainerHeight(undefined);
              setIsAutoExpanded(false);
              return;
            } else if (result.success && result.prompt) {
              // 自定义命令执行成功，用处理后的 prompt 替换原始内容
              finalContent = [{ type: 'text', value: result.prompt }];
              console.log(\`🎯 [SlashCommand] Executed /\${commandName}, prompt length: \${result.prompt.length}\`);
            } else if (result.error) {
              // 命令执行失败
              console.log(\`⚠️ [SlashCommand] /\${commandName} failed: \${result.error}\`);

              // 如果是内置命令失败，通知父组件但不发送消息
              if (result.isBuiltIn) {
                if (props.onBuiltinCommandResult) {
                  props.onBuiltinCommandResult({
                    commandName,
                    success: false,
                    error: result.error,
                  });
                }
                clearEditor();
                return;
              }
              // 非内置命令错误，继续使用原始内容发送
            }`;

try {
  const content = fs.readFileSync(filePath, 'utf-8');

  if (content.includes(oldCode)) {
    const newContent = content.replace(oldCode, newCode);
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log('✅ MessageInput.tsx updated successfully!');
  } else if (content.includes('result.success && result.isBuiltIn')) {
    console.log('ℹ️ MessageInput.tsx already has built-in command handling');
  } else {
    console.error('❌ Could not find the target code block in MessageInput.tsx');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
