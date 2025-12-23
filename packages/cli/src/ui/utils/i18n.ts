/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import * as os from 'os';

/**
 * 获取取消操作的热键提示文本
 */
export const getCancelKeyHint = (): string => {
  // 检测IDEA环境
  const isIDEATerminal = !!(
    process.env.TERMINAL_EMULATOR && (
      process.env.TERMINAL_EMULATOR.includes('JetBrains') ||
      process.env.TERMINAL_EMULATOR.includes('IntelliJ') ||
      process.env.TERMINAL_EMULATOR.includes('IDEA')
    ) ||
    process.env.IDEA_INITIAL_DIRECTORY ||
    process.env.JETBRAINS_IDE ||
    (process.env.TERM_PROGRAM && process.env.TERM_PROGRAM.includes('jetbrains'))
  );

  if (isIDEATerminal) {
    // IDEA环境下使用替代热键
    return process.platform === 'darwin' ? 'ctrl+q' : 'ctrl+q';
  }

  return 'esc';
};

/**
 * 获取工具确认取消文本，会根据环境自动替换正确的热键
 */
export const getCancelConfirmationText = (): string => {
  return tp('tool.confirmation.cancel', { cancelKey: getCancelKeyHint() });
};

/**
 * 获取输入框取消提示文本
 */
export const getInputCancelHint = (): string => {
  // 检测IDEA环境
  const isIDEATerminal = !!(
    process.env.TERMINAL_EMULATOR && (
      process.env.TERMINAL_EMULATOR.includes('JetBrains') ||
      process.env.TERMINAL_EMULATOR.includes('IntelliJ') ||
      process.env.TERMINAL_EMULATOR.includes('IDEA')
    ) ||
    process.env.IDEA_INITIAL_DIRECTORY ||
    process.env.JETBRAINS_IDE ||
    (process.env.TERM_PROGRAM && process.env.TERM_PROGRAM.includes('jetbrains'))
  );

  if (isIDEATerminal) {
    switch (process.platform) {
      case 'darwin':
        return t('input.hint.cancel.darwin.idea');
      case 'linux':
        return t('input.hint.cancel.linux.idea');
      default: // win32 and others
        return t('input.hint.cancel.win32.idea');
    }
  }

  return t('input.hint.cancel.default');
};

// Cache the locale detection result to avoid repeated system calls
let _cachedIsChineseLocale: boolean | null = null;

/**
 * Detects if the system is configured for Chinese language (cached)
 * @returns true if Chinese locale is detected
 */
function detectChineseLocale(): boolean {
  try {
    // Check environment variables first
    const env = process.env;
    const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || '';

    if (locale.toLowerCase().includes('zh') || locale.toLowerCase().includes('chinese')) {
      return true;
    }

    // For Windows, check system locale
    if (os.platform() === 'win32') {
      try {
        const output = execSync('powershell -Command "Get-Culture | Select-Object -ExpandProperty Name"', {
          encoding: 'utf8',
          timeout: 5000
        });
        return output.toLowerCase().includes('zh');
      } catch {
        // Fallback: check if system language contains Chinese characters
        try {
          const winLocale = execSync('powershell -Command "Get-WinSystemLocale | Select-Object -ExpandProperty Name"', {
            encoding: 'utf8',
            timeout: 5000
          });
          return winLocale.toLowerCase().includes('zh');
        } catch {
          return false;
        }
      }
    }

    // For Unix-like systems, try locale command
    try {
      const localeOutput = execSync('locale', { encoding: 'utf8', timeout: 5000 });
      return localeOutput.toLowerCase().includes('zh');
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Returns cached result of Chinese locale detection
 * @returns true if Chinese locale is detected
 */
export function isChineseLocale(): boolean {
  if (_cachedIsChineseLocale === null) {
    _cachedIsChineseLocale = detectChineseLocale();
  }
  return _cachedIsChineseLocale;
}

/**
 * Clear cached locale detection result (for testing purposes)
 */
export function _clearLocaleCache(): void {
  _cachedIsChineseLocale = null;
  _cachedLocale = null;
}

/**
 * Translation messages for different locales
 */
export const translations = {
  en: {
    // Update flow
    'update.cache.write.error': '⚠️ Unable to save update check cache: {error}',
    'update.time.today': 'Today {time}',
    'update.time.tomorrow': 'Tomorrow {time}',
    'update.status.skipped': '📅 Update check: skipped',
    'update.next.check.at': '⏰ Next check: {time} ({hours}h later)',
    'update.next.check.simple': '⏰ Next check: {time}',
    'update.using.cache': '💾 Using cached result',
    'update.cache.expired.checking': '🔄 Cache expired, checking for updates...',
    'update.first.check.or.version.changed': '🔄 First check or version changed...',
    'update.checking': '🔍 Checking for updates...',
    'update.debug.package.name': 'Package name',
    'update.debug.current.version': 'Current version',
    'update.debug.package.path': 'Package path',
    'update.check.server': '🌐 Checking server: {server}',
    'update.debug.request.url': 'Request URL',
    'update.check.failed.http': '❌ Update check failed: HTTP {status}',
    'update.check.failed.message': '❌ Update check failed: {message}',
    'update.check.failed.generic': '❌ Update check failed: {error}',
    'update.found.new.version': '🎉 New version found: {current} → {latest}',
    'update.current.latest': '✅ You are on the latest version',
    'update.current.latest.full': '✅ You are on the latest version, no update needed',
    'update.force.message.header': 'DeepV Code must be updated to continue!',
    'update.available.message.header': 'A new version is available!',
    'update.version.line': 'Current: {current} → Latest: {latest}',
    'update.command.line': '📋 Command: {command}',
    'update.after.success.exit': 'After the update completes, the application will exit.',
    'update.auto.exec.start': '🚀 Running automatic update...',
    'update.auto.executing': '🚀 Executing automatic update (using -u flag)...',
    'update.completed': '✅ Update completed!',
    'update.failed.code': '❌ Update failed, exit code: {code}',
    'update.exec.command.error': '❌ Failed to execute update command: {error}',
    'update.manual.run.hint': '💡 Please run the update command manually',
    'update.prompt.auto': '🤖 Automatically apply the update? (y/n): ',
    'update.prompt.now': '🤔 Update now? (y/n): ',
    'update.forced.title': '🚨 Forced update required',
    'update.available.title': '📢 Update available',
    'update.success.restart': '🎉 Update complete! The program will exit. Please rerun dvcode',
    'update.manual.then.rerun': '💡 Please run the update command manually, then rerun dvcode',
    'update.continue.current': '✨ Continuing with current version...',
    'update.force.checking': '🔄 Forcing update check...',
    // Session Summary
    'agent.powering.down': 'Thanks for using DeepV Code! Run dvcode -c to continue.',

    // Input Prompt
    'input.placeholder.base': 'Type your message or @filepath',
    'input.placeholder.help_ask': 'Ask how to use this program? Press esc to exit help mode',
    'input.hint.newline.win32': 'Ctrl+Enter for newline',
    'input.hint.newline.win32.vscode': 'Shift+Enter for newline (VSCode)',
    'input.hint.newline.win32.idea': 'Ctrl+J for newline (IDEA)',
    'input.hint.newline.darwin': 'Ctrl+J for newline',
    'input.hint.newline.darwin.vscode': 'Ctrl+J for newline (VSCode)',
    'input.hint.newline.darwin.idea': 'Ctrl+J for newline (IDEA)',
    'input.hint.newline.linux': 'Ctrl+J for newline',
    'input.hint.newline.linux.idea': 'Ctrl+J for newline (IDEA)',
    'input.hint.newline.default': 'Ctrl+J for newline',

    // Cancel hints
    'input.hint.cancel.default': 'esc: cancel',
    'input.hint.cancel.win32.idea': 'ctrl+q: cancel',
    'input.hint.cancel.darwin.idea': 'ctrl+q: cancel',
    'input.hint.cancel.linux.idea': 'ctrl+q: cancel',
    'input.paste.detected': 'Detected {count} long text paste segments, showing summary in input. Full content will be used when sent.',
    'input.paste.segment': 'Segment {index}: {lines} lines',
    'input.paste.clipboard.image': '🖼️ Pasting image from clipboard...',
    'input.paste.unified.hotkey': 'Ctrl+V for unified paste (image or text)',
    'input.paste.vscode.recommendation': 'In VSCode terminal, use Ctrl+V for unified paste',
    'input.queue.busy': '🤖 Model is still working; new prompts will be queued automatically.',
    'input.queue.working': 'Working (esc to interrupt)',
    'input.queue.edit.hint': 'ctrl + ↑ edit',
    'input.queue.edit.mode': 'Editing queue #{current}/{total}',
    'input.queue.edit.actions': 'enter to save • esc to cancel • ctrl+↑ next',
    'input.queue.item.updated': '✅ Updated queue item #{position}',
    'input.queue.item.deleted': '🗑️ Deleted queue item #{position}',
    'input.queue.count': '📝 Queued prompts: {count}',
    'input.queue.preview': 'Next: {preview}',
    'input.queue.added': 'Queued #{position}: {preview}',
    'input.queue.cleared': '✅ Cleared {count} queued prompt(s)',
    'input.queue.empty': 'ℹ️ Queue is already empty',
    'completion.clipboard.description': 'Paste clipboard content (image or text)',

    // Suggestions Display
    'suggestions.loading': 'Loading suggestions...',

    // Stats Display sections
    'section.interaction.summary': 'Interaction Summary',
    'section.performance': 'Performance',
    'section.model.usage': 'Model Usage',

    // Stats Display labels
    'stats.tool.calls': 'Tool Calls:',
    'stats.success.rate': 'Success Rate:',
    'stats.user.agreement': 'User Agreement:',
    'stats.wall.time': 'Wall Time:',
    'stats.agent.active': 'Agent Active:',
    'stats.api.time': 'API Time:',
    'stats.tool.time': 'Tool Time:',
    'stats.session.stats': 'Session Stats',
    'stats.reviewed': 'reviewed',

    // Compact Stats Display
    'stats.compact.token.usage': 'Token Usage',
    'stats.compact.input': 'Input',
    'stats.compact.cache.read': 'Cache Read',
    'stats.compact.output': 'Output',
    'stats.compact.total': 'Total',
    'stats.compact.credits': 'Credits',
    'stats.compact.cache.hit.rate': 'Cache Hit Rate',

    // Compact Model Stats Display
    'stats.compact.model.requests': 'Reqs',
    'stats.compact.model.errors': 'Errors',
    'stats.compact.model.avg.latency': 'Avg Latency',

    // Compact Tool Stats Display
    'stats.compact.tool.stats': 'Tool Stats',
    'stats.compact.tool.total': 'Total',
    'stats.compact.tool.success': 'Success',
    'stats.compact.tool.fail': 'Fail',
    'stats.compact.tool.agreement': 'Agreement',
    'stats.compact.tool.reviewed': 'reviewed',
    'stats.compact.tool.calls': 'Calls',
    'stats.compact.tool.success.rate': 'Success Rate',
    'stats.compact.tool.avg.time': 'Avg Time',
    'stats.compact.tool.total.response.size': 'Total Response Size',

    // SubAgent Display labels
    'subagent.tool.calls': 'Tool Calls:',
    'subagent.execution.time': 'Execution Time:',
    'subagent.token.consumption': 'Token Usage:',
    'subagent.tool.calls.count': '{count} calls',

    // Tool Stats Display
    'tool.stats.no.calls': 'No tool calls have been made in this session yet.',

    // Model usage table headers
    'table.header.model': 'Model',
    'stats.other.tools': 'Other Tools',
    'table.header.reqs': 'Reqs',
    'table.header.input': 'Input',
    'table.header.output': 'Output',
    'table.header.cache': 'Cache↗',
    'table.header.credits': 'Credits',
    'table.header.cost': 'Cost',

    // Token Usage Display
    'token.usage': 'Token Usage',
    'token.input': 'Input: ',
    'token.output': 'Output: ',
    'token.total': 'Total: ',
    'token.credits': 'Credits: ',
    'token.cache.read': 'Cache Read: ',
    'token.cache.create': 'Cache Create: ',
    'token.efficiency': 'Cache Hit Rate: ',
    'token.no.cache': 'No cache hits - all tokens processed fresh',

    // Token Breakdown Display
    'token.breakdown.title': 'Context Token Breakdown',
    'token.breakdown.system': 'System Prompt',
    'token.breakdown.user': 'User Input',
    'token.breakdown.memory': 'Memory & Context',
    'token.breakdown.tools': 'Tools & Functions',
    'token.breakdown.total': 'Total Context',

    // SubAgent Stats
    'subagent.activity': 'SubAgent Activity',
    'subagent.api.calls': 'API Calls: ',
    'subagent.token.usage': 'Token Usage: ',
    'subagent.errors': 'errors',
    'subagent.of.total': 'of total',
    'subagent.prompt': 'Prompt: ',
    'subagent.response': 'Response: ',
    'subagent.cached': 'Cached: ',
    'subagent.thoughts': 'Thoughts: ',
    'subagent.tool': 'Tool: ',
    'subagent.avg.latency': 'Avg Latency: ',

    // Task execution
    'task.timeout.warning': '⚠️ Task execution timeout: Completed {turns} conversation turns but task remains unfinished',
    'task.timeout.credits.notice': 'Continuing may consume additional credits. Please review carefully.',

    // Conversation limits
    'conversation.token.limit.warning': 'IMPORTANT: Context approaching limit. Conversation context will be compressed for future messages.\nIf you notice the model becomes less focused, use "/session new" to start a fresh conversation.',

    // Tool Names
    'tool.edit': 'Edit',
    'tool.ppt_generate': 'PPT Generate',
    'tool.ppt_generate.description': 'Submit PPT outline and start generation task.\n\nThis tool will perform the following operations:\n1. Submit the current outline to the server\n2. Start the PPT generation task\n3. Automatically open browser to the PPT editing preview page\n4. Exit PPT editing mode\n\nMake sure to set the outline content (topic, page count, outline text) via ppt_outline tool before calling.',
    'ppt_generate.param.confirm': 'Confirm submission (default true)',
    'tool.ppt_outline': 'PPT Outline',
    'tool.ppt_outline.description': 'Manage PPT outline content. Supports the following actions:\n- init: Initialize PPT editing mode, start creating new PPT\n- update: Update outline content (topic, page count, outline text)\n- view: View current outline state\n- clear: Clear current outline and exit PPT mode',

    // Web Search
    'websearch.results.returned': 'Search results for "{query}" returned.{truncated}',
    'websearch.results.truncated': ' (Content truncated)',
    'tool.readfile': 'ReadFile',
    'tool.writefile': 'WriteFile',
    'tool.searchtext': 'SearchText',
    'tool.todowrite': 'TodoWrite',
    'tool.todoread': 'TodoRead',
    'tool.findfiles': 'FindFiles',
    'tool.readfolder': 'ReadFolder',
    'tool.readmanyfiles': 'ReadManyFiles',
    'tool.shell': 'Shell',
    'tool.webfetch': 'WebFetch',
    'tool.websearch': 'Web Search',
    'tool.savememory': 'Save Memory',
    'tool.task': 'Task',

    // Shell output
    'shell.output.truncated': '... (showing last {maxLines} lines, {totalLines} lines total)',

    // Text Truncator
    'text_truncator.omitted_lines': '[ ... {count} lines omitted, press ⌘ + C to copy full text ... ]',


    // IDE Connection
    'ide.connected': '● IDE Connected',

    // Footer - Current Model
    'footer.current.model': 'Model',

    // Tool Confirmation Messages
    'tool.confirmation.modifying': 'Modification in progress:',
    'tool.confirmation.save.editor': 'Save and close external editor to continue',
    'tool.confirmation.apply.changes': 'Apply this change?',
    'tool.confirmation.once': 'Yes, allow once',
    'tool.confirmation.type.always': 'Yes, always allow this type of tool',
    'tool.confirmation.project.always': 'Yes, always allow all tools in this project',
    'tool.confirmation.modify.editor': 'Modify with external editor',
    'tool.confirmation.cancel': 'No ({cancelKey}), tell DeepV Code your thoughts',
    'tool.confirmation.execute': 'Allow execution: \'{command}\'?',
    'tool.confirmation.type.always.exec': 'Yes, always allow this type',
    'tool.confirmation.continue': 'Do you want to continue?',
    'tool.confirmation.urls.label': 'URLs to fetch:',
    'tool.confirmation.mcp.server': 'MCP Server:',
    'tool.confirmation.mcp.tool': 'Tool:',
    'tool.confirmation.mcp.execute': 'Allow execution of MCP tool "{toolName}" (from server "{serverName}")?',
    'tool.confirmation.mcp.tool.always': 'Yes, always allow tool "{toolName}" from server "{serverName}"',
    'tool.confirmation.mcp.server.always': 'Yes, always allow all tools from server "{serverName}"',
    'tool.confirmation.delete.file': 'Delete this file?',

    // Git error messages
    'git.error.old.version.title': 'Git Version Too Old',
    'git.error.old.version.message': 'Your Git version does not support the "--initial-branch" option required for checkpointing.',
    'git.error.old.version.impact': 'Impact: File checkpointing and snapshot features will be disabled.',
    'git.error.old.version.solution': 'Solution: Please upgrade Git to version 2.28+ or disable checkpointing in settings.',
    'git.error.old.version.continuing': 'The CLI will continue running with checkpointing disabled.',
    'git.error.not.available.title': 'Git Not Available',
    'git.error.not.available.message': 'Git is not installed or not available in PATH.',
    'git.error.not.available.impact': 'Impact: File checkpointing and snapshot features will be disabled.',
    'git.error.not.available.solution': 'Solution: Please install Git or disable checkpointing in settings.',
    'git.error.not.available.continuing': 'The CLI will continue running with checkpointing disabled.',
    'git.error.init.failed.title': 'Git Initialization Failed',
    'git.error.init.failed.message': 'Failed to initialize Git repository for checkpointing: {error}',
    'git.error.init.failed.impact': 'Impact: File checkpointing and snapshot features will be disabled.',
    'git.error.init.failed.solution': 'Solution: Check Git installation and permissions, or disable checkpointing.',
    'git.error.init.failed.continuing': 'The CLI will continue running with checkpointing disabled.',

    // Checkpoint messages
    'checkpoint.creating': 'Creating auto checkpoint...',
    'checkpoint.created.success': 'Checkpoint created ({checkpointId})',
    'checkpoint.created.failed': 'Failed to create checkpoint: {error}',
    'checkpoint.creation.skipped': 'Subsequent auto checkpoint attempts will be skipped for this conversation',

    // Checkpoint CLI command
    'checkpoint.command.description': 'Manage checkpoint history',
    'checkpoint.command.require.subcommand': 'You need to specify a subcommand. Use --help to see available commands.',
    'checkpoint.clean.description': 'Clean all checkpoint history to free disk space',
    'checkpoint.clean.force.description': 'Skip confirmation prompt',
    'checkpoint.clean.dryrun.description': 'Show what would be deleted without actually deleting',
    'checkpoint.clean.no.history': '✅ No checkpoint history found. Nothing to clean.',
    'checkpoint.clean.no.checkpoints': '✅ Checkpoint history directory is empty. Nothing to clean.',
    'checkpoint.clean.summary': '📊 Checkpoint History Summary:\n   Projects: {count}\n   Total Size: {size}\n   Location: {path}',
    'checkpoint.clean.dryrun.notice': '\n🔍 Dry run mode - no files were deleted.',
    'checkpoint.clean.confirm': '\n⚠️  This will permanently delete all checkpoint history.\nAre you sure? (y/N): ',
    'checkpoint.clean.cancelled': '❌ Operation cancelled.',
    'checkpoint.clean.deleting': '🗑️  Deleting checkpoint history...',
    'checkpoint.clean.success': '✅ Successfully cleaned checkpoint history. Freed {size} of disk space.',
    'checkpoint.clean.error': '❌ Error cleaning checkpoint history: {error}',

    // Diff display messages
    'diff.new.file': '📄 New file',
    'diff.delete.file': '🗑️ Delete file',
    'diff.modify.file': '📝',
    'diff.no.changes': '(no changes)',
    'diff.lines.unit': 'lines',
    'diff.test.header': '=== Small window diff display optimization test ===',
    'diff.stats.info': 'Statistics:',
    'diff.simplified.display': 'Simplified display:',
    'diff.test.completed': 'Test completed ✅',

    // Startup Warnings
    'startup.warning.home.directory': 'You are running DeepV Code CLI in your home directory. It is recommended to run in a project-specific directory.',
    'startup.warning.root.directory': 'Warning: You are running DeepV Code CLI in the root directory. Your entire folder structure will be used for context. It is strongly recommended to run in a project-specific directory.',
    'startup.warning.filesystem.error': 'Could not verify the current directory due to a file system error.',
    'startup.warning.custom.proxy.server': '🔗 Custom server: {url}\n   Please verify trustworthiness and monitor your API usage.',

    // DeepX Quota Error Messages
    'deepx.quota.no.configuration': '─────────────────────────────────────────────────────\n🚫 Your account\'s available Credits are insufficient to continue using this service\n💡 Please consider subscribing to a higher quota plan. Details: https://dvcode.deepvlab.ai/\n\n\x1b[33m🎁 For free trial opportunities, contact our Boss: https://x.com/fusheng_0306\x1b[0m\n─────────────────────────────────────────────────────',
    'deepx.quota.exceeded.with.upgrade': '🚫 Daily {limitType} limit reached for {model}\n💡 Please upgrade your plan at: https://dvcode.deepvlab.ai/',
    'deepx.quota.exceeded.default': '🚫 Service quota exceeded\n💡 Please upgrade your plan at: https://dvcode.deepvlab.ai/',
    'deepx.quota.limit.token': 'token limit',
    'deepx.quota.limit.request': 'request limit',
    'deepx.quota.limit.cost': 'cost limit',
    'deepx.quota.limit.generic': 'quota limit',

    // Model Command Messages
    'model.command.description': 'Set or view preferred model',
    'model.command.no.preferred.set': 'No preferred model is currently set.',
    'model.command.available.models': 'Available models',
    'model.command.from.server': '(from server)',
    'model.command.from.cache': '(from cache)',
    'model.command.usage.instruction.set': 'Use /model <model name> to set preferred model.',
    'model.command.usage.instruction.set.friendly': '💡 Tip: Type /model then press SPACE or TAB to see model options, select your preferred model, then press ENTER.',
    'model.command.current.preferred': 'Current preferred model: {model}',
    'model.command.usage.instruction.change': 'Use /model <model name> to change model.',
    'model.command.usage.instruction.change.friendly': '💡 Tip: Type /model then press SPACE or TAB to see model options, select your preferred model, then press ENTER.',
    'model.command.invalid.model': 'Invalid model: {model}',
    'model.command.switching': 'Switching to model {model}, please wait...',
    'model.command.set.success': '✅ Preferred model set to: {model}',
    'model.command.credit.cost': '💰 Cost per request: {credits}x credits',
    'model.command.credit.cost.long.context': '💰 Long context (>{threshold} tokens): {credits}x credits',
    'model.command.long.context.short': 'long context >{threshold}: {credits}x',
    'model.command.auto.mode': '🤖 Server will automatically select the most suitable model based on request type',
    'model.command.not.logged.in': '❌ You are not logged in.',
    'model.command.please.login': '💡 Please use /auth to login to your account first.',

    // Model Dialog Messages
    'model.dialog.title': 'Select AI Model',
    'model.dialog.current': 'Current: {model}',
    'model.dialog.loading': 'Loading model list...',
    'model.dialog.error.not.logged.in': 'You are not logged in. Please use /auth command to login first.',
    'model.dialog.error.load.failed': 'Failed to load model list: {error}',
    'model.dialog.details.title': 'Model Details',
    'model.dialog.details.name': 'Name: ',
    'model.dialog.details.cost': 'Cost: ',
    'model.dialog.details.context': 'Context: ',
    'model.dialog.details.long.context': 'Long context: ',
    'model.dialog.details.status': 'Status: ',
    'model.dialog.details.available': 'Available',
    'model.dialog.details.unavailable': 'Unavailable',
    'model.dialog.hint.tiny': '(Enter to select, ESC to exit)',
    'model.dialog.hint.normal': '(Press Enter to select model, ESC to exit)',
    'model.dialog.set.failed': 'Failed to set model: {error}',

    // Tips Component Messages
    'tips.guide.title': 'User Guide:',
    'tips.guide.step1': '1. Ask questions, edit files, or run commands.',
    'tips.guide.step2': '2. The more specific your description, the better the results.',
    'tips.guide.step3': '3. Create',
    'tips.guide.deepv.file': 'DEEPV.md',
    'tips.guide.step3.suffix': 'file to customize your interaction with DeepV Code.',
    'tips.guide.help': '/help',
    'tips.guide.help.suffix': 'for more information.',

    // Header Component Messages
    'header.debug.title': '🔧 Debug Info',
    'header.debug.user.settings': '📁 User Settings:',
    'header.debug.system.settings': '🏢 System Settings:',
    'header.debug.auth.cache': '🔐 Auth Cache:',
    'header.debug.feishu.server': '🌐 Feishu Server Port:',

    // DeepVlab Authentication
    'auth.deepvlab.login.title': '🔐 DeepVlab Unified Login',
    'auth.deepvlab.login.button': '🌐 DeepVlab Unified Login',
    'auth.deepvlab.login.description': 'Click the button below to complete the login process',
    'auth.deepvlab.starting': '🚀 Starting DeepVlab unified authentication process, please wait...',
    'auth.deepvlab.success': '✅ DeepVlab authentication successful!',
    'auth.deepvlab.failed': '❌ DeepVlab authentication failed, please try again.',
    'auth.deepvlab.error': '❌ Error during DeepVlab authentication: {error}',
    'auth.deepvlab.config.success': '✅ DeepVlab authentication successful! Configuring Cheeth OA proxy mode...',
    'auth.deepvlab.config.error': 'DeepVlab authentication successful, but proxy configuration error:\n{error}',
    'auth.deepvlab.server.started': '✅ DeepVlab unified authentication server started, please complete authentication in your browser...',
    'auth.deepvlab.server.error': '❌ Failed to start DeepVlab authentication: {error}',
    'auth.deepvlab.page.title': 'DeepVlab Authentication Successful',
    'auth.deepvlab.page.success': '✅ DeepVlab Authentication Successful!',
    'auth.deepvlab.browser.url': 'If the browser doesn\'t open automatically, please visit: {url}',
    'auth.deepvlab.cancel.hint': 'Press ESC to cancel authentication',
    'auth.deepvlab.cancelled': 'Authentication cancelled',
    'auth.option.deepvlab': 'Press Enter to sign in to DeepV Code',

    // Welcome and Dialog Messages
    'welcome.title': '🎉 Welcome to DeepV Code! ✨',
    'welcome.subtitle': '🚀 Start your intelligent coding journey 💻',
    'welcome.daily.tip.title': 'Daily Tip',
    'welcome.daily.tip.more': 'Type /help for traditional help, /help-ask for AI-guided help',
    'auth.dialog.title': 'Get Started',
    'auth.dialog.authenticating': '(Authentication in progress, please wait...)',
    'auth.dialog.select.hint': '(Press Enter to select)',
    'auth.dialog.how.to.authenticate': 'Please log in to continue',
    'auth.tokenExpiredPrompt': '⚠️  Login credentials have expired. Please use /auth command to re-login.',

    // MCP Command Messages
    'mcp.first.start.hint': 'Note: The first launch may take longer. Tool availability will update automatically.',
    'mcp.starting': 'Starting...',
    'mcp.starting.first.launch': 'Starting... (first launch may take longer)',
    'mcp.no.servers.opening.docs': 'No MCP servers configured. Opening documentation in browser: {url}',

    // Theme Command Messages
    'theme.first.start.no.color': 'First launch detected, but theme configuration is unavailable due to NO_COLOR environment variable.',
    'theme.first.start.select.style': '🎨 First launch detected, please select a theme style.',
    'theme.name': 'Theme',

    // Cloud mode authentication
    'cloud.auth.required': '❌ Authentication required for cloud mode',
    'cloud.auth.not.found': '❌ No authentication information found',
    'cloud.auth.token.invalid': '❌ No valid JWT access token',
    'cloud.auth.starting': '🚀 Starting authentication process for cloud mode...',
    'cloud.auth.success': '✅ Authentication successful! Cloud mode is ready.',
    'cloud.auth.complete.title': '🌐 Cloud Mode Authentication Complete',
    'cloud.auth.complete.ready': '✅ Authentication successful! Your cloud environment is ready.',
    'cloud.auth.complete.url': '🌍 Remote Access URL: {url}',
    'cloud.auth.complete.share': '📱 Share this URL to access DeepV Code remotely from any device',
    'cloud.auth.instruction': '💡 Please authenticate using the auth dialog that will open...',

    // Cloud mode connection and health
    'cloud.connection.url': '🌐 Connection URL:',
    'cloud.remote.log.file': '📝 Remote log file:',
    'cloud.remote.message.received': '📨 Remote message received',
    'cloud.remote.message.processing': '⚙️  Processing remote request...',
    'cloud.remote.message.success': '✅ Request completed',
    'cloud.remote.message.failed': '❌ Request failed',
    'cloud.connection.retry': '🔄 Connection attempt {attempt}/{maxRetries}...',
    'cloud.connection.retry.delay': '⏳ Retrying in {delay} seconds...',
    'cloud.connection.failed.max.retries': '❌ Cloud connection failed after {maxRetries} attempts',
    'cloud.auth.retry': '🔄 Authentication attempt {attempt}/{maxRetries}...',
    'cloud.auth.failed.max.retries': '❌ Authentication failed after {maxRetries} attempts',
    'cloud.health.check.started': '💓 Cloud connection health check started (every 30 seconds)',
    'cloud.health.check.disconnected': '⚠️  Cloud connection interrupted, attempting to reconnect...',
    'cloud.health.check.failed': '❌ Health check failed',
    'cloud.reconnect.success': '✅ Cloud reconnection successful',
    'cloud.reconnect.failed': '❌ Cloud reconnection failed',
    'cloud.reconnect.full.retry': '🔄 Attempting full cloud connection reinitialization...',
    'cloud.health.check.cleared': '💓 Health check timer cleared',
    'cloud.cli.register.success': '✅ CLI registration successful: {message}',
    'cloud.remote.access.ready': '🌐 You can now access cloud mode from anywhere at: {url}',

    // Exit confirmation messages
    'exit.confirm.ctrl.c': 'Press Ctrl+C again to exit.',
    'exit.confirm.ctrl.d': 'Press Ctrl+D again to exit.',

    // Cloud mode startup messages
    'cloud.mode.starting': '☁️  Starting cloud mode...',
    'cloud.mode.connecting.to.server': '🌐 Connecting to cloud server: {url}',
    'cloud.mode.server.url': '🌐 Cloud server: {url}',
    'cloud.mode.connecting.to.server.progress': '🔗 Connecting to cloud server...',
    'cloud.mode.connection.successful': '✅ Cloud connection successful',
    'cloud.mode.connection.attempt.failed': '❌ Cloud connection attempt {attempt} failed: {error}',
    'cloud.mode.started.success': '✅ Cloud mode started successfully',
    'cloud.mode.waiting.web.client': '📡 CLI connected to cloud server, waiting for web client connection...',
    'cloud.mode.closed': '👋 Cloud mode closed',
    'cloud.mode.start.failed': '❌ Failed to start cloud mode: {error}',

    // Cloud auth user info
    'cloud.auth.user.authenticated': '✅ [Cloud Auth] Authenticated user: {name} ({info})',
    'cloud.user.info': '👤 User: {name} ({info})',
    'cloud.cli.id': '🆔 CLI ID: {cliId}',

    // Cloud connection states
    'cloud.connection.already.exists': '✅ Cloud connection already exists',
    'cloud.connection.waiting': '⏳ Waiting for connection to complete...',
    'cloud.connection.established': '✅ Cloud connection established successfully',
    'cloud.connection.failed': '❌ Connection failed: {error}',
    'cloud.connection.normal.cancel.reconnect': '✅ Connection normal, canceling reconnect',
    'cloud.disconnecting': '📡 Disconnecting from cloud...',
    'cloud.disconnected': '✅ Cloud connection disconnected',
    'cloud.reconnecting': '🔄 Reconnecting to cloud...',
    'cloud.reinit.success': '✅ Full reinitialization successful',
    'cloud.reinit.no.url': '⚠️  cloudServerUrl not saved, cannot reinitialize',
    'cloud.reinit.failed': '❌ Full reinitialization also failed: {error}',
    'cloud.cleanup.existing': '🧹 Cleaning up existing cloud connection...',
    'cloud.reconnect.scheduled': '🔄 Reconnecting in {delay} seconds (attempt {attempt})',

    // Cloud WebSocket
    'cloud.websocket.connected': '🔌 WebSocket connection established',
    'cloud.websocket.closed': '📡 WebSocket connection closed: {code} {reason}',
    'cloud.websocket.error': '❌ WebSocket connection error: {error}',

    // Cloud messages
    'cloud.message.handle.failed': '❌ Failed to handle cloud message: {error}',
    'cloud.message.forward.local': '📨 Forwarding message to local processing: {type}',
    'cloud.message.forward.failed': '❌ Failed to forward message to local server: {error}',
    'cloud.send.unavailable': '⚠️  Cloud connection unavailable, message send failed',
    'cloud.send.failed': '❌ Failed to send message to cloud: {error}',

    // Cloud sessions
    'cloud.session.sync.triggered': '📋 [CloudClient] Manually triggered session sync',
    'cloud.session.get.failed': '❌ Failed to get local sessions: {error}',
    'cloud.session.count.failed': '❌ Failed to get active session count: {error}',
    'session.cleaned.oldest': '🧹 Cleaned oldest session: {sessionId}',
    'session.created.new': '✨ Created new session: {sessionId}',

    // Cloud mode message handling
    'cloud.mode.handle.message': '🌐 [CloudMode] Handling cloud message: {type}',
    'cloud.mode.create.session': '🎯 [CloudMode] Creating new session...',
    'cloud.mode.session.created': '✅ [CloudMode] Successfully created session: {sessionId}',
    'cloud.mode.session.initialized': '✅ [CloudMode] Session initialized: {sessionId}',
    'cloud.mode.session.not.exist': '❌ [CloudMode] Session does not exist: {sessionId}',
    'cloud.mode.session.init.failed': '❌ [CloudMode] Session initialization failed: {sessionId}, {error}',
    'cloud.mode.create.session.response': '✅ [CloudMode] CREATE_SESSION response sent to web {webId}: {status}',
    'cloud.mode.handle.command': '🎯 [CloudMode] Handling COMMAND message...',
    'cloud.mode.command.no.session': '❌ [CloudMode] COMMAND message missing sessionId',
    'cloud.mode.command.forward': '📨 [CloudMode] Forwarding COMMAND to session: {sessionId}',
    'cloud.mode.command.success': '✅ [CloudMode] COMMAND processed successfully',
    'cloud.mode.command.failed': '❌ [CloudMode] COMMAND processing failed: {error}',
    'cloud.mode.handle.ui.state': '🎯 [CloudMode] Handling REQUEST_UI_STATE message...',
    'cloud.mode.ui.state.no.session': '❌ [CloudMode] REQUEST_UI_STATE message missing sessionId',
    'cloud.mode.ui.state.get': '📨 [CloudMode] Getting session UI state: {sessionId}',
    'cloud.mode.ui.state.sent': '✅ [CloudMode] UI state response sent to web {webId}',
    'cloud.mode.ui.state.failed': '❌ [CloudMode] Failed to get UI state: {error}',
    'cloud.mode.handle.interrupt': '🛑 [CloudMode] Handling INTERRUPT message...',
    'cloud.mode.interrupt.no.session': '❌ [CloudMode] INTERRUPT message missing sessionId',
    'cloud.mode.interrupt.session': '🛑 [CloudMode] Interrupting session: {sessionId}',
    'cloud.mode.interrupt.success': '✅ [CloudMode] Session interrupted successfully',
    'cloud.mode.interrupt.failed': '❌ [CloudMode] Session interrupt failed: {error}',
    'cloud.mode.handle.clear.session': '🧹 [CloudMode] Handling CLEAR_SESSION message...',
    'cloud.mode.clear.session.no.session': '❌ [CloudMode] CLEAR_SESSION message missing sessionId',
    'cloud.mode.clear.session.cleaning': '🧹 [CloudMode] Cleaning session: {sessionId}',
    'cloud.mode.clear.session.success': '✅ [CloudMode] Session cleaned successfully',
    'cloud.mode.clear.session.failed': '❌ [CloudMode] Session cleanup failed: {error}',
    'cloud.mode.unhandled.message': '⚠️ [CloudMode] Unhandled message type: {type}',
    'cloud.mode.handle.message.failed': '❌ [CloudMode] Failed to handle cloud message: {error}',

    // Power management
    'power.management.check.title': '⚡ Power management check:',
    'power.management.macos.detected': '🍎 macOS system detected',
    'power.management.macos.warning': '⚠️  System may enter sleep state, which will interrupt remote connection',
    'power.management.macos.error': '❌ System may sleep, program will exit to ensure stable remote connection',
    'power.management.macos.solution.title': '💡 Solution:',
    'power.management.macos.solution.step1': '   1. Open "System Preferences" > "Energy Saver"',
    'power.management.macos.solution.step2': '   2. Enable "Prevent computer from sleeping automatically"',
    'power.management.macos.solution.step3': '   3. Or run command: sudo pmset -c sleep 0',
    'power.management.macos.ok': '✅ macOS system sleep disabled, remote connection will remain stable',
    'power.management.windows.detected': '🪟 Windows system detected',
    'power.management.windows.warning': '⚠️  To ensure stable remote connection, please adjust power settings:',
    'power.management.windows.solution.step1': '   1. Open "Settings" > "System" > "Power & sleep"',
    'power.management.windows.solution.step2': '   2. Set sleep to "Never"',
    'power.management.windows.solution.step3': '   3. Or run command: powercfg /change standby-timeout-ac 0',
    'power.management.linux.detected': '🐧 Linux system detected',
    'power.management.linux.warning': '⚠️  To ensure stable remote connection, please disable suspend:',
    'power.management.linux.solution.step1': '   1. Run command: sudo systemctl mask sleep.target suspend.target',
    'power.management.linux.solution.step2': '   2. Or disable auto-suspend in desktop environment',
    'power.management.check.failed': '⚠️  Unable to detect power management settings, please manually ensure system won\'t enter sleep state',
    'power.management.dev.hint': '💡 Tip: If this is a dev/test environment, you can temporarily ignore this suggestion',

    // Help UI text
    'help.basics.title': 'Basics:',
    'help.add.context': 'Add Context',
    'help.add.context.description': ': Use {symbol} to specify files as context (e.g., {example}) to specify specific files or folders.',
    'help.shell.mode': 'Shell Mode',
    'help.shell.mode.description': ': Execute shell commands via {symbol} (e.g., {example1}) or use natural language (e.g., {example2}).',
    'help.commands.title': 'Commands:',
    'help.shell.command.description': '- shell commands',
    'help.shortcuts.title': 'Keyboard Shortcuts:',
    'help.shortcut.enter': '- Send message',
    'help.shortcut.newline': '- New line',
    'help.shortcut.newline.linux': '- New line (some Linux distributions can use Alt+Enter)',
    'help.shortcut.history': '- Browse prompt history',
    'help.shortcut.word.jump': '- Jump cursor by word',
    'help.shortcut.toggle.edit': '- Toggle auto-accept edits',
    'help.shortcut.yolo.mode': '- Toggle YOLO mode',
    'help.shortcut.model.switch': '- Switch model',
    'help.shortcut.cancel': '- Cancel operation',
    'help.shortcut.exit': '- Exit application',

    // About Box
    'about.title': 'About DeepV Code',

    // Slash command descriptions
    'command.help.description': 'Get deepv-code help',
    'command.clear.description': 'Clear terminal screen (keeps conversation context)',
    'command.queue.description': 'Manage prompt queue',
    'command.queue.clear.description': 'Clear all queued prompts',
    'command.quit.description': 'Exit command line interface',
    'command.about.description': 'Show version information',
    'command.theme.description': 'Theme',
    'command.auth.description': 'Login to your account',
    'command.chat.description': 'Manage conversation history',
    'command.compress.description': 'Compress context through summary replacement',
    'command.compress.starting': 'Compressing context, approximately 20 seconds, please wait...',
    'command.copy.description': 'Copy last result or code snippet to clipboard',
    'command.editor.description': 'Set external editor preferences',
    'command.memory.description': 'Commands to interact with memory',
    'command.stats.description': 'View all statistics (session, model, and tools). Usage: /stats [model [name]|tools]',
    'command.context.description': 'View detailed context token usage breakdown',
    'command.tools.description': 'List available tools and their descriptions',
    'command.vim.description': 'Toggle vim mode',
    'command.yolo.description': 'Manage YOLO mode (auto-approve all tool calls)',
    'command.ppt.description': 'Create PowerPoint presentations with AI-assisted outline design',
    'command.ppt.prompt': 'What topic would you like to create a PPT for?\n\nExamples:\n  /ppt "AI in Education"\n  /ppt "2025 Annual Summary" --pages 15',
    'command.ppt.expected_pages': '\n\nExpected pages: {count}',
    'command.session.description': 'Session management - list, select and create conversation sessions',
    'command.trim.description': 'Manage automatic trailing space removal configuration (for C++, Python, etc.)',
    'command.myplan.description': 'Quick access to user information page',
    'command.account.description': 'Quick access to user information page',
    'command.account.opening_browser': '🌐 Opening browser for you...',
    'command.account.success': '✅ Browser opened successfully, please check the user information page',
    'command.account.error': '❌ Account command failed: {error}',
    'command.restore.description': 'Restore checkpoint. This restores conversation and file history to the state when checkpoint was created',
    'command.restore.no_checkpoints': '⚠️  No checkpoints in current session\n\n💡 Tips:\n  • Use /session select to choose a session with checkpoints\n  • After loading a session, use /restore to view and restore checkpoints',
    'command.mcp.description': 'List configured MCP servers and tools, or authenticate with OAuth servers',
    'command.docs.description': 'Open full DeepV Code documentation in browser',
    'command.extensions.description': 'List active extensions',
    'command.extensions.info.title': 'Extension System',
    'command.extensions.info.intro': 'DVCode supports Gemini CLI extensions. To manage extensions, use:',
    'command.extensions.info.install': 'Install extension',
    'command.extensions.info.list': 'List extensions',
    'command.extensions.info.validate': 'Validate config',
    'command.extensions.info.uninstall': 'Remove extension',
    'command.extensions.info.example': 'Example:',
    'command.extensions.info.learnmore': 'For more information, visit:',
    'command.extensions.info.url': 'https://dvcode.deepvlab.ai/extensions',
    'command.login.description': 'Start login server',
    'command.privacy.description': 'Display privacy statement',
    'command.corgi.description': 'Toggle corgi mode',
    'command.init.description': 'Analyzes the project and creates a tailored DEEPV.md file',
    'command.help-ask.description': 'AI-powered help assistant - ask anything about CLI features',
    'command.help-ask.description.cost-note': '(Uses 1 credit per question)',
    'command.help-ask.no-args': '❌ The /help-ask command does not accept arguments.\n\n✅ Correct usage: Just type /help-ask and press Enter to enter help mode, then ask your questions.',
    'command.refine.description': 'Professional prompt refinement: Clear expression, precise input, make AI understand you better',
    'command.refine.error.no-input': '⚠️  Please provide text to refine.\n\n📖 Usage:\n   /refine <your text>           - Refine inline text\n   /refine --file <path>         - Refine file content\n   echo "text" | deepv /refine --stdin  - Refine from stdin',
    'command.refine.error.read-stdin': 'Failed to read from stdin: {error}',
    'command.refine.error.read-file': 'Failed to read file "{file}": {error}',
    'command.refine.error.write-file': 'Failed to write file: {error}',
    'command.refine.error.from-last': 'Reading from last result is not yet supported',
    'command.refine.error.refine-failed': 'Refinement failed: {error}',
    'command.refine.success.file-written': '✅ File updated: {file}',
    'command.refine.info.dry-run': '🔍 Dry-run mode: File will not be modified',
    'command.refine.result.title': '✨ Refined Result',
    'command.refine.result.params': '📊 Parameters',
    'command.refine.result.params.language': '   Language: {detected} → {target}',
    'command.refine.result.params.tone': '   Tone: {tone} | Level: {level}',
    'command.refine.result.params.protection': '   Protection: {format}{code}',
    'command.refine.result.params.model': '   Model: {model}',
    'command.refine.result.params.rules': '   Rules: {rules}',
    'command.refine.result.changes': '📝 Changes',
    'command.refine.result.output': '✨ Refined Text',
    'command.refine.result.next-step': '\n💡 Next Steps:\n   • Copy the refined text above and send it to AI\n   • Or use /refine --out text for plain text output',
    'command.refine.confirm.title': '✨ Refinement Complete',
    'command.refine.confirm.hint.send': '⏎  Send to AI',
    'command.refine.confirm.hint.refine-again': 'R  Refine again',
    'command.refine.confirm.hint.cancel': 'Esc  Cancel',
    'command.refine.loading.title': 'Refining...',
    'command.refine.loading.message': 'AI is refining your text, please wait...',

    // NanoBanana Command
    'command.nanobanana.description': 'Generate images using NanoBanana. Usage: /NanoBanana <ratio> <size> <prompt> [@image]',
    'nanobanana.usage.error': 'Usage: /NanoBanana <ratio> <size> <prompt> [@image]\nRatio: 1:1, 16:9, 9:16, etc.\nSize: 1K or 2K\n@image can appear anywhere in the command\nExample: /NanoBanana 16:9 2K A futuristic city @ref.jpg',
    'nanobanana.missing.prompt': 'Missing required parameters. Usage: /NanoBanana <ratio> <size> <prompt> [@image]',
    'nanobanana.invalid.size': 'Invalid image size. Use 1K or 2K. Usage: /NanoBanana <ratio> <size> <prompt>',
    'nanobanana.submitting': 'Submitting image generation task...\nPrompt: "{prompt}"\nRatio: {ratio}',
    'nanobanana.submitted': 'Task submitted (ID: {taskId}).\nEstimated Credits: {credits} (Subject to actual deduction)\nWaiting for image generation...',
    'nanobanana.timeout': 'Image generation timed out after {seconds}s.',
    'nanobanana.completed': 'Image generation completed!\nActual Credits: {credits}\n{urlText}',
    'nanobanana.failed': 'Image generation failed: {error}',
    'nanobanana.auth.failed': 'Authentication failed. Please run /login or /auth to authenticate first.',
    'nanobanana.submit.failed': 'Failed to submit task: {error}',
    'nanobanana.uploading_image': 'Uploading image: {path}...',
    'nanobanana.image_uploaded': 'Image uploaded successfully.',
    'nanobanana.upload_failed': 'Failed to upload image: {error}',
    'nanobanana.tip.use_at_for_image': 'Use @ to select a reference image',
    'nanobanana.tip.use_at_for_image.description': 'Type @ followed by a filename to search for images',

    // Common terms
    'common.format': 'Format',
    'common.code': 'Code',
    'error.empty.content': 'Empty content',

    'command.ide.description': 'Manage IDE integration',
    'command.mcp.auth.description': 'Authenticate with OAuth-enabled MCP servers',
    'command.mcp.list.description': 'List configured MCP servers and tools',
    'command.mcp.refresh.description': 'Refresh MCP servers and tools list',
    'command.mcp.load.description': 'Load or reconnect a specific MCP server',
    'command.mcp.load.usage': 'Usage: /mcp load <server-name>',
    'command.mcp.load.success': '✅ MCP server \'{serverName}\' loaded successfully.',
    'command.mcp.load.failed': '❌ Failed to load MCP server \'{serverName}\': {error}',
    'command.mcp.unload.description': 'Unload an MCP server from the current session',
    'command.session.list.description': 'List all available session records',
    'command.session.select.description': 'Select and load specified session. Usage: /session select <number or session-id>',
    'command.session.create.description': 'Create new session record',

    // Session command messages
    'session.new.success': 'New session created successfully!',
    'session.new.createdAt': 'Created at',
    'session.new.canStartChat': 'You can now start chatting with AI.',
    'session.list.createdAt': 'Created at',
    'session.list.lastActive': 'Last active',
    'session.list.messageCount': 'Message count',
    'session.list.tokenUsage': 'Token usage',
    'session.list.model': 'Model',
    'session.list.checkpoint': 'Checkpoint',
    'session.list.checkpoint.yes': 'Yes',
    'session.list.checkpoint.no': 'No',
    'session.list.title': 'Available session records:',
    'session.list.firstQuestion': 'First question',
    'session.list.lastQuestion': 'Last question',
    'session.list.tips': 'Tips:',
    'session.list.selectSession': 'Select session: /session select <number or session-id>',
    'session.list.createSession': 'Create new session: /session new',
    'session.list.helpInfo': 'View help: /session help',
    'command.session.rebuild.description': 'Rebuild session index (fix session list display issues)',
    'command.session.help.description': 'Show session management help information',
    'command.chat.list.description': 'List saved conversation checkpoints', // 已被 /session 替代，但保留以支持旧代码
    'command.chat.delete.description': 'Delete saved conversation checkpoints. Usage: /chat delete <label> or /chat delete --all', // 已被 /session 替代，但保留以支持旧代码
    'command.memory.show.description': 'Show current memory content',
    'command.memory.add.description': 'Add content to memory',
    'command.memory.refresh.description': 'Refresh memory content from source files',

    // Memory command messages
    'memory.add.trying': 'Trying to save to memory',
    'memory.add.refreshSuccess': 'Memory automatically refreshed and updated to AI model.',
    'memory.add.refreshError': 'Failed to auto-refresh memory',
    'memory.add.configNotLoaded': 'Configuration not loaded, unable to save memory',
    'memory.add.saveError': 'Failed to save memory',
    'memory.refreshed': 'Loaded {charCount} characters from {fileCount} file(s).',
    'memory.refresh.refreshing': 'Refreshing memory from source files...',
    'memory.refresh.success': 'Memory refreshed and updated to AI model successfully.',
    'memory.refresh.noContent': 'Memory refreshed successfully. No memory content found.',
    'command.stats.model.description': 'Show model-specific usage statistics. Usage: /stats model [model name]',
    'command.stats.tools.description': 'Show tool-specific usage statistics',
    'command.stats.error.noSessionStartTime': 'Session start time is unavailable, cannot calculate stats.',
    'command.stats.error.modelNotFound': 'Model "{modelName}" not found in statistics. Use /stats model to see all available models.',

    // Model Stats Display - Full Format
    'model.stats.title': 'Geek Model Statistics',
    'model.stats.no.calls': 'No API calls have been made in this session yet.',
    'model.stats.header.metric': 'Metric',
    'model.stats.header.model': 'Model',
    'model.stats.section.api': 'API',
    'model.stats.metric.requests': 'Requests',
    'model.stats.metric.errors': 'Errors',
    'model.stats.metric.avg.latency': 'Avg Latency',
    'model.stats.section.tokens': 'Tokens',
    'model.stats.metric.total': 'Total',
    'model.stats.metric.prompt': 'Prompt',
    'model.stats.metric.cache': 'Cache',
    'model.stats.metric.thoughts': 'Thoughts',
    'model.stats.metric.tool': 'Tool',
    'model.stats.metric.output': 'Output',
    'model.reasoning': 'Model Thinking',

    // Tool Stats Display - Full Format
    'tool.stats.title': 'Tool Stats For Nerds',
    'tool.stats.header.tool.name': 'Tool Name',
    'tool.stats.header.calls': 'Calls',
    'tool.stats.header.success.rate': 'Success Rate',
    'tool.stats.header.avg.time': 'Avg Time',
    'tool.stats.header.response.size': 'Response Size',
    'tool.stats.decision.summary': 'User Decision Summary',
    'tool.stats.decision.reviewed.total': 'Total Reviewed Suggestions:',
    'tool.stats.decision.accepted': 'Accepted:',
    'tool.stats.decision.rejected': 'Rejected:',
    'tool.stats.decision.modified': 'Modified:',
    'tool.stats.decision.overall.rate': 'Overall Acceptance Rate:',

    // MCP Command Messages
    'mcp.wizard.title': '🔧 MCP Server Configuration Wizard',
    'mcp.wizard.config.ways': 'Available configuration methods:',
    'mcp.wizard.predefined': 'Predefined Templates',
    'mcp.wizard.predefined.desc': 'Quick setup for common servers (GitHub, SQLite, etc.)',
    'mcp.wizard.custom': 'Custom Configuration',
    'mcp.wizard.custom.desc': 'Manual server parameter configuration',
    'mcp.wizard.view.templates': 'View Template List',
    'mcp.wizard.view.templates.desc': 'Browse all available templates',
    'mcp.wizard.available.templates': 'Available predefined templates:',
    'mcp.wizard.examples': 'Usage examples:',
    'mcp.wizard.help.hint': 'Tip: Use \'/mcp help add\' for detailed parameter documentation',

    'mcp.add.description': 'Add new MCP server configuration',
    'mcp.error.template.not.exist': '❌ Template \'{templateName}\' does not exist\n\nAvailable templates: {availableTemplates}',
    'mcp.error.server.already.exists': '❌ MCP server \'{serverName}\' already exists\n\nUse a different name or delete the existing configuration first',
    'mcp.error.missing.connection.params': '❌ Missing connection parameters\n\nPlease specify one of the following connection methods:\n  --command <cmd>     Executable command\n  --url <url>         SSE server URL\n  --http-url <url>    HTTP server URL\n  --tcp <host:port>   TCP connection address\n\nExample: /mcp add my-server --command "npx @my/mcp-server"',
    'mcp.error.save.config.failed': '❌ Failed to save configuration: {error}',
    'mcp.success.server.added': '✅ MCP server \'{serverName}\' added successfully!',
    'mcp.success.config.location': '📍 Configuration location:',
    'mcp.success.template': '🏷️  Template:',
    'mcp.success.description': '📝 Description:',
    'mcp.success.connection.method': '🔗 Connection method:',
    'mcp.success.command': 'Command: {command}',
    'mcp.success.sse': 'SSE: {url}',
    'mcp.success.http': 'HTTP: {url}',
    'mcp.success.tcp': 'TCP: {tcp}',
    'mcp.success.unknown': 'Unknown',
    'mcp.success.config.effective': 'Configuration is now active! Use \'/mcp\' to view server status',
    'mcp.warning.missing.env': '⚠️  Missing environment variables:',
    'mcp.setup.instructions': '🔧 Setup instructions:',
    'mcp.setup.default.instruction': 'Please refer to server documentation for environment variable setup',
    'mcp.related.links': '📚 Related links:',

    'mcp.status.no.servers.title': '🔧 No MCP Servers Configured',
    'mcp.status.no.servers.description': 'MCP (Model Context Protocol) allows you to connect external tools and services, extending DeepV Code functionality.',
    'mcp.status.quick.start': '🚀 Quick Start:',
    'mcp.status.predefined.templates': '1️⃣ Use Predefined Templates (Recommended)',
    'mcp.status.interactive.wizard': '2️⃣ Interactive Configuration Wizard',
    'mcp.status.custom.config': '3️⃣ Custom Configuration',
    'mcp.status.get.help': '📚 Get Help:',
    'mcp.status.help.complete': 'View complete help system',
    'mcp.status.help.detailed': 'Detailed configuration guide',
    'mcp.status.help.templates': 'Predefined template list',
    'mcp.status.help.examples': 'Configuration examples',
    'mcp.status.tip': '💡 Tip: Configuration will be saved in',
    'mcp.status.config.file': '.deepv/settings.json',
    'mcp.status.run.after.config': 'After configuration, run',
    'mcp.status.view.status': 'to view server status',

    'mcp.status.starting': '⏳ MCP servers are starting up ({count} initializing)...',
    'mcp.status.configured.servers': 'Configured MCP servers:',
    'mcp.status.ready': 'Ready',
    'mcp.status.connecting': 'Connecting',
    'mcp.status.disconnected': 'Disconnected',
    'mcp.status.from.extension': '(from {extensionName})',

    'mcp.auth.no.oauth.servers': 'No MCP servers configured with OAuth authentication.',
    'mcp.auth.oauth.servers.list': 'OAuth-enabled MCP servers:\n{servers}\n\nUse /mcp auth <server-name> to authenticate.',
    'mcp.auth.server.not.found': 'MCP server \'{serverName}\' not found.',
    'mcp.auth.starting': 'Starting OAuth authentication for MCP server \'{serverName}\'...',
    'mcp.auth.opening.browser': 'Opening browser for authentication...',
    'mcp.auth.success': '✅ Authentication successful with MCP server \'{serverName}\'!',
    'mcp.auth.failed': 'Authentication failed with MCP server \'{serverName}\': {error}',
    'mcp.auth.rediscovering.tools': 'Rediscovering tools for \'{serverName}\'...',
    'mcp.auth.refresh.success': 'Successfully authenticated and refreshed tools for \'{serverName}\'.',

    'mcp.refresh.starting': 'Refreshing MCP servers and tools...',
    'command.mcp.unload.server.not.found': '❌ MCP server \'{serverName}\' not found.',
    'command.mcp.unload.success': '✅ MCP server \'{serverName}\' unloaded successfully.',
    'command.mcp.unload.failed': '❌ Failed to unload MCP server \'{serverName}\': {error}',
    'command.mcp.unload.usage': 'Usage: /mcp unload <server-name>',

    'mcp.help.system.title': '🔧 MCP (Model Context Protocol) Help System',
    'mcp.help.system.description': 'MCP allows you to connect external tools and services, extending DeepV Code functionality.',
    'mcp.help.commands.title': '📋 Available Commands:',
    'mcp.help.description': 'MCP Help System - Get detailed usage guides and configuration help',

    // Main help content
    'mcp.help.main.title': '🔧 MCP (Model Context Protocol) Help System',
    'mcp.help.main.description': 'MCP allows you to connect external tools and services, extending DeepV Code functionality.',
    'mcp.help.main.commands.title': '📋 Available Commands:',
    'mcp.help.main.command.status': '- View configured MCP server status',
    'mcp.help.main.command.add': '- Add new MCP server',
    'mcp.help.main.command.auth': '- OAuth server authentication',
    'mcp.help.main.command.refresh': '- Reconnect all MCP servers',
    'mcp.help.main.detailed.title': '📚 Get Detailed Help:',
    'mcp.help.main.help.add': '- Learn how to add MCP servers',
    'mcp.help.main.help.templates': '- View predefined server templates',
    'mcp.help.main.help.examples': '- View configuration examples',
    'mcp.help.main.help.troubleshooting': '- Solve common problems',
    'mcp.help.main.help.oauth': '- OAuth authentication configuration',
    'mcp.help.main.help.security': '- Security best practices',
    'mcp.help.main.quickstart.title': '🚀 Quick Start:',
    'mcp.help.main.quickstart.step1': 'Run {command} to start configuration wizard',
    'mcp.help.main.quickstart.step2': 'Select predefined templates (like GitHub, SQLite)',
    'mcp.help.main.quickstart.step3': 'Configure environment variables as prompted',
    'mcp.help.main.quickstart.step4': 'Run {command} to verify connection status',
    'mcp.help.main.tip': '💡 Tips: Configuration saved in {path} file',
    'mcp.help.main.subcommand': 'Enter subcommand for detailed help, e.g.: {example}',

    // Templates help content
    'mcp.help.templates.title': '📋 MCP Predefined Template List',
    'mcp.help.templates.description': 'These templates provide pre-configuration for common MCP servers, requiring minimal setup.',
    'mcp.help.templates.github.title': '🐙 GitHub (Recommended)',
    'mcp.help.templates.github.purpose': 'Purpose: GitHub repository operations, Issue management, PR comments',
    'mcp.help.templates.github.command': 'Command: {command}',
    'mcp.help.templates.github.env': 'Environment Variables: GITHUB_PERSONAL_ACCESS_TOKEN',
    'mcp.help.templates.github.tools': 'Tools: create_issue, comment_on_pr, get_issues, create_pr',
    'mcp.help.templates.github.docs': 'Documentation: https://github.com/github/github-mcp-server',
    'mcp.help.templates.sqlite.title': '💾 SQLite',
    'mcp.help.templates.sqlite.purpose': 'Purpose: Database queries and operations',
    'mcp.help.templates.sqlite.command': 'Command: {command}',
    'mcp.help.templates.sqlite.args': 'Arguments: Database file path',
    'mcp.help.templates.sqlite.tools': 'Tools: query, create_table, insert, update',
    'mcp.help.templates.sqlite.example': 'Example: {example}',
    'mcp.help.templates.filesystem.title': '📁 Filesystem',
    'mcp.help.templates.filesystem.purpose': 'Purpose: Local file and directory operations',
    'mcp.help.templates.filesystem.command': 'Command: {command}',
    'mcp.help.templates.filesystem.args': 'Arguments: Root directory to access',
    'mcp.help.templates.filesystem.tools': 'Tools: read_file, write_file, list_dir, create_dir',
    'mcp.help.templates.filesystem.example': 'Example: {example}',
    'mcp.help.templates.search.title': '🔍 Brave Search',
    'mcp.help.templates.search.purpose': 'Purpose: Web search functionality',
    'mcp.help.templates.search.command': 'Command: {command}',
    'mcp.help.templates.search.env': 'Environment Variables: BRAVE_API_KEY',
    'mcp.help.templates.search.tools': 'Tools: web_search, news_search',
    'mcp.help.templates.search.register': 'Registration: https://api.search.brave.com/register',
    'mcp.help.templates.slack.title': '💬 Slack (Beta)',
    'mcp.help.templates.slack.purpose': 'Purpose: Slack message sending and management',
    'mcp.help.templates.slack.command': 'Command: {command}',
    'mcp.help.templates.slack.env': 'Environment Variables: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET',
    'mcp.help.templates.slack.tools': 'Tools: send_message, list_channels, get_history',
    'mcp.help.templates.http.title': '🌐 HTTP',
    'mcp.help.templates.http.purpose': 'Purpose: Generic HTTP request tool',
    'mcp.help.templates.http.command': 'Command: {command}',
    'mcp.help.templates.http.tools': 'Tools: get_request, post_request, put_request',
    'mcp.help.templates.tips.title': '💡 Usage Tips:',
    'mcp.help.templates.tips.check': '• Templates automatically check dependencies and environment variables',
    'mcp.help.templates.tips.wizard': '• Support interactive configuration wizard',
    'mcp.help.templates.tips.custom': '• Can be customized based on templates',
    'mcp.help.templates.tips.update': '• Templates are updated regularly, run {command} to get latest version',
    'mcp.help.templates.need.more': '❓ Need other templates?',
    'mcp.help.templates.github.issues': 'Submit an Issue on GitHub: https://github.com/your-repo/issues',
    'mcp.help.templates.custom.wizard': 'Or run {command} to use custom configuration wizard',

    // OAuth help content
    'mcp.help.oauth.title': '🔐 MCP OAuth Authentication Configuration Guide',
    'mcp.help.oauth.description': 'OAuth authentication allows MCP servers to securely access third-party services like GitHub, Google, etc.',
    'mcp.help.oauth.supported.title': '📋 Supported Authentication Types',
    'mcp.help.oauth.dynamic.title': '🔹 Dynamic Discovery (Recommended)',
    'mcp.help.oauth.dynamic.description': 'Automatically discover OAuth configuration from server',
    'mcp.help.oauth.dynamic.example': '/mcp add github --oauth',
    'mcp.help.oauth.google.title': '🔹 Google Credentials',
    'mcp.help.oauth.google.description': 'Use Google service account authentication',
    'mcp.help.oauth.google.example': '/mcp add google-service --auth-provider google_credentials',
    'mcp.help.oauth.quickstart.title': '🚀 Quick Configuration',
    'mcp.help.oauth.quickstart.step1.title': '1️⃣ Enable OAuth',
    'mcp.help.oauth.quickstart.step1.example': '/mcp add my-server --oauth',
    'mcp.help.oauth.quickstart.step2.title': '2️⃣ Complete Authentication',
    'mcp.help.oauth.quickstart.step2.example': '/mcp auth my-server',
    'mcp.help.oauth.quickstart.step3.title': '3️⃣ Verify Status',
    'mcp.help.oauth.quickstart.step3.example': '/mcp  # View authentication status',
    'mcp.help.oauth.best.practices.title': '💡 Authentication Best Practices',
    'mcp.help.oauth.best.practices.update': '• Regularly update access tokens',
    'mcp.help.oauth.best.practices.minimal': '• Use minimal permissions principle',
    'mcp.help.oauth.best.practices.protect': '• Protect client secrets',
    'mcp.help.oauth.best.practices.monitor': '• Monitor authentication status',

    // MCP Status Display Additional Messages
    'mcp.status.github.tools.desc': 'GitHub repository tools',
    'mcp.status.sqlite.tools.desc': 'SQLite database tools',
    'mcp.status.filesystem.tools.desc': 'Local file operation tools',
    'mcp.status.search.tools.desc': 'Network search tools',
    'mcp.status.start.wizard.desc': 'Start configuration wizard',
    'mcp.status.oauth.token.expired': '(OAuth token expired)',
    'mcp.status.oauth.authenticated': '(OAuth authenticated)',
    'mcp.status.oauth.not.authenticated': '(OAuth not authenticated)',
    'mcp.status.zero.tools': '(0 tools)',
    'mcp.status.tools.prompts.ready': '(tools and prompts will appear when ready)',
    'mcp.status.tools.cached.count': '({count} tools cached)',
    'mcp.status.no.tools.prompts': 'No available tools or prompts',
    'mcp.status.no.tools.simple': 'No available tools',
    'mcp.status.type.auth.command': '(Type "/mcp auth {serverName}" to authenticate)',
    'mcp.status.blocked.server': 'Blocked',
    'mcp.status.tools.count': '{count} {unit}',
    'mcp.status.tool.unit.singular': 'tool',
    'mcp.status.tool.unit.plural': 'tools',
    'mcp.status.prompts.count': '{count} {unit}',
    'mcp.status.prompt.unit.singular': 'prompt',
    'mcp.status.prompt.unit.plural': 'prompts',
    'mcp.status.tools.label': 'Tools:',
    'mcp.status.prompts.label': 'Prompts:',
    'mcp.status.parameters.label': 'Parameters:',
    'mcp.status.tips': '💡 Tips:',
    'mcp.status.tip.desc': 'Use /mcp desc to show server and tool descriptions',
    'mcp.status.tip.schema': 'Use /mcp schema to show tool parameter schemas',
    'mcp.status.tip.nodesc': 'Use /mcp nodesc to hide descriptions',
    'mcp.status.tip.auth': 'Use /mcp auth <server-name> to authenticate with OAuth-enabled servers',
    'mcp.status.tip.toggle': 'Press Ctrl+T to toggle tool descriptions on/off',

    // Plan Mode
    'command.plan.description': 'Switch Plan mode: focus on requirements discussion, allow code reading but disable modifications',
    'plan.mode.indicator': 'plan mode - read only',
    'plan.mode.enabled.message': '📋 Entered Plan mode\nFeatures:\n• Focus on requirements understanding and solution design\n• Allow code reading and analysis tools\n• Disable code modifications and command execution\n• Suitable for initial requirements discussion and architecture planning\n• Use /plan off to exit this mode',
    'plan.mode.disabled.message': '✅ Exited Plan mode, now all tools and code modifications can be executed',
    'plan.mode.status.message': '📋 Plan mode status: {status}',
    'plan.mode.status.on': 'ON',
    'plan.mode.status.off': 'OFF',
    'plan.usage.error': 'Usage: /plan [on|off|status]',
    'plan.error.config.unavailable': 'Configuration unavailable',
    'plan.mode.blocked.tools': '🚫 Plan mode has disabled modification tools: {tools}',
    'plan.mode.focus.message': '📋 Currently focused on requirements discussion and solution design',
    'plan.mode.available.tools': '✅ Available tools: file reading, search analysis, task planning, network fetch',
    'plan.mode.exit.instruction': '💡 Use /plan off to exit Plan mode and enable modification operations',


    // Error messages
    'error.config.not.loaded': 'Configuration not loaded.',
    'error.tool.registry.unavailable': 'Unable to retrieve tool registry.',

    // Loop Detection Messages
    'loop.consecutive.tool.calls.title': '🔄 Repetitive Tool Calls Detected',
    'loop.consecutive.tool.calls.description': 'The AI model is repeatedly calling the same tool, exhausting context and API quota without making meaningful progress.\n\nWhy this happens:\n• The AI may be stuck exploring the same path\n• The current approach is not productive\n• Missing or unclear task context\n\nWhat to do:\n1. Review the task: Is the request clear and specific enough?\n2. Provide new guidance: Give the AI a different approach or new information\n3. Restart if needed: Use /session new to start with a fresh context\n\nExamples:\n• ❌ "Read all files to understand the codebase"\n• ✅ "Focus on src/auth.ts and explain the login flow"\n• ❌ "Fix the error"\n• ✅ "The error is in authentication. Check the token validation logic"',
    'loop.consecutive.tool.calls.action': 'Quick actions:\n• Continue with a more specific request\n• Ask the AI to try a different approach\n• Use /session new to start fresh',
    'loop.chanting.identical.sentences.title': '🔄 Repetitive Content Detected',
    'loop.chanting.identical.sentences.description': 'The AI model is repeatedly generating the same text or responses.',
    'loop.chanting.identical.sentences.action': 'How to fix:\n• The model may be stuck on a specific pattern\n• Try breaking the pattern with a new instruction\n• Ask the AI to try a different approach\n• Continue the conversation with new context or /session new for a fresh start',
    'loop.llm.detected.title': '⚠️ Unproductive Loop Detected',
    'loop.llm.detected.description': 'The AI model appears to be stuck without making meaningful progress on the task.',
    'loop.llm.detected.action': 'How to fix:\n• Provide clearer task requirements or accept the current progress\n• Refocus the AI on the core problem\n• Consider breaking the task into smaller subtasks\n• Continue with new instructions or /session new to restart',

    // Daily Tips
    'tip.help': '/help - View all available commands',
    'tip.theme': '/theme - Change theme appearance',
    'tip.auth': '/auth - Login to your account',
    'tip.stats': '/stats - View session statistics',
    'tip.memory': '/memory - Manage AI context memory',
    'tip.mcp': '/mcp - Connect external tools and services',
    'tip.tools': '/tools - View available tools',
    'tip.init': '/init - Create DEEPV.md file for project',
    'tip.model': '/model - Switch AI model',
    'tip.plan': '/plan - Enable plan mode',
    'tip.docs': '/docs - Open documentation',
    'tip.session': '/session - Manage sessions',
    'tip.restore': '/restore - Restore previous session state',
    'tip.at.filepath': '@<filepath> - Add file to context',
    'tip.shell.command': '!<command> - Execute shell command',
    'tip.shell.mode': '! - Enter/exit shell mode',
    'tip.ctrl.j': 'Ctrl+J - Multiline input',
    'tip.cli.update': 'dvcode -u - Check for updates',
    'tip.cli.cloud': 'dvcode --cloud-mode - Enable cloud remote control',

    // Skills System
    'skill.command.description': 'Manage AI Skills (Marketplace → Plugin → Skill)',
    'skill.help.text': 'DeepV Code Skills System\n\nManage AI Skills with a three-tier architecture:\n  Marketplace → Plugin → Skill\n\nCommands:\n  /skill marketplace list              - List all marketplaces\n  /skill marketplace add <url> [alias] - Add a marketplace\n  /skill marketplace update <name>     - Update marketplace\n  /skill marketplace remove <name>     - Remove marketplace\n  /skill marketplace browse <name>     - Browse plugins\n\n  /skill plugin list [marketplace]     - List plugins\n  /skill plugin install <mp> <name>    - Install a plugin\n  /skill plugin uninstall <id>         - Uninstall a plugin\n  /skill plugin enable <id>            - Enable a plugin\n  /skill plugin disable <id>           - Disable a plugin\n  /skill plugin info <id>              - Show plugin info\n\n  /skill list                          - List all skills\n  /skill info <id>                     - Show skill details\n  /skill stats                         - Show statistics\n\nQuick Start:\n  1. Add official marketplace:\n     /skill marketplace add https://github.com/anthropics/skills.git\n\n  2. Browse plugins:\n     /skill marketplace browse skills\n\n  3. Install a plugin:\n     /skill plugin install skills example-skills\n\n  4. View skills:\n     /skill list',
    'skill.marketplace.description': 'Manage Skills marketplaces',
    'skill.marketplace.usage': 'Usage: /skill marketplace <list|add|update|remove|browse>',
    'skill.marketplace.list.description': 'List all marketplaces',
    'skill.marketplace.list.empty': 'No marketplaces installed.',
    'skill.marketplace.list.empty.hint': 'Add one:\n  /skill marketplace add https://github.com/anthropics/skills.git',
    'skill.marketplace.list.found': 'Found {count} marketplace(s):\n\n',
    'skill.marketplace.list.failed': 'Failed to list marketplaces: {error}',
    'skill.marketplace.add.description': 'Add a marketplace from Git URL or local path',
    'skill.marketplace.add.usage': 'Usage: /skill marketplace add <url|path> [alias] [--name <name>]',
    'skill.marketplace.add.progress': 'Adding marketplace from {url}{name}...',
    'skill.marketplace.add.success': '✅ Successfully added: {name}\n   ID: {id}\n   Plugins: {count}',
    'skill.marketplace.add.failed': 'Failed to add marketplace: {error}',
    'skill.marketplace.update.description': 'Update a marketplace (git pull)',
    'skill.marketplace.update.usage': 'Usage: /skill marketplace update <name>',
    'skill.marketplace.update.progress': 'Updating marketplace {id}...',
    'skill.marketplace.update.success': '✅ Successfully updated: {name}\n   Plugins: {count}',
    'skill.marketplace.update.failed': 'Failed to update marketplace: {error}',
    'skill.marketplace.remove.description': 'Remove a marketplace',
    'skill.marketplace.remove.empty': 'No marketplaces installed.',
    'skill.marketplace.remove.select': 'Please select a marketplace to remove:\n\n',
    'skill.marketplace.remove.success': '✅ Successfully removed: {id}{files}',
    'skill.marketplace.remove.files_deleted': '\n   Files deleted from disk',
    'skill.marketplace.remove.failed': 'Failed to remove marketplace: {error}',
    'skill.marketplace.browse.description': 'Browse plugins in a marketplace',
    'skill.marketplace.browse.select': 'Please select a marketplace to browse:\n\n',
    'skill.marketplace.browse.empty': 'No plugins found in {id}{query}',
    'skill.marketplace.browse.found': 'Found {count} plugin(s) in {id}:\n\n',
    'skill.marketplace.browse.failed': 'Failed to browse marketplace: {error}',
    'skill.plugin.description': 'Manage Skills plugins',
    'skill.plugin.usage': 'Usage: /skill plugin <list|install|uninstall|enable|disable|info>',
    'skill.plugin.list.description': 'List installed plugins or available plugins',
    'skill.plugin.list.marketplace.empty': 'No plugins found in {id}',
    'skill.plugin.list.marketplace.found': 'Available plugins in {id}:\n\n',
    'skill.plugin.list.installed.empty': 'No plugins installed.\n\nInstall one:\n  /skill plugin install <marketplace> <plugin-name>',
    'skill.plugin.list.installed.found': 'Installed plugins ({count}):\n',
    'skill.plugin.list.failed': 'Failed to list plugins: {error}',
    'skill.plugin.install.description': 'Install a plugin from marketplace',
    'skill.plugin.install.usage': 'Usage: /skill plugin install <marketplace> <plugin-name>',
    'skill.plugin.install.progress': 'Installing plugin {plugin} from {marketplace}...',
    'skill.plugin.install.success': '✅ Successfully installed: {name}\n   ID: {id}\n   Skills: {count}\n   Status: Enabled',
    'skill.plugin.install.failed': 'Failed to install plugin: {error}',
    'skill.plugin.uninstall.description': 'Uninstall a plugin',
    'skill.plugin.uninstall.usage': 'Usage: /skill plugin uninstall <plugin-id>',
    'skill.plugin.uninstall.progress': 'Uninstalling plugin {id}...',
    'skill.plugin.uninstall.success': '✅ Successfully uninstalled: {id}',
    'skill.plugin.uninstall.failed': 'Failed to uninstall plugin: {error}',
    'skill.plugin.enable.description': 'Enable a plugin',
    'skill.plugin.enable.usage': 'Usage: /skill plugin enable <plugin-id>',
    'skill.plugin.enable.progress': 'Enabling plugin {id}...',
    'skill.plugin.enable.success': '✅ Successfully enabled: {id}\n\nSkills from this plugin are now available.',
    'skill.plugin.enable.failed': 'Failed to enable plugin: {error}',
    'skill.plugin.disable.description': 'Disable a plugin',
    'skill.plugin.disable.usage': 'Usage: /skill plugin disable <plugin-id>',
    'skill.plugin.disable.progress': 'Disabling plugin {id}...',
    'skill.plugin.disable.success': '✅ Successfully disabled: {id}\n\nSkills from this plugin are no longer available.',
    'skill.plugin.disable.failed': 'Failed to disable plugin: {error}',
    'skill.plugin.info.description': 'Show plugin details',
    'skill.plugin.info.usage': 'Usage: /skill plugin info <plugin-id>',
    'skill.plugin.info.not_found': 'Plugin {id} not found.',
    'skill.plugin.info.details': 'Plugin Details:\n',
    'skill.plugin.info.failed': 'Failed to get plugin info: {error}',
    'skill.list.description': 'List all available skills',
    'skill.list.empty': 'No skills found.',
    'skill.list.title': 'Available skills ({count}):\n',
    'skill.list.failed': 'Failed to list skills: {error}',
    'skill.info.description': 'Show skill details',
    'skill.info.usage': 'Usage: /skill info <skill-id>',
    'skill.info.not.found.hint': 'List all skills:\n  /skill list',
    'skill.info.details': 'Skill Details:\n',
    'skill.info.failed': 'Failed to get skill info: {error}',
    'skill.stats.description': 'Show skills statistics',
    'skill.stats.title': 'Skills Statistics:\n',
    'skill.stats.total': 'Total Skills: {count}',
    'skill.stats.failed': 'Failed to get stats: {error}',
    'skill.label.source': 'Source: ',
    'skill.label.plugins': 'Plugins: ',
    'skill.label.description': 'Description: ',
    'skill.label.official': '⭐ Official',
    'skill.label.id': 'ID: ',
    'skill.label.skills': 'Skills: ',
    'skill.label.tools': 'Tools: ',
    'skill.label.name': 'Name: ',
    'skill.label.marketplace': 'Marketplace: ',
    'skill.label.status': 'Status: ',
    'skill.label.enabled': '✅ Enabled',
    'skill.label.disabled': '❌ Disabled',
    'skill.label.parameters': 'Parameters:\n',
  },
  zh: {
    // Update flow
    'update.cache.write.error': '⚠️ 无法保存更新检查缓存：{error}',
    'update.time.today': '今天 {time}',
    'update.time.tomorrow': '明天 {time}',
    'update.status.skipped': '📅 升级检查状态：已跳过检查',
    'update.next.check.at': '⏰ 下次检查时间：{time}（{hours}小时后）',
    'update.next.check.simple': '⏰ 下次检查时间：{time}',
    'update.using.cache': '💾 使用缓存结果',
    'update.cache.expired.checking': '🔄 缓存已过期，正在检查更新...',
    'update.first.check.or.version.changed': '🔄 首次检查更新或版本已变更...',
    'update.checking': '🔍 正在检查更新...',
    'update.debug.package.name': '包名称',
    'update.debug.current.version': '当前版本',
    'update.debug.package.path': '包路径',
    'update.check.server': '🌐 检查服务器：{server}',
    'update.debug.request.url': '请求URL',
    'update.check.failed.http': '❌ 更新检查失败：HTTP {status}',
    'update.check.failed.message': '❌ 更新检查失败：{message}',
    'update.check.failed.generic': '❌ 检查更新失败：{error}',
    'update.found.new.version': '🎉 发现新版本：{current} → {latest}',
    'update.current.latest': '✅ 当前版本已是最新',
    'update.current.latest.full': '✅ 当前版本已是最新，无需更新',
    'update.force.message.header': 'DeepV Code 必须更新才能继续使用！',
    'update.available.message.header': '发现新版本可用！',
    'update.version.line': '当前版本：{current} → 最新版本：{latest}',
    'update.command.line': '📋 执行命令：{command}',
    'update.after.success.exit': '更新完成后应用程序将退出。',
    'update.auto.exec.start': '🚀 正在自动执行更新...',
    'update.auto.executing': '🚀 正在自动执行更新（使用 -u 参数）...',
    'update.completed': '✅ 更新完成！',
    'update.failed.code': '❌ 更新失败，退出码：{code}',
    'update.exec.command.error': '❌ 执行更新命令失败：{error}',
    'update.manual.run.hint': '💡 请手动执行更新命令',
    'update.prompt.auto': '🤖 是否自动执行更新？ (y/n): ',
    'update.prompt.now': '🤔 是否现在更新？ (y/n): ',
    'update.forced.title': '🚨 检测到强制更新',
    'update.available.title': '📢 发现新版本',
    'update.success.restart': '🎉 更新完成！程序将退出，请重新运行 dvcode',
    'update.manual.then.rerun': '💡 请手动执行更新命令，然后重新运行 dvcode',
    'update.continue.current': '✨ 继续使用当前版本...',
    'update.force.checking': '🔄 强制检查更新...',
    // Session Summary
    'agent.powering.down': '感谢使用DeepV Code！ 如要继续上次对话 可执行dvcode -c',

    // Input Prompt
    'input.placeholder.base': '输入您的消息或 @文件路径',
    'input.placeholder.help_ask': '可以问问本程序如何使用？按 esc 退出帮助模式',
    'input.hint.newline.win32': 'Ctrl+Enter换行',
    'input.hint.newline.win32.vscode': 'Shift+Enter换行 (VSCode)',
    'input.hint.newline.win32.idea': 'Ctrl+J换行 (IDEA)',
    'input.hint.newline.darwin': 'Ctrl+J换行',
    'input.hint.newline.darwin.vscode': 'Ctrl+J换行 (VSCode)',
    'input.hint.newline.darwin.idea': 'Ctrl+J换行 (IDEA)',
    'input.hint.newline.linux': 'Ctrl+J换行',
    'input.hint.newline.linux.idea': 'Ctrl+J换行 (IDEA)',
    'input.hint.newline.default': 'Ctrl+J换行',

    // Cancel hints
    'input.hint.cancel.default': 'esc: 取消',
    'input.hint.cancel.win32.idea': 'ctrl+q: 取消',
    'input.hint.cancel.darwin.idea': 'ctrl+q: 取消',
    'input.hint.cancel.linux.idea': 'ctrl+q: 取消',
    'input.paste.detected': '已检测到 {count} 个长文本粘贴片段，输入框中显示摘要版本。发送时将使用完整内容。',
    'input.paste.segment': '片段 {index}: {lines} 行',
    'input.paste.clipboard.image': '🖼️ 正在从剪贴板粘贴图片...',
    'input.paste.unified.hotkey': 'Ctrl+V 统一粘贴（图像或文本）',
    'input.paste.vscode.recommendation': '在 VSCode 终端中，使用 Ctrl+V 进行统一粘贴',
    'input.queue.busy': '🤖 模型正在思考，新的指令会进入队列。',
    'input.queue.working': '正在处理 (esc 中断)',
    'input.queue.edit.hint': 'ctrl + ↑ 编辑',
    'input.queue.edit.mode': '编辑队列 #{current}/{total}',
    'input.queue.edit.actions': 'enter 保存 • esc 取消 • ctrl+↑ 下一条',
    'input.queue.item.updated': '✅ 已更新队列第 {position} 条',
    'input.queue.item.deleted': '🗑️ 已删除队列第 {position} 条',
    'input.queue.count': '📝 已排队 {count} 条指令',
    'input.queue.preview': '下一条：{preview}',
    'input.queue.added': '已加入队列 (第 {position} 条)：{preview}',
    'input.queue.cleared': '✅ 已清空 {count} 条排队指令',
    'input.queue.empty': 'ℹ️ 队列已为空',
    'completion.clipboard.description': '粘贴剪贴板内容（图片或文本）',

    // Suggestions Display
    'suggestions.loading': '正在加载建议...',

    // Stats Display sections
    'section.interaction.summary': '交互总结',
    'section.performance': '性能统计',
    'section.model.usage': '模型使用情况',

    // Stats Display labels
    'stats.tool.calls': '工具调用:',
    'stats.success.rate': '成功率:',
    'stats.user.agreement': '用户同意率:',
    'stats.wall.time': '总时长:',
    'stats.agent.active': 'Agent 活跃时间:',
    'stats.api.time': 'API 时间:',
    'stats.tool.time': '工具时间:',
    'stats.session.stats': '会话统计',
    'stats.reviewed': '已审查',

    // Compact Stats Display
    'stats.compact.token.usage': 'Token 使用情况',
    'stats.compact.input': '输入',
    'stats.compact.cache.read': '缓存读取',
    'stats.compact.output': '输出',
    'stats.compact.total': '总计',
    'stats.compact.credits': '积分',
    'stats.compact.cache.hit.rate': '缓存命中率',

    // Compact Model Stats Display
    'stats.compact.model.requests': '请求',
    'stats.compact.model.errors': '错误',
    'stats.compact.model.avg.latency': '平均延迟',

    // Compact Tool Stats Display
    'stats.compact.tool.stats': '工具统计',
    'stats.compact.tool.total': '总计',
    'stats.compact.tool.success': '成功',
    'stats.compact.tool.fail': '失败',
    'stats.compact.tool.agreement': '接受率',
    'stats.compact.tool.reviewed': '已审核',
    'stats.compact.tool.calls': '调用',
    'stats.compact.tool.success.rate': '成功率',
    'stats.compact.tool.avg.time': '平均耗时',
    'stats.compact.tool.total.response.size': '总响应大小',

    // SubAgent Display labels
    'subagent.tool.calls': '工具调用:',
    'subagent.execution.time': '执行时间:',
    'subagent.token.consumption': 'Token消耗:',
    'subagent.tool.calls.count': '{count}次',

    // Tool Stats Display
    'tool.stats.no.calls': '本次会话中尚未进行工具调用。',

    // Model usage table headers
    'table.header.model': '模型',
    'stats.other.tools': '其他工具',
    'table.header.reqs': '请求',
    'table.header.input': '输入',
    'table.header.output': '输出',
    'table.header.cache': '缓存↗',
    'table.header.credits': '积分',
    'table.header.cost': '费用',

    // Token Usage Display
    'token.usage': 'Token 使用情况',
    'token.input': '输入: ',
    'token.output': '输出: ',
    'token.total': '总计: ',
    'token.credits': '积分: ',
    'token.cache.read': '缓存读取: ',
    'token.cache.create': '缓存创建: ',
    'token.efficiency': '缓存命中率: ',
    'token.no.cache': '无缓存命中 - 所有 token 均为新处理',

    // Token Breakdown Display
    'token.breakdown.title': '上下文占用细分统计',
    'token.breakdown.system': '系统提示词',
    'token.breakdown.user': '用户输入',
    'token.breakdown.memory': '记忆和上下文',
    'token.breakdown.tools': '工具和函数',
    'token.breakdown.total': '上下文总占用',

    // SubAgent Stats
    'subagent.activity': 'SubAgent 活动',
    'subagent.api.calls': 'API 调用: ',
    'subagent.token.usage': 'Token 使用: ',
    'subagent.errors': '错误',
    'subagent.of.total': '占总数',
    'subagent.prompt': '提示: ',
    'subagent.response': '响应: ',
    'subagent.cached': '缓存: ',
    'subagent.thoughts': '思考: ',
    'subagent.tool': '工具: ',
    'subagent.avg.latency': '平均延迟: ',

    // Task execution
    'task.timeout.warning': '⚠️ 任务执行超时：已执行{turns}轮对话但任务仍未完成',
    'task.timeout.credits.notice': '继续执行可能消耗更多 Credits，请谨慎审视。',

    // Conversation limits
    'conversation.token.limit.warning': '重要提示：上下文即将达到限制，对话上下文将被压缩以继续会话。\n如果你发现模型变得不够专注，可以使用 "/session new" 开启全新对话。',

    // Tool Names
    'tool.edit': '编辑',
    'tool.ppt_generate': 'PPT生成',
    'tool.ppt_generate.description': '提交PPT大纲并启动生成任务。\n\n此工具会执行以下操作：\n1. 将当前大纲提交到服务端\n2. 启动PPT生成任务\n3. 自动打开浏览器跳转到PPT编辑预览页面\n4. 退出PPT编辑模式\n\n调用前请确保已通过 ppt_outline 工具设置好大纲内容（主题、页数、大纲文本）。',
    'ppt_generate.param.confirm': '确认提交（默认true）',
    'tool.ppt_outline': 'PPT大纲',
    'tool.ppt_outline.description': '管理PPT大纲内容。支持以下操作：\n- init: 初始化PPT编辑模式，开始创建新PPT\n- update: 更新大纲内容（主题、页数、大纲文本）\n- view: 查看当前大纲状态\n- clear: 清除当前大纲并退出PPT模式',

    // Web Search
    'websearch.results.returned': '"{query}"的搜索结果已返回。{truncated}',
    'websearch.results.truncated': '（内容已截断）',
    'tool.readfile': '读取文件',
    'tool.writefile': '写入文件',
    'tool.searchtext': '搜索文本',
    'tool.todowrite': '写入待办',
    'tool.todoread': '读取待办',
    'tool.findfiles': '查找文件',
    'tool.readfolder': '读取文件夹',
    'tool.readmanyfiles': '批量读取',
    'tool.shell': '命令行',
    'tool.webfetch': '网页获取',
    'tool.websearch': '网络搜索',
    'tool.savememory': '保存记忆',
    'tool.task': '任务',

    // Shell output
    'shell.output.truncated': '... (显示最新 {maxLines} 行，共 {totalLines} 行)',

    // Text Truncator
    'text_truncator.omitted_lines': '[ ... 已省略显示 {count} 行 ... ]',


    // IDE Connection
    'ide.connected': '● 已与IDE连接',

    // Footer - Current Model
    'footer.current.model': '模型',

    // Tool Confirmation Messages
    'tool.confirmation.modifying': '修改进行中：',
    'tool.confirmation.save.editor': '保存并关闭外部编辑器以继续',
    'tool.confirmation.apply.changes': '应用此更改？',
    'tool.confirmation.once': '是，仅允许一次',
    'tool.confirmation.type.always': '是，此类型工具始终允许',
    'tool.confirmation.project.always': '是，本项目所有工具始终允许',
    'tool.confirmation.modify.editor': '使用外部编辑器修改',
    'tool.confirmation.cancel': '否 ({cancelKey})，告诉DeepV Code你的想法',
    'tool.confirmation.execute': '允许执行：\'{command}\'？',
    'tool.confirmation.type.always.exec': '是，本类型始终允许...',
    'tool.confirmation.continue': '您要继续吗？',
    'tool.confirmation.urls.label': '要获取的URL：',
    'tool.confirmation.mcp.server': 'MCP服务器：',
    'tool.confirmation.mcp.tool': '工具：',
    'tool.confirmation.mcp.execute': '允许执行MCP工具"{toolName}"（来自服务器"{serverName}"）？',
    'tool.confirmation.mcp.tool.always': '是，始终允许服务器"{serverName}"中的工具"{toolName}"',
    'tool.confirmation.mcp.server.always': '是，始终允许服务器"{serverName}"中的所有工具',
    'tool.confirmation.delete.file': '删除此文件？',


    // Git error messages
    'git.error.old.version.title': 'Git 版本过低',
    'git.error.old.version.message': '您的 Git 版本不支持检查点功能所需的 "--initial-branch" 选项。',
    'git.error.old.version.impact': '影响：文件检查点和快照功能将被禁用。',
    'git.error.old.version.solution': '解决方案：请升级 Git 至 2.28+ 版本，或在设置中禁用检查点功能。',
    'git.error.old.version.continuing': 'CLI 将在禁用检查点功能的情况下继续运行。',
    'git.error.not.available.title': 'Git 不可用',
    'git.error.not.available.message': 'Git 未安装或不在 PATH 环境变量中。',
    'git.error.not.available.impact': '影响：文件检查点和快照功能将被禁用。',
    'git.error.not.available.solution': '解决方案：请安装 Git 或在设置中禁用检查点功能。',
    'git.error.not.available.continuing': 'CLI 将在禁用检查点功能的情况下继续运行。',
    'git.error.init.failed.title': 'Git 初始化失败',
    'git.error.init.failed.message': '检查点功能的 Git 仓库初始化失败：{error}',
    'git.error.init.failed.impact': '影响：文件检查点和快照功能将被禁用。',
    'git.error.init.failed.solution': '解决方案：检查 Git 安装和权限，或禁用检查点功能。',
    'git.error.init.failed.continuing': 'CLI 将在禁用检查点功能的情况下继续运行。',

    // Checkpoint messages
    'checkpoint.creating': '正在执行自动检查点...',
    'checkpoint.created.success': '检查点已建立 ({checkpointId})',
    'checkpoint.created.failed': '检查点创建失败: {error}',
    'checkpoint.creation.skipped': '本次对话将跳过后续的自动检查点尝试',

    // Checkpoint CLI command
    'checkpoint.command.description': '管理检查点历史记录',
    'checkpoint.command.require.subcommand': '请指定子命令。使用 --help 查看可用命令。',
    'checkpoint.clean.description': '清理所有检查点历史记录以释放磁盘空间',
    'checkpoint.clean.force.description': '跳过确认提示',
    'checkpoint.clean.dryrun.description': '显示将要删除的内容但不实际删除',
    'checkpoint.clean.no.history': '✅ 未找到检查点历史记录。无需清理。',
    'checkpoint.clean.no.checkpoints': '✅ 检查点历史目录为空。无需清理。',
    'checkpoint.clean.summary': '📊 检查点历史概览：\n   项目数量：{count}\n   总大小：{size}\n   存储位置：{path}',
    'checkpoint.clean.dryrun.notice': '\n🔍 预览模式 - 未删除任何文件。',
    'checkpoint.clean.confirm': '\n⚠️  此操作将永久删除所有检查点历史记录。\n确定要继续吗？(y/N): ',
    'checkpoint.clean.cancelled': '❌ 操作已取消。',
    'checkpoint.clean.deleting': '🗑️  正在删除检查点历史...',
    'checkpoint.clean.success': '✅ 检查点历史清理完成。已释放 {size} 磁盘空间。',
    'checkpoint.clean.error': '❌ 清理检查点历史时出错：{error}',

    // Diff display messages
    'diff.new.file': '📄 新建文件',
    'diff.delete.file': '🗑️ 删除文件',
    'diff.modify.file': '📝',
    'diff.no.changes': '(无变更)',
    'diff.lines.unit': '行',
    'diff.test.header': '=== 小窗口diff显示优化测试 ===',
    'diff.stats.info': '统计信息:',
    'diff.simplified.display': '简化显示:',
    'diff.test.completed': '测试完成 ✅',

    // Startup Warnings
    'startup.warning.home.directory': '您正在主目录中运行 DeepV Code CLI。建议在项目特定目录中运行。',
    'startup.warning.root.directory': '警告：您正在根目录中运行 DeepV Code CLI。将使用整个文件夹结构作为上下文。强烈建议在项目特定目录中运行。',
    'startup.warning.filesystem.error': '由于文件系统错误，无法验证当前目录。',
    'startup.warning.custom.proxy.server': '🔗 检测到自定义代理服务器地址：{url}\n   您正在使用企业级服务器地址。',

    // DeepX Quota Error Messages
    'deepx.quota.no.configuration': '─────────────────────────────────────────────────────\n🚫 当前账户可用的 Credit（积分）不足以继续使用本服务\n💡 请考虑订阅更多额度的套餐。详情请访问官网：https://dvcode.deepvlab.ai/\n\n\x1b[33m🎁 如果希望获得免费体验机会，请联系我们的Boss：https://x.com/fusheng_0306\x1b[0m\n─────────────────────────────────────────────────────',
    'deepx.quota.exceeded.with.upgrade': '🚫 {model} 的日{limitType}已达上限\n💡 请升级套餐：https://dvcode.deepvlab.ai/',
    'deepx.quota.exceeded.default': '🚫 服务配额已达上限\n💡 请升级套餐：https://dvcode.deepvlab.ai/',
    'deepx.quota.limit.token': 'Token限额',
    'deepx.quota.limit.request': '请求次数限额',
    'deepx.quota.limit.cost': '费用限额',
    'deepx.quota.limit.generic': '配额限制',

    // Model Command Messages
    'model.command.description': '设置或查看首选模型',
    'model.command.no.preferred.set': '当前未设置首选模型。',
    'model.command.available.models': '可用模型',
    'model.command.from.server': '（从服务端获取）',
    'model.command.from.cache': '（从缓存）',
    'model.command.usage.instruction.set': '使用 /model <模型名称> 来设置首选模型。',
    'model.command.usage.instruction.set.friendly': '💡 提示：输入 /model 后按空格键或Tab键可直接选择模型，选中后按回车确认。',
    'model.command.current.preferred': '当前首选模型：{model}',
    'model.command.usage.instruction.change': '使用 /model <模型名称> 来更改模型。',
    'model.command.usage.instruction.change.friendly': '💡 提示：输入 /model 后按空格键或Tab键可直接选择模型，选中后按回车确认。',
    'model.command.invalid.model': '无效的模型：{model}',
    'model.command.switching': '正在切换到模型 {model}，请稍候...',
    'model.command.set.success': '✅ 已设置首选模型为：{model}',
    'model.command.credit.cost': '💰 单次请求消耗：{credits}x credits',
    'model.command.credit.cost.long.context': '💰 长上下文 (>{threshold} tokens)：{credits}x credits',
    'model.command.long.context.short': '长上下文 >{threshold}: {credits}x',
    'model.command.auto.mode': '🤖 服务端将根据请求类型自动选择最适合的模型',
    'model.command.not.logged.in': '❌ 您尚未登录。',
    'model.command.please.login': '💡 请先使用 /auth 命令登录账号。',

    // Model Dialog Messages
    'model.dialog.title': '选择 AI 模型',
    'model.dialog.current': '当前: {model}',
    'model.dialog.loading': '正在加载模型列表...',
    'model.dialog.error.not.logged.in': '您尚未登录，请先使用 /auth 命令登录',
    'model.dialog.error.load.failed': '加载模型列表失败: {error}',
    'model.dialog.details.title': '模型详情',
    'model.dialog.details.name': '名称: ',
    'model.dialog.details.cost': '消耗: ',
    'model.dialog.details.context': '上下文: ',
    'model.dialog.details.long.context': '长上下文: ',
    'model.dialog.details.status': '状态: ',
    'model.dialog.details.available': '可用',
    'model.dialog.details.unavailable': '不可用',
    'model.dialog.hint.tiny': '(回车选择，ESC退出)',
    'model.dialog.hint.normal': '(按回车键选择模型，按 ESC 键退出)',
    'model.dialog.set.failed': '设置模型失败: {error}',

    // Tips Component Messages
    'tips.guide.title': '使用指南：',
    'tips.guide.step1': '1. 提问、编辑文件或运行命令。',
    'tips.guide.step2': '2. 描述越具体，效果越好。',
    'tips.guide.step3': '3. 创建',
    'tips.guide.deepv.file': 'DEEPV.md',
    'tips.guide.step3.suffix': '文件来自定义与 DeepV Code 的交互。',
    'tips.guide.help': '/help',
    'tips.guide.help.suffix': '获取更多信息。',

    // Header Component Messages
    'header.debug.title': '🔧 调试信息',
    'header.debug.user.settings': '📁 用户配置:',
    'header.debug.system.settings': '🏢 系统配置:',
    'header.debug.auth.cache': '🔐 认证缓存:',
    'header.debug.feishu.server': '🌐 飞书认证服务器端口:',

    // DeepVlab Authentication
    'auth.deepvlab.login.title': '🔐 DeepVlab 统一登录',
    'auth.deepvlab.login.button': '🌐 DeepVlab统一登录',
    'auth.deepvlab.login.description': '请点击下方按钮进行登录',
    'auth.deepvlab.starting': '🚀 正在启动DeepVlab统一认证流程，请稍候...',
    'auth.deepvlab.browser.url': '如果浏览器没有自动打开，请访问: {url}',
    'auth.deepvlab.cancel.hint': '按 ESC 取消认证',
    'auth.deepvlab.cancelled': '认证已取消',
    'auth.deepvlab.success': '✅ DeepVlab认证成功！',
    'auth.deepvlab.failed': '❌ DeepVlab认证失败，请重试。',
    'auth.deepvlab.error': '❌ DeepVlab认证过程中发生错误：{error}',
    'auth.deepvlab.config.success': '✅ DeepVlab认证成功！正在配置 Cheeth OA 代理模式...',
    'auth.deepvlab.config.error': 'DeepVlab认证成功，但代理配置有误：\n{error}',
    'auth.deepvlab.server.started': '✅ DeepVlab统一认证服务器已启动，请在浏览器中完成认证...',
    'auth.deepvlab.server.error': '❌ DeepVlab认证启动失败：{error}',
    'auth.deepvlab.page.title': 'DeepVlab认证成功',
    'auth.deepvlab.page.success': '✅ DeepVlab认证成功！',
    'auth.option.deepvlab': '按回车键，以便登录DeepV Code',
    'welcome.title': '🎉 欢迎使用 DeepV Code！✨',
    'welcome.subtitle': '🚀 开启您的智能编程之旅 💻',
    'welcome.daily.tip.title': '每日技巧',
    'welcome.daily.tip.more': '输入 /help 查看传统帮助，输入 /help-ask 进入智能问答式帮助',
    'auth.dialog.title': '开始使用',
    'auth.dialog.authenticating': '(认证进行中，请稍候...)',
    'auth.dialog.select.hint': '(按回车键选择)',
    'auth.dialog.how.to.authenticate': '请先登录后使用',
    'auth.tokenExpiredPrompt': '⚠️  登录凭据已过期，请使用 /auth 命令重新登录。',

    // MCP Command Messages
    'mcp.first.start.hint': '注意：首次启动可能需要更长时间。工具可用性将自动更新。',
    'mcp.starting': '启动中...',
    'mcp.starting.first.launch': '启动中... (首次启动可能需要更长时间)',
    'mcp.no.servers.opening.docs': '未配置 MCP 服务器。正在打开浏览器中的文档：{url}',

    // Theme Command Messages
    'theme.first.start.no.color': '检测到首次启动，但由于 NO_COLOR 环境变量，主题配置不可用。',
    'theme.first.start.select.style': '🎨 检测到本次为首次启动，请选择一个主题风格。',
    'theme.name': '主题',

    // Cloud mode authentication
    'cloud.auth.required': '❌ 云端模式需要身份认证',
    'cloud.auth.not.found': '❌ 没有找到认证信息',
    'cloud.auth.token.invalid': '❌ 没有有效的JWT访问令牌',
    'cloud.auth.starting': '🚀 正在为云端模式启动认证流程...',
    'cloud.auth.success': '✅ 认证成功！云端模式已就绪。',
    'cloud.auth.complete.title': '🌐 云端模式认证完成',
    'cloud.auth.complete.ready': '✅ 认证成功！您的云端环境已就绪。',
    'cloud.auth.complete.url': '🌍 远程访问链接：{url}',
    'cloud.auth.complete.share': '📱 分享此链接即可从任何设备远程访问 DeepV Code',
    'cloud.auth.instruction': '💡 请在即将打开的认证对话框中完成身份验证...',

    // Cloud mode connection and health
    'cloud.connection.url': '🌐 连接URL:',
    'cloud.remote.log.file': '📝 Remote日志文件:',
    'cloud.remote.message.received': '📨 收到远程消息',
    'cloud.remote.message.processing': '⚙️  正在处理远程请求...',
    'cloud.remote.message.success': '✅ 请求完成',
    'cloud.remote.message.failed': '❌ 请求失败',
    'cloud.connection.retry': '🔄 云端连接尝试 {attempt}/{maxRetries}...',
    'cloud.connection.retry.delay': '⏳ {delay}秒后重试连接...',
    'cloud.connection.failed.max.retries': '❌ 云端连接失败，已达到最大重试次数 {maxRetries}',
    'cloud.auth.retry': '🔄 认证尝试 {attempt}/{maxRetries}...',
    'cloud.auth.failed.max.retries': '❌ 认证失败，已达到最大重试次数 {maxRetries}',
    'cloud.health.check.started': '💓 云端连接健康检查已启动 (每30秒检查一次)',
    'cloud.health.check.disconnected': '⚠️  检测到云端连接中断，尝试重新连接...',
    'cloud.health.check.failed': '❌ 健康检查失败',
    'cloud.reconnect.success': '✅ 云端重连成功',
    'cloud.reconnect.failed': '❌ 云端重连失败',
    'cloud.reconnect.full.retry': '🔄 尝试完全重新初始化云端连接...',
    'cloud.health.check.cleared': '💓 健康检查定时器已清理',
    'cloud.cli.register.success': '✅ CLI注册成功：{message}',
    'cloud.remote.access.ready': '🌐 现在可以在任何地方访问云端模式：{url}',

    // Exit confirmation messages
    'exit.confirm.ctrl.c': '再次按 Ctrl+C 退出。',
    'exit.confirm.ctrl.d': '再次按 Ctrl+D 退出。',

    // Cloud mode startup messages
    'cloud.mode.starting': '☁️  启动云端模式...',
    'cloud.mode.connecting.to.server': '🌐 连接到云端服务器: {url}',
    'cloud.mode.server.url': '🌐 云端服务器: {url}',
    'cloud.mode.connecting.to.server.progress': '🔗 正在连接云端server...',
    'cloud.mode.connection.successful': '✅ 云端连接成功',
    'cloud.mode.connection.attempt.failed': '❌ 云端连接尝试 {attempt} 失败: {error}',
    'cloud.mode.started.success': '✅ 云端模式启动成功',
    'cloud.mode.waiting.web.client': '📡 CLI已连接到云端server，等待Web客户端连接...',
    'cloud.mode.closed': '👋 云端模式已关闭',
    'cloud.mode.start.failed': '❌ 启动云端模式失败: {error}',

    // Cloud auth user info
    'cloud.auth.user.authenticated': '✅ [Cloud Auth] 已认证用户: {name} ({info})',
    'cloud.user.info': '👤 用户: {name} ({info})',
    'cloud.cli.id': '🆔 CLI ID: {cliId}',

    // Cloud connection states
    'cloud.connection.already.exists': '✅ 云端连接已存在',
    'cloud.connection.waiting': '⏳ 等待连接完成...',
    'cloud.connection.established': '✅ 云端连接建立成功',
    'cloud.connection.failed': '❌ 连接失败: {error}',
    'cloud.connection.normal.cancel.reconnect': '✅ 连接正常，取消重连',
    'cloud.disconnecting': '📡 正在断开云端连接...',
    'cloud.disconnected': '✅ 云端连接已断开',
    'cloud.reconnecting': '🔄 正在重新连接到云端...',
    'cloud.reinit.success': '✅ 完全重新初始化成功',
    'cloud.reinit.no.url': '⚠️  cloudServerUrl未保存，无法重新初始化',
    'cloud.reinit.failed': '❌ 完全重新初始化也失败: {error}',
    'cloud.cleanup.existing': '🧹 清理现有的云端连接...',
    'cloud.reconnect.scheduled': '🔄 {delay}秒后重连 (第{attempt}次)',

    // Cloud WebSocket
    'cloud.websocket.connected': '🔌 WebSocket连接已建立',
    'cloud.websocket.closed': '📡 WebSocket连接关闭: {code} {reason}',
    'cloud.websocket.error': '❌ WebSocket连接错误: {error}',

    // Cloud messages
    'cloud.message.handle.failed': '❌ 处理云端消息失败: {error}',
    'cloud.message.forward.local': '📨 转发消息到本地处理: {type}',
    'cloud.message.forward.failed': '❌ 转发消息到本地server失败: {error}',
    'cloud.send.unavailable': '⚠️  云端连接不可用，消息发送失败',
    'cloud.send.failed': '❌ 发送消息到云端失败: {error}',

    // Cloud sessions
    'cloud.session.sync.triggered': '📋 [CloudClient] 手动触发session同步',
    'cloud.session.get.failed': '❌ 获取本地sessions失败: {error}',
    'cloud.session.count.failed': '❌ 获取活跃session数量失败: {error}',
    'session.cleaned.oldest': '🧹 已清理最旧的session: {sessionId}',
    'session.created.new': '✨ 创建新session: {sessionId}',

    // Cloud mode message handling
    'cloud.mode.handle.message': '🌐 [CloudMode] 处理云端消息: {type}',
    'cloud.mode.create.session': '🎯 [CloudMode] 创建新session...',
    'cloud.mode.session.created': '✅ [CloudMode] 成功创建session: {sessionId}',
    'cloud.mode.session.initialized': '✅ [CloudMode] Session初始化完成: {sessionId}',
    'cloud.mode.session.not.exist': '❌ [CloudMode] Session不存在: {sessionId}',
    'cloud.mode.session.init.failed': '❌ [CloudMode] Session初始化失败: {sessionId}, {error}',
    'cloud.mode.create.session.response': '✅ [CloudMode] CREATE_SESSION响应已发送到Web {webId}: {status}',
    'cloud.mode.handle.command': '🎯 [CloudMode] 处理COMMAND消息...',
    'cloud.mode.command.no.session': '❌ [CloudMode] COMMAND消息缺少sessionId',
    'cloud.mode.command.forward': '📨 [CloudMode] 转发COMMAND到session: {sessionId}',
    'cloud.mode.command.success': '✅ [CloudMode] COMMAND处理成功',
    'cloud.mode.command.failed': '❌ [CloudMode] COMMAND处理失败: {error}',
    'cloud.mode.handle.ui.state': '🎯 [CloudMode] 处理REQUEST_UI_STATE消息...',
    'cloud.mode.ui.state.no.session': '❌ [CloudMode] REQUEST_UI_STATE消息缺少sessionId',
    'cloud.mode.ui.state.get': '📨 [CloudMode] 获取session UI状态: {sessionId}',
    'cloud.mode.ui.state.sent': '✅ [CloudMode] UI状态响应已发送到Web {webId}',
    'cloud.mode.ui.state.failed': '❌ [CloudMode] UI状态获取失败: {error}',
    'cloud.mode.handle.interrupt': '🛑 [CloudMode] 处理INTERRUPT消息...',
    'cloud.mode.interrupt.no.session': '❌ [CloudMode] INTERRUPT消息缺少sessionId',
    'cloud.mode.interrupt.session': '🛑 [CloudMode] 中断session: {sessionId}',
    'cloud.mode.interrupt.success': '✅ [CloudMode] Session中断成功',
    'cloud.mode.interrupt.failed': '❌ [CloudMode] Session中断失败: {error}',
    'cloud.mode.handle.clear.session': '🧹 [CloudMode] 处理CLEAR_SESSION消息...',
    'cloud.mode.clear.session.no.session': '❌ [CloudMode] CLEAR_SESSION消息缺少sessionId',
    'cloud.mode.clear.session.cleaning': '🧹 [CloudMode] 清理session: {sessionId}',
    'cloud.mode.clear.session.success': '✅ [CloudMode] Session清理成功',
    'cloud.mode.clear.session.failed': '❌ [CloudMode] Session清理失败: {error}',
    'cloud.mode.unhandled.message': '⚠️ [CloudMode] 未处理的消息类型: {type}',
    'cloud.mode.handle.message.failed': '❌ [CloudMode] 处理云端消息失败: {error}',

    // Power management
    'power.management.check.title': '⚡ 电源管理检查：',
    'power.management.macos.detected': '🍎 检测到 macOS 系统',
    'power.management.macos.warning': '⚠️  系统可能会进入睡眠状态，这会中断远程连接',
    'power.management.macos.error': '❌ 检测到系统可能会休眠，为保证远程连接稳定，程序将退出',
    'power.management.macos.solution.title': '💡 解决方法：',
    'power.management.macos.solution.step1': '   1. 打开 "系统偏好设置" > "节能器"',
    'power.management.macos.solution.step2': '   2. 设置 "防止电脑自动进入睡眠" 为开启',
    'power.management.macos.solution.step3': '   3. 或者运行命令: sudo pmset -c sleep 0',
    'power.management.macos.ok': '✅ macOS 系统睡眠已禁用，远程连接将保持稳定',
    'power.management.windows.detected': '🪟 检测到 Windows 系统',
    'power.management.windows.warning': '⚠️  为了确保远程连接稳定，建议调整电源设置：',
    'power.management.windows.solution.step1': '   1. 打开 "设置" > "系统" > "电源和睡眠"',
    'power.management.windows.solution.step2': '   2. 设置睡眠为 "从不"',
    'power.management.windows.solution.step3': '   3. 或者运行命令: powercfg /change standby-timeout-ac 0',
    'power.management.linux.detected': '🐧 检测到 Linux 系统',
    'power.management.linux.warning': '⚠️  为了确保远程连接稳定，建议关闭挂起功能：',
    'power.management.linux.solution.step1': '   1. 运行命令: sudo systemctl mask sleep.target suspend.target',
    'power.management.linux.solution.step2': '   2. 或者在桌面环境中禁用自动挂起',
    'power.management.check.failed': '⚠️  无法检测电源管理设置，建议手动确保系统不会进入睡眠状态',
    'power.management.dev.hint': '💡 提示：如果是开发/测试环境，可以临时忽略此建议',

    // Help UI text
    'help.basics.title': '基础功能:',
    'help.add.context': '添加上下文',
    'help.add.context.description': ': 使用 {symbol} 指定文件作为上下文 (例如: {example}) 来指定特定的文件或文件夹。',
    'help.shell.mode': 'Shell 模式',
    'help.shell.mode.description': ': 通过 {symbol} 执行 shell 命令 (例如: {example1}) 或使用自然语言 (例如: {example2})。',
    'help.commands.title': '命令:',
    'help.shell.command.description': '- shell 命令',
    'help.shortcuts.title': '键盘快捷键:',
    'help.shortcut.enter': '- 发送消息',
    'help.shortcut.newline': '- 新行',
    'help.shortcut.newline.linux': '- 新行 (某些 Linux 发行版可使用 Alt+Enter)',
    'help.shortcut.history': '- 浏览提示历史记录',
    'help.shortcut.word.jump': '- 按单词跳转光标',
    'help.shortcut.toggle.edit': '- 切换自动接受编辑',
    'help.shortcut.yolo.mode': '- 切换 YOLO 模式',
    'help.shortcut.model.switch': '- 切换模型',
    'help.shortcut.cancel': '- 取消操作',
    'help.shortcut.exit': '- 退出应用程序',

    // About Box
    'about.title': '关于 DeepV Code',

    // Slash command descriptions
    'command.help.description': '获取 deepv-code 帮助',
    'command.clear.description': '清除终端屏幕（保留对话上下文）',
    'command.queue.description': '管理提示队列',
    'command.queue.clear.description': '清空所有排队的提示',
    'command.quit.description': '退出命令行界面',
    'command.about.description': '显示版本信息',
    'command.theme.description': '主题',
    'command.auth.description': '登录账号',
    'command.chat.description': '管理对话历史记录',
    'command.compress.description': '通过摘要替换来压缩上下文',
    'command.compress.starting': '正在压缩，大约需要20秒，请稍等...',
    'command.copy.description': '将最后的结果或代码片段复制到剪贴板',
    'command.editor.description': '设置外部编辑器偏好',
    'command.memory.description': '与记忆交互的命令',
    'command.stats.description': '查看所有统计信息（会话、模型和工具）。用法：/stats [model [名称]|tools]',
    'command.context.description': '查看详细的上下文Token占用分析',
    'command.tools.description': '列出可用的工具及其描述',
    'command.vim.description': '开启/关闭 vim 模式',
    'command.yolo.description': '管理YOLO模式（自动批准所有工具调用）',
    'command.ppt.description': '通过AI辅助的大纲设计创建PowerPoint演示文稿',
    'command.ppt.prompt': '请告诉我你想创建的PPT主题是什么？\n\n示例:\n  /ppt "AI在教育中的应用"\n  /ppt "2025年度总结" --pages 15',
    'command.ppt.expected_pages': '\n\n预期页数: {count}页',
    'command.session.description': '会话管理 - 列出、选择和创建对话会话',
    'command.trim.description': '管理自动删除行末空格配置（适用于C++、Python等源代码）',
    'command.myplan.description': '快速打开用户信息页面',
    'command.account.description': '快速打开用户信息页面',
    'command.account.opening_browser': '🌐 正在为您打开浏览器...',
    'command.account.success': '✅ 浏览器已打开，请查看用户信息页面',
    'command.account.error': '❌ Account命令执行失败: {error}',
    'command.restore.description': '恢复checkpoint。这会将对话和文件历史恢复到checkpoint创建时的状态',
    'command.restore.no_checkpoints': '⚠️  本次会话暂无检查点\n\n💡 提示：\n  • 使用 /session select 选择一个包含检查点的历史会话\n  • 加载历史会话后，可以使用 /restore 查看并恢复检查点',
    'command.mcp.description': '列出已配置的 MCP 服务器和工具，或使用 OAuth 服务器进行身份验证',
    'command.docs.description': '在浏览器中打开完整的 DeepV Code 文档',
    'command.extensions.description': '列出活跃的扩展',
    'command.extensions.info.title': '扩展系统',
    'command.extensions.info.intro': 'DVCode 支持 Gemini CLI 扩展。要管理扩展，请使用：',
    'command.extensions.info.install': '安装扩展',
    'command.extensions.info.list': '列出扩展',
    'command.extensions.info.validate': '验证配置',
    'command.extensions.info.uninstall': '卸载扩展',
    'command.extensions.info.example': '示例：',
    'command.extensions.info.learnmore': '更多信息，请访问：',
    'command.extensions.info.url': 'https://dvcode.deepvlab.ai/extensions',
    'command.login.description': '启动登录服务器',
    'command.privacy.description': '显示隐私声明',
    'command.corgi.description': '开启/关闭柯基模式',
    'command.init.description': '分析项目并创建定制的 DEEPV.md 文件',
    'command.help-ask.description': 'AI 智能帮助助手 - 询问任何关于 CLI 功能的问题',
    'command.help-ask.description.cost-note': '（使用1积分/每问）',
    'command.help-ask.no-args': '❌ /help-ask 命令不接受任何参数。\n\n✅ 正确用法：直接输入 /help-ask 并回车进入帮助模式，然后再提出您的问题。',
    'command.refine.description': '输入提示词专业润色：清晰表达，精准投喂，让大模型更懂你',
    'command.refine.error.no-input': '⚠️  请提供需要优化的文本。\n\n📖 使用方法：\n   /refine <文本内容>           - 优化行内文本\n   /refine --file <文件路径>     - 优化文件内容\n   echo "文本" | deepv /refine --stdin  - 从标准输入优化',
    'command.refine.error.read-stdin': '从标准输入读取失败：{error}',
    'command.refine.error.read-file': '无法读取文件 "{file}"：{error}',
    'command.refine.error.write-file': '文件写入失败：{error}',
    'command.refine.error.from-last': '暂不支持从上一条结果读取',
    'command.refine.error.refine-failed': '优化失败：{error}',
    'command.refine.success.file-written': '✅ 文件已更新：{file}',
    'command.refine.info.dry-run': '🔍 预演模式：文件不会被修改',
    'command.refine.result.title': '✨ 优化结果',
    'command.refine.result.params': '📊 优化参数',
    'command.refine.result.params.language': '   语言：{detected} → {target}',
    'command.refine.result.params.tone': '   语气：{tone} | 强度：{level}',
    'command.refine.result.params.protection': '   保护：{format}{code}',
    'command.refine.result.params.model': '   模型：{model}',
    'command.refine.result.params.rules': '   规则：{rules}',
    'command.refine.result.changes': '📝 变更内容',
    'command.refine.result.output': '✨ 优化后的文本',
    'command.refine.result.next-step': '\n💡 下一步操作：\n   • 复制上方优化后的文本发送给 AI\n   • 或使用 /refine --out text 获取纯文本输出',
    'command.refine.confirm.title': '✨ 优化完成',
    'command.refine.confirm.hint.send': '⏎  发送给 AI',
    'command.refine.confirm.hint.refine-again': 'R  重新优化',
    'command.refine.confirm.hint.cancel': 'Esc  取消',
    'command.refine.loading.title': '正在优化中...',
    'command.refine.loading.message': 'AI 正在为您优化文本，请稍候...',

    // NanoBanana Command
    'command.nanobanana.description': '使用 NanoBanana 生成图像。用法：/NanoBanana <比例> <尺寸> <提示词> [@参考图]',
    'nanobanana.usage.error': '用法：/NanoBanana <比例> <尺寸> <提示词> [@参考图]\n比例：1:1、16:9、9:16 等\n尺寸：1K 或 2K\n@参考图可以放在命令中的任意位置\n示例：/NanoBanana 16:9 2K 赛博朋克风格城市 @ref.jpg',
    'nanobanana.missing.prompt': '缺少必要参数。用法：/NanoBanana <比例> <尺寸> <提示词> [@参考图]',
    'nanobanana.invalid.size': '无效的图像尺寸。请使用 1K 或 2K。用法：/NanoBanana <比例> <尺寸> <提示词>',
    'nanobanana.submitting': '正在提交图像生成任务...\n提示词："{prompt}"\n比例：{ratio}',
    'nanobanana.submitted': '任务已提交 (ID: {taskId})。\n积分预估：{credits} (以实际完成扣为准)\n正在等待图像生成...',
    'nanobanana.timeout': '图像生成在 {seconds} 秒后超时。',
    'nanobanana.completed': '图像生成完成！\n实际消费积分：{credits}\n{urlText}',
    'nanobanana.failed': '图像生成失败：{error}',
    'nanobanana.auth.failed': '认证失败。请先运行 /login 或 /auth 进行认证。',
    'nanobanana.submit.failed': '提交任务失败：{error}',
    'nanobanana.uploading_image': '正在上传图片：{path}...',
    'nanobanana.image_uploaded': '图片上传成功。',
    'nanobanana.upload_failed': '图片上传失败：{error}',
    'nanobanana.tip.use_at_for_image': '使用 @ 选择参考图片',
    'nanobanana.tip.use_at_for_image.description': '输入 @ 后跟文件名来搜索图片',

    // Common terms
    'common.format': '格式',
    'common.code': '代码',
    'error.empty.content': '内容为空',

    'command.ide.description': '管理IDE集成',
    'command.mcp.auth.description': '与启用OAuth的MCP服务器进行身份验证',
    'command.mcp.list.description': '列出已配置的MCP服务器和工具',
    'command.mcp.refresh.description': '刷新MCP服务器和工具列表',
    'command.mcp.load.description': '加载或重新连接特定的MCP服务器',
    'command.mcp.load.usage': '用法: /mcp load <server-name>',
    'command.mcp.load.success': '✅ 已成功加载 MCP 服务器 \'{serverName}\'。',
    'command.mcp.load.failed': '❌ 加载 MCP 服务器 \'{serverName}\' 失败: {error}',
    'command.mcp.unload.description': '从当前会话中卸载MCP服务器',
    'command.session.list.description': '列出所有可用的会话记录',
    'command.session.select.description': '选择并加载指定的会话。用法: /session select <编号或session-id>',
    'command.session.create.description': '创建新的会话记录',

    // Session command messages
    'session.new.success': '已创建新会话！',
    'session.new.createdAt': '创建时间',
    'session.new.canStartChat': '您现在可以开始与AI对话了。',
    'session.list.createdAt': '创建时间',
    'session.list.lastActive': '最后活动',
    'session.list.messageCount': '消息数量',
    'session.list.tokenUsage': 'Token消耗',
    'session.list.model': '模型',
    'session.list.checkpoint': '检查点',
    'session.list.checkpoint.yes': '有',
    'session.list.checkpoint.no': '无',
    'session.list.title': '可用的会话记录：',
    'session.list.firstQuestion': '用户首次发问',
    'session.list.lastQuestion': '用户末次发问',
    'session.list.tips': '💡 提示：',
    'session.list.selectSession': '选择会话: /session select <编号或session-id>',
    'session.list.createSession': '创建新会话: /session new',
    'session.list.helpInfo': '查看帮助: /session help',
    'command.session.rebuild.description': '重建会话索引（修复会话列表显示问题）',
    'command.session.help.description': '显示会话管理帮助信息',
    'command.chat.list.description': '列出已保存的对话检查点', // 已被 /session 替代，但保留以支持旧代码
    'command.chat.delete.description': '删除已保存的对话检查点。用法：/chat delete <标签> 或 /chat delete --all', // 已被 /session 替代，但保留以支持旧代码
    'command.memory.show.description': '显示当前记忆内容',
    'command.memory.add.description': '向记忆添加内容',
    'command.memory.refresh.description': '从源文件刷新记忆内容',

    // Memory command messages
    'memory.add.trying': '正在尝试保存到记忆',
    'memory.add.refreshSuccess': '记忆已自动刷新并更新到AI模型。',
    'memory.add.refreshError': '自动刷新记忆失败',
    'memory.add.configNotLoaded': '配置未加载，无法保存记忆',
    'memory.add.saveError': '保存记忆失败',
    'memory.refreshed': '从 {fileCount} 个文件中加载了 {charCount} 个字符。',
    'memory.refresh.refreshing': '正在从源文件刷新记忆...',
    'memory.refresh.success': '记忆刷新并更新到AI模型成功。',
    'memory.refresh.noContent': '记忆刷新成功。未找到记忆内容。',
    'command.stats.model.description': '显示模型特定的使用统计。用法：/stats model [模型名]',
    'command.stats.tools.description': '显示工具特定的使用统计',
    'command.stats.error.noSessionStartTime': '会话开始时间不可用，无法计算统计数据。',
    'command.stats.error.modelNotFound': '模型 "{modelName}" 未找到统计数据。使用 /stats model 查看所有可用的模型。',

    // Model Stats Display - Full Format
    'model.stats.title': 'Geek专用模型统计',
    'model.stats.no.calls': '本次会话中尚未进行API调用。',
    'model.stats.header.metric': '指标',
    'model.stats.header.model': '模型',
    'model.stats.section.api': 'API',
    'model.stats.metric.requests': '请求数',
    'model.stats.metric.errors': '错误数',
    'model.stats.metric.avg.latency': '平均延迟',
    'model.stats.section.tokens': '令牌',
    'model.stats.metric.total': '总计',
    'model.stats.metric.prompt': '提示',
    'model.stats.metric.cache': '缓存',
    'model.stats.metric.thoughts': '思考',
    'model.stats.metric.tool': '工具',
    'model.stats.metric.output': '输出',
    'model.reasoning': '模型思考',

    // Tool Stats Display - Full Format
    'tool.stats.title': 'Tool Stats For Nerds',
    'tool.stats.header.tool.name': '工具名称',
    'tool.stats.header.calls': '调用次数',
    'tool.stats.header.success.rate': '成功率',
    'tool.stats.header.avg.time': '平均耗时',
    'tool.stats.header.response.size': '响应大小',
    'tool.stats.decision.summary': '用户决策摘要',
    'tool.stats.decision.reviewed.total': '已审核建议总数:',
    'tool.stats.decision.accepted': '已接受:',
    'tool.stats.decision.rejected': '已拒绝:',
    'tool.stats.decision.modified': '已修改:',
    'tool.stats.decision.overall.rate': '总体接受率:',

    // MCP Command Messages
    'mcp.wizard.title': '🔧 MCP服务器配置向导',
    'mcp.wizard.config.ways': '可用的配置方式:',
    'mcp.wizard.predefined': '预定义模板',
    'mcp.wizard.predefined.desc': '快速配置常用服务器 (GitHub, SQLite等)',
    'mcp.wizard.custom': '自定义配置',
    'mcp.wizard.custom.desc': '手动配置服务器参数',
    'mcp.wizard.view.templates': '查看模板列表',
    'mcp.wizard.view.templates.desc': '浏览所有可用模板',
    'mcp.wizard.available.templates': '可用的预定义模板:',
    'mcp.wizard.examples': '使用示例:',
    'mcp.wizard.help.hint': '提示: 使用 \'/mcp help add\' 查看详细参数说明',

    'mcp.add.description': '添加新的MCP服务器配置',
    'mcp.error.template.not.exist': '❌ 模板 \'{templateName}\' 不存在\n\n可用模板: {availableTemplates}',
    'mcp.error.server.already.exists': '❌ MCP服务器 \'{serverName}\' 已存在\n\n使用不同的名称或先删除现有配置',
    'mcp.error.missing.connection.params': '❌ 缺少连接参数\n\n请指定以下其中一种连接方式:\n  --command <cmd>     可执行命令\n  --url <url>         SSE服务器URL\n  --http-url <url>    HTTP服务器URL\n  --tcp <host:port>   TCP连接地址\n\n示例: /mcp add my-server --command "npx @my/mcp-server"',
    'mcp.error.save.config.failed': '❌ 保存配置失败: {error}',
    'mcp.success.server.added': '✅ MCP服务器 \'{serverName}\' 添加成功！',
    'mcp.success.config.location': '📍 配置位置:',
    'mcp.success.template': '🏷️  模板:',
    'mcp.success.description': '📝 描述:',
    'mcp.success.connection.method': '🔗 连接方式:',
    'mcp.success.command': '命令: {command}',
    'mcp.success.sse': 'SSE: {url}',
    'mcp.success.http': 'HTTP: {url}',
    'mcp.success.tcp': 'TCP: {tcp}',
    'mcp.success.unknown': '未知',
    'mcp.success.config.effective': '配置已生效！使用 \'/mcp\' 查看服务器状态',
    'mcp.warning.missing.env': '⚠️  缺少环境变量:',
    'mcp.setup.instructions': '🔧 设置说明:',
    'mcp.setup.default.instruction': '请查看服务器文档设置环境变量',
    'mcp.related.links': '📚 相关链接:',

    'mcp.status.no.servers.title': '🔧 未配置 MCP 服务器',
    'mcp.status.no.servers.description': 'MCP (Model Context Protocol) 允许您连接外部工具和服务，扩展DeepV Code的功能。',
    'mcp.status.quick.start': '🚀 快速开始:',
    'mcp.status.predefined.templates': '1️⃣ 使用预定义模板 (推荐)',
    'mcp.status.interactive.wizard': '2️⃣ 交互式配置向导',
    'mcp.status.custom.config': '3️⃣ 自定义配置',
    'mcp.status.get.help': '📚 获取帮助:',
    'mcp.status.help.complete': '查看完整帮助系统',
    'mcp.status.help.detailed': '详细配置指南',
    'mcp.status.help.templates': '预定义模板列表',
    'mcp.status.help.examples': '配置示例',
    'mcp.status.tip': '💡 提示: 配置将保存在',
    'mcp.status.config.file': '.deepv/settings.json',
    'mcp.status.run.after.config': '文件中\n\n配置完成后再次运行',
    'mcp.status.view.status': '查看服务器状态',

    'mcp.status.starting': '⏳ MCP 服务器正在启动 ({count} 正在初始化)...',
    'mcp.status.configured.servers': '已配置的 MCP 服务器：',
    'mcp.status.ready': '就绪',
    'mcp.status.connecting': '连接中',
    'mcp.status.disconnected': '断开连接',
    'mcp.status.from.extension': '(来自 {extensionName})',


    'mcp.auth.no.oauth.servers': '未配置启用 OAuth 身份验证的 MCP 服务器。',
    'mcp.auth.oauth.servers.list': '启用 OAuth 身份验证的 MCP 服务器：\n{servers}\n\n使用 /mcp auth <server-name> 进行身份验证。',
    'mcp.auth.server.not.found': 'MCP 服务器 \'{serverName}\' 未找到。',
    'mcp.auth.starting': '开始对 MCP 服务器 \'{serverName}\' 进行 OAuth 身份验证...',
    'mcp.auth.opening.browser': '正在打开浏览器进行身份验证...',
    'mcp.auth.success': '✅ 与 MCP 服务器 \'{serverName}\' 身份验证成功！',
    'mcp.auth.failed': '与 MCP 服务器 \'{serverName}\' 身份验证失败: {error}',
    'mcp.auth.rediscovering.tools': '重新发现 \'{serverName}\' 的工具...',
    'mcp.auth.refresh.success': '成功验证并刷新了 \'{serverName}\' 的工具。',

    'mcp.refresh.starting': '刷新 MCP 服务器和工具...',
    'command.mcp.unload.server.not.found': '❌ 未找到名为 \'{serverName}\' 的 MCP 服务器。',
    'command.mcp.unload.success': '✅ 已成功卸载 MCP 服务器 \'{serverName}\'。',
    'command.mcp.unload.failed': '❌ 卸载 MCP 服务器 \'{serverName}\' 失败: {error}',
    'command.mcp.unload.usage': '用法: /mcp unload <server-name>',

    'mcp.help.system.title': '🔧 MCP (Model Context Protocol) 帮助系统',
    'mcp.help.system.description': 'MCP允许您连接外部工具和服务，扩展DeepV Code的功能。',
    'mcp.help.commands.title': '📋 可用命令:',
    'mcp.help.description': 'MCP帮助系统 - 获取详细的使用指南和配置帮助',

    // Main help content
    'mcp.help.main.title': '🔧 MCP (Model Context Protocol) 帮助系统',
    'mcp.help.main.description': 'MCP允许您连接外部工具和服务，扩展DeepV Code的功能。',
    'mcp.help.main.commands.title': '📋 可用命令:',
    'mcp.help.main.command.status': '- 查看已配置的MCP服务器状态',
    'mcp.help.main.command.add': '- 添加新的MCP服务器',
    'mcp.help.main.command.auth': '- OAuth服务器身份验证',
    'mcp.help.main.command.refresh': '- 重新连接所有MCP服务器',
    'mcp.help.main.detailed.title': '📚 获取详细帮助:',
    'mcp.help.main.help.add': '- 学习如何添加MCP服务器',
    'mcp.help.main.help.templates': '- 查看预定义服务器模板',
    'mcp.help.main.help.examples': '- 查看配置示例',
    'mcp.help.main.help.troubleshooting': '- 解决常见问题',
    'mcp.help.main.help.oauth': '- OAuth认证配置',
    'mcp.help.main.help.security': '- 安全最佳实践',
    'mcp.help.main.quickstart.title': '🚀 快速开始:',
    'mcp.help.main.quickstart.step1': '运行 {command} 启动配置向导',
    'mcp.help.main.quickstart.step2': '选择预定义模板（如GitHub、SQLite）',
    'mcp.help.main.quickstart.step3': '按提示配置环境变量',
    'mcp.help.main.quickstart.step4': '运行 {command} 验证连接状态',
    'mcp.help.main.tip': '💡 提示: 配置保存在 {path} 文件中',
    'mcp.help.main.subcommand': '输入子命令查看详细帮助，如: {example}',

    // Templates help content
    'mcp.help.templates.title': '📋 MCP 预定义模板列表',
    'mcp.help.templates.description': '这些模板提供了常用MCP服务器的预配置，只需少量设置即可使用。',
    'mcp.help.templates.github.title': '🐙 GitHub (推荐)',
    'mcp.help.templates.github.purpose': '用途: GitHub仓库操作、Issue管理、PR评论',
    'mcp.help.templates.github.command': '命令: {command}',
    'mcp.help.templates.github.env': '环境变量: GITHUB_PERSONAL_ACCESS_TOKEN',
    'mcp.help.templates.github.tools': '工具: create_issue, comment_on_pr, get_issues, create_pr',
    'mcp.help.templates.github.docs': '文档: https://github.com/github/github-mcp-server',
    'mcp.help.templates.sqlite.title': '💾 SQLite',
    'mcp.help.templates.sqlite.purpose': '用途: 数据库查询和操作',
    'mcp.help.templates.sqlite.command': '命令: {command}',
    'mcp.help.templates.sqlite.args': '参数: 数据库文件路径',
    'mcp.help.templates.sqlite.tools': '工具: query, create_table, insert, update',
    'mcp.help.templates.sqlite.example': '示例: {example}',
    'mcp.help.templates.filesystem.title': '📁 Filesystem',
    'mcp.help.templates.filesystem.purpose': '用途: 本地文件和目录操作',
    'mcp.help.templates.filesystem.command': '命令: {command}',
    'mcp.help.templates.filesystem.args': '参数: 允许访问的根目录',
    'mcp.help.templates.filesystem.tools': '工具: read_file, write_file, list_dir, create_dir',
    'mcp.help.templates.filesystem.example': '示例: {example}',
    'mcp.help.templates.search.title': '🔍 Brave Search',
    'mcp.help.templates.search.purpose': '用途: 网络搜索功能',
    'mcp.help.templates.search.command': '命令: {command}',
    'mcp.help.templates.search.env': '环境变量: BRAVE_API_KEY',
    'mcp.help.templates.search.tools': '工具: web_search, news_search',
    'mcp.help.templates.search.register': '注册: https://api.search.brave.com/register',
    'mcp.help.templates.slack.title': '💬 Slack (Beta)',
    'mcp.help.templates.slack.purpose': '用途: Slack消息发送和管理',
    'mcp.help.templates.slack.command': '命令: {command}',
    'mcp.help.templates.slack.env': '环境变量: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET',
    'mcp.help.templates.slack.tools': '工具: send_message, list_channels, get_history',
    'mcp.help.templates.http.title': '🌐 HTTP',
    'mcp.help.templates.http.purpose': '用途: 通用HTTP请求工具',
    'mcp.help.templates.http.command': '命令: {command}',
    'mcp.help.templates.http.tools': '工具: get_request, post_request, put_request',
    'mcp.help.templates.tips.title': '💡 使用提示:',
    'mcp.help.templates.tips.check': '• 模板会自动检查依赖和环境变量',
    'mcp.help.templates.tips.wizard': '• 支持交互式配置向导',
    'mcp.help.templates.tips.custom': '• 可以基于模板进行自定义修改',
    'mcp.help.templates.tips.update': '• 模板定期更新，运行 {command} 获取最新版本',
    'mcp.help.templates.need.more': '❓ 需要其他模板？',
    'mcp.help.templates.github.issues': '在GitHub提交Issue: https://github.com/your-repo/issues',
    'mcp.help.templates.custom.wizard': '或运行 {command} 使用自定义配置向导',

    // OAuth help content
    'mcp.help.oauth.title': '🔐 MCP OAuth 认证配置指南',
    'mcp.help.oauth.description': 'OAuth认证允许MCP服务器安全地访问第三方服务，如GitHub、Google等。',
    'mcp.help.oauth.supported.title': '📋 支持的认证类型',
    'mcp.help.oauth.dynamic.title': '🔹 动态发现 (推荐)',
    'mcp.help.oauth.dynamic.description': '自动从服务器发现OAuth配置',
    'mcp.help.oauth.dynamic.example': '/mcp add github --oauth',
    'mcp.help.oauth.google.title': '🔹 Google凭证',
    'mcp.help.oauth.google.description': '使用Google服务账户认证',
    'mcp.help.oauth.google.example': '/mcp add google-service --auth-provider google_credentials',
    'mcp.help.oauth.quickstart.title': '🚀 快速配置',
    'mcp.help.oauth.quickstart.step1.title': '1️⃣ 启用OAuth',
    'mcp.help.oauth.quickstart.step1.example': '/mcp add my-server --oauth',
    'mcp.help.oauth.quickstart.step2.title': '2️⃣ 完成认证',
    'mcp.help.oauth.quickstart.step2.example': '/mcp auth my-server',
    'mcp.help.oauth.quickstart.step3.title': '3️⃣ 验证状态',
    'mcp.help.oauth.quickstart.step3.example': '/mcp  # 查看认证状态',
    'mcp.help.oauth.best.practices.title': '💡 认证最佳实践',
    'mcp.help.oauth.best.practices.update': '• 定期更新访问令牌',
    'mcp.help.oauth.best.practices.minimal': '• 使用最小权限原则',
    'mcp.help.oauth.best.practices.protect': '• 保护客户端密钥',
    'mcp.help.oauth.best.practices.monitor': '• 监控认证状态',

    // MCP Status Display Additional Messages
    'mcp.status.github.tools.desc': 'GitHub仓库操作工具',
    'mcp.status.sqlite.tools.desc': 'SQLite数据库工具',
    'mcp.status.filesystem.tools.desc': '本地文件操作工具',
    'mcp.status.search.tools.desc': '网络搜索工具',
    'mcp.status.start.wizard.desc': '启动配置向导',
    'mcp.status.oauth.token.expired': '(OAuth 令牌已过期)',
    'mcp.status.oauth.authenticated': '(OAuth 已认证)',
    'mcp.status.oauth.not.authenticated': '(OAuth 未认证)',
    'mcp.status.zero.tools': '(0 工具)',
    'mcp.status.tools.prompts.ready': '(工具和提示将在就绪时显示)',
    'mcp.status.tools.cached.count': '({count} 工具缓存)',
    'mcp.status.no.tools.prompts': '无可用工具或提示',
    'mcp.status.no.tools.simple': '无可用工具',
    'mcp.status.type.auth.command': '(类型: "/mcp auth {serverName}" 进行身份验证)',
    'mcp.status.blocked.server': '已阻止',
    'mcp.status.tools.count': '{count} {unit}',
    'mcp.status.tool.unit.singular': '工具',
    'mcp.status.tool.unit.plural': '工具',
    'mcp.status.prompts.count': '{count} {unit}',
    'mcp.status.prompt.unit.singular': '提示',
    'mcp.status.prompt.unit.plural': '提示',
    'mcp.status.tools.label': '工具:',
    'mcp.status.prompts.label': '提示:',
    'mcp.status.parameters.label': '参数:',
    'mcp.status.tips': '💡 提示:',
    'mcp.status.tip.desc': '使用 /mcp desc 显示服务器和工具描述',
    'mcp.status.tip.schema': '使用 /mcp schema 显示工具参数架构',
    'mcp.status.tip.nodesc': '使用 /mcp nodesc 隐藏描述',
    'mcp.status.tip.auth': '使用 /mcp auth <server-name> 对启用 OAuth 的服务器进行身份验证',
    'mcp.status.tip.toggle': '按 Ctrl+T 切换工具描述的开/关',

    // Plan Mode
    'command.plan.description': '切换Plan模式：专注需求讨论，允许读取代码但禁用修改',
    'plan.mode.indicator': '计划模式 - 只读',
    'plan.mode.enabled.message': '📋 已进入Plan模式\n特点：\n• 专注需求理解和方案设计\n• 允许代码读取和分析工具\n• 禁用代码修改和命令执行\n• 适合初期需求讨论和架构规划\n• 使用 /plan off 退出此模式',
    'plan.mode.disabled.message': '✅ 已退出Plan模式，现在可以执行所有工具和代码修改',
    'plan.mode.status.message': '📋 Plan模式状态：{status}',
    'plan.mode.status.on': '开启',
    'plan.mode.status.off': '关闭',
    'plan.usage.error': '用法：/plan [on|off|status]',
    'plan.error.config.unavailable': '配置不可用',
    'plan.mode.blocked.tools': '🚫 Plan模式下已禁用修改性工具：{tools}',
    'plan.mode.focus.message': '📋 当前专注于需求讨论和方案设计',
    'plan.mode.available.tools': '✅ 可用工具：文件读取、搜索分析、任务规划、网络获取',
    'plan.mode.exit.instruction': '💡 使用 /plan off 退出Plan模式后可执行修改操作',


    // Error messages
    'error.config.not.loaded': '配置未加载。',
    'error.tool.registry.unavailable': '无法检索工具注册表。',

    // Loop Detection Messages
    'loop.consecutive.tool.calls.title': '🔄 检测到重复工具调用',
    'loop.consecutive.tool.calls.description': 'AI模型在反复调用相同的工具，浪费上下文和API配额，没有取得实质进展。\n\n为什么会发生：\n• AI可能被困在同一个方向的探索中\n• 当前的方法不可行\n• 任务描述不清楚或缺少关键信息\n\n应该做什么：\n1. 检查任务：请求是否足够清晰和具体？\n2. 提供新指导：告诉AI尝试不同的方向或提供新信息\n3. 如需要可重启：使用 /session new 清空上下文重新开始\n\n举例：\n• ❌ "读所有文件来理解代码库"\n• ✅ "重点看 src/auth.ts，解释登录流程"\n• ❌ "修复这个错误"\n• ✅ "错误在认证模块，检查token验证逻辑"',
    'loop.consecutive.tool.calls.action': '快速操作：\n• 继续提供更具体的请求\n• 要求AI尝试不同的方法\n• 使用 /session new 清空上下文重新开始',
    'loop.chanting.identical.sentences.title': '🔄 检测到重复内容',
    'loop.chanting.identical.sentences.description': 'AI模型在反复生成相同的文本或响应。',
    'loop.chanting.identical.sentences.action': '解决方案：\n• 模型可能陷入特定的文本模式\n• 尝试用新的指示打破这个模式\n• 要求AI采用不同的方法\n• 继续对话并提供新的上下文，或执行 /session new 重新开始',
    'loop.llm.detected.title': '⚠️ 检测到无进展循环',
    'loop.llm.detected.description': 'AI模型似乎陷入困境，在任务上没有取得有意义的进展。',
    'loop.llm.detected.action': '解决方案：\n• 提供更清晰的任务要求或接受当前进展\n• 将AI的注意力重新集中在核心问题上\n• 考虑将任务分解为更小的子任务\n• 继续进行新的指示或执行 /session new 来重新启动',

    // Daily Tips - 每日技巧
    'tip.help': '/help - 查看所有可用命令',
    'tip.theme': '/theme - 更换主题外观',
    'tip.auth': '/auth - 登录账号',
    'tip.stats': '/stats - 查看会话统计',
    'tip.memory': '/memory - 管理 AI 上下文记忆',
    'tip.mcp': '/mcp - 连接外部工具和服务',
    'tip.tools': '/tools - 查看可用工具列表',
    'tip.init': '/init - 为项目创建 DEEPV.md 文件',
    'tip.model': '/model - 切换 AI 模型',
    'tip.plan': '/plan - 启用计划模式',
    'tip.docs': '/docs - 打开完整文档',
    'tip.session': '/session - 管理会话',
    'tip.restore': '/restore - 恢复之前的会话状态',
    'tip.at.filepath': '@<filepath> - 添加文件到上下文',
    'tip.shell.command': '!<command> - 执行 Shell 命令',
    'tip.shell.mode': '! - 进入/退出 Shell 模式',
    'tip.ctrl.j': 'Ctrl+J - 输入多行内容',
    'tip.cli.update': 'dvcode -u - 检查更新',
    'tip.cli.cloud': 'dvcode --cloud-mode - 启用云端远程控制模式',

    // Skills System
    'skill.command.description': '管理 AI Skills (Marketplace → Plugin → Skill)',
    'skill.help.text': 'DeepV Code Skills 系统\n\n使用三层架构管理 AI Skills：\n  Marketplace → Plugin → Skill\n\n命令：\n  /skill marketplace list              - 列出所有 Marketplace\n  /skill marketplace add <url> [alias] - 添加 Marketplace\n  /skill marketplace update <name>     - 更新 Marketplace\n  /skill marketplace remove <name>     - 删除 Marketplace\n  /skill marketplace browse <name>     - 浏览 Plugins\n\n  /skill plugin list [marketplace]     - 列出 Plugins\n  /skill plugin install <mp> <name>    - 安装 Plugin\n  /skill plugin uninstall <id>         - 卸载 Plugin\n  /skill plugin enable <id>            - 启用 Plugin\n  /skill plugin disable <id>           - 禁用 Plugin\n  /skill plugin info <id>              - 显示 Plugin 信息\n\n  /skill list                          - 列出所有 Skills\n  /skill info <id>                     - 显示 Skill 详情\n  /skill stats                         - 显示统计信息\n\n快速开始：\n  1. 添加官方 Marketplace：\n     /skill marketplace add https://github.com/anthropics/skills.git\n\n  2. 浏览 Plugins：\n     /skill marketplace browse skills\n\n  3. 安装 Plugin：\n     /skill plugin install skills example-skills\n\n  4. 查看 Skills：\n     /skill list',
    'skill.marketplace.description': '管理 Skills Marketplaces',
    'skill.marketplace.usage': '用法：/skill marketplace <list|add|update|remove|browse>',
    'skill.marketplace.list.description': '列出所有 Marketplaces',
    'skill.marketplace.list.empty': '未安装任何 Marketplace。',
    'skill.marketplace.list.empty.hint': '添加一个：\n  /skill marketplace add https://github.com/anthropics/skills.git',
    'skill.marketplace.list.found': '找到 {count} 个 Marketplace：\n\n',
    'skill.marketplace.list.failed': '列出 Marketplaces 失败：{error}',
    'skill.marketplace.add.description': '从 Git URL 或本地路径添加 Marketplace',
    'skill.marketplace.add.usage': '用法：/skill marketplace add <url|path> [alias] [--name <name>]',
    'skill.marketplace.add.progress': '正在从 {url}{name} 添加 Marketplace...',
    'skill.marketplace.add.success': '✅ 成功添加：{name}\n   ID：{id}\n   Plugins：{count}',
    'skill.marketplace.add.failed': '添加 Marketplace 失败：{error}',
    'skill.marketplace.update.description': '更新 Marketplace (git pull)',
    'skill.marketplace.update.usage': '用法：/skill marketplace update <name>',
    'skill.marketplace.update.progress': '正在更新 Marketplace {id}...',
    'skill.marketplace.update.success': '✅ 成功更新：{name}\n   Plugins：{count}',
    'skill.marketplace.update.failed': '更新 Marketplace 失败：{error}',
    'skill.marketplace.remove.description': '删除 Marketplace',
    'skill.marketplace.remove.empty': '未安装任何 Marketplace。',
    'skill.marketplace.remove.select': '请选择要删除的 Marketplace：\n\n',
    'skill.marketplace.remove.success': '✅ 成功删除：{id}{files}',
    'skill.marketplace.remove.files_deleted': '\n   文件已从磁盘删除',
    'skill.marketplace.remove.failed': '删除 Marketplace 失败：{error}',
    'skill.marketplace.browse.description': '浏览 Marketplace 中的 Plugins',
    'skill.marketplace.browse.select': '请选择要浏览的 Marketplace：\n\n',
    'skill.marketplace.browse.empty': '在 {id} 中未找到 Plugin{query}',
    'skill.marketplace.browse.found': '在 {id} 中找到 {count} 个 Plugin：\n\n',
    'skill.marketplace.browse.failed': '浏览 Marketplace 失败：{error}',
    'skill.plugin.description': '管理 Skills Plugins',
    'skill.plugin.usage': '用法：/skill plugin <list|install|uninstall|enable|disable|info>',
    'skill.plugin.list.description': '列出已安装或可用的 Plugins',
    'skill.plugin.list.marketplace.empty': '在 {id} 中未找到 Plugin',
    'skill.plugin.list.marketplace.found': '{id} 中可用的 Plugins：\n\n',
    'skill.plugin.list.installed.empty': '未安装任何 Plugin。\n\n安装一个：\n  /skill plugin install <marketplace> <plugin-name>',
    'skill.plugin.list.installed.found': '已安装的 Plugins ({count})：\n',
    'skill.plugin.list.failed': '列出 Plugins 失败：{error}',
    'skill.plugin.install.description': '从 Marketplace 安装 Plugin',
    'skill.plugin.install.usage': '用法：/skill plugin install <marketplace> <plugin-name>',
    'skill.plugin.install.progress': '正在从 {marketplace} 安装 Plugin {plugin}...',
    'skill.plugin.install.success': '✅ 成功安装：{name}\n   ID：{id}\n   Skills：{count}\n   状态：已启用',
    'skill.plugin.install.failed': '安装 Plugin 失败：{error}',
    'skill.plugin.uninstall.description': '卸载 Plugin',
    'skill.plugin.uninstall.usage': '用法：/skill plugin uninstall <plugin-id>',
    'skill.plugin.uninstall.progress': '正在卸载 Plugin {id}...',
    'skill.plugin.uninstall.success': '✅ 成功卸载：{id}',
    'skill.plugin.uninstall.failed': '卸载 Plugin 失败：{error}',
    'skill.plugin.enable.description': '启用 Plugin',
    'skill.plugin.enable.usage': '用法：/skill plugin enable <plugin-id>',
    'skill.plugin.enable.progress': '正在启用 Plugin {id}...',
    'skill.plugin.enable.success': '✅ 成功启用：{id}\n\n该 Plugin 的 Skills 现已可用。',
    'skill.plugin.enable.failed': '启用 Plugin 失败：{error}',
    'skill.plugin.disable.description': '禁用 Plugin',
    'skill.plugin.disable.usage': '用法：/skill plugin disable <plugin-id>',
    'skill.plugin.disable.progress': '正在禁用 Plugin {id}...',
    'skill.plugin.disable.success': '✅ 成功禁用：{id}\n\n该 Plugin 的 Skills 已不可用。',
    'skill.plugin.disable.failed': '禁用 Plugin 失败：{error}',
    'skill.plugin.info.description': '显示 Plugin 详情',
    'skill.plugin.info.usage': '用法：/skill plugin info <plugin-id>',
    'skill.plugin.info.not_found': '未找到 Plugin {id}。',
    'skill.plugin.info.details': 'Plugin 详情：\n',
    'skill.plugin.info.failed': '获取 Plugin 信息失败：{error}',
    'skill.list.description': '列出所有可用的 Skills',
    'skill.list.empty': '未找到 Skill。',
    'skill.list.title': '可用的 Skills ({count})：\n',
    'skill.list.failed': '列出 Skills 失败：{error}',
    'skill.info.description': '显示 Skill 详情',
    'skill.info.usage': '用法：/skill info <skill-id>',
    'skill.info.not.found.hint': '列出所有 Skills：\n  /skill list',
    'skill.info.details': 'Skill 详情：\n',
    'skill.info.failed': '获取 Skill 信息失败：{error}',
    'skill.stats.description': '显示 Skills 统计信息',
    'skill.stats.title': 'Skills 统计信息：\n',
    'skill.stats.total': 'Skills 总数：{count}',
    'skill.stats.failed': '获取统计信息失败：{error}',
    'skill.label.source': '来源：',
    'skill.label.plugins': 'Plugins：',
    'skill.label.description': '描述：',
    'skill.label.official': '⭐ 官方',
    'skill.label.id': 'ID：',
    'skill.label.skills': 'Skills：',
    'skill.label.tools': '工具：',
    'skill.label.name': '名称：',
    'skill.label.marketplace': 'Marketplace：',
    'skill.label.status': '状态：',
    'skill.label.enabled': '✅ 已启用',
    'skill.label.disabled': '❌ 已禁用',
    'skill.label.parameters': '参数：\n',
  },
};

// Cache the current locale to avoid repeated locale detection
let _cachedLocale: 'en' | 'zh' | null = null;

/**
 * Get current locale (cached)
 * @returns Current locale
 */
function getCurrentLocale(): 'en' | 'zh' {
  if (_cachedLocale === null) {
    _cachedLocale = isChineseLocale() ? 'zh' : 'en';
  }
  return _cachedLocale;
}

/**
 * Get translated text based on current locale
 * @param key Translation key
 * @returns Translated text
 */
export function t(key: keyof typeof translations.en): string {
  const locale = getCurrentLocale();
  return translations[locale][key] || translations.en[key] || key;
}

/**
 * Get translated text with parameter substitution
 * @param key Translation key
 * @param params Parameters to substitute
 * @returns Translated text with parameters substituted
 */
export function tp(key: keyof typeof translations.en, params: Record<string, string | number>): string {
  let text = t(key);

  // Ensure text is not undefined before calling replace
  if (!text) {
    text = key; // Fallback to key if translation is missing
  }

  // Replace {paramName} with actual values
  if (params) {
    Object.entries(params).forEach(([paramName, value]) => {
      text = text.replace(new RegExp(`\\{${paramName}\\}`, 'g'), String(value));
    });
  }

  return text;
}

/**
 * Get translated tool name based on current locale
 * @param toolName Original tool name
 * @returns Translated tool name or original if not found
 */
export function getLocalizedToolName(toolName: string): string {
  const locale = getCurrentLocale();
  if (locale === 'en') {
    return toolName; // Return original for English
  }

  // Map common tool names to translation keys
  const toolKeyMap: Record<string, keyof typeof translations.en> = {
    'Edit': 'tool.edit',
    'ReadFile': 'tool.readfile',
    'WriteFile': 'tool.writefile',
    'SearchText': 'tool.searchtext',
    'TodoWrite': 'tool.todowrite',
    'TodoRead': 'tool.todoread',
    'FindFiles': 'tool.findfiles',
    'ReadFolder': 'tool.readfolder',
    'ReadManyFiles': 'tool.readmanyfiles',
    'Shell': 'tool.shell',
    'WebFetch': 'tool.webfetch',
    'Web Search': 'tool.websearch',
    'Save Memory': 'tool.savememory',
    'Task': 'tool.task',
  };

  const translationKey = toolKeyMap[toolName];
  if (translationKey) {
    return t(translationKey);
  }

  // Return original name if no translation found
  return toolName;
}
