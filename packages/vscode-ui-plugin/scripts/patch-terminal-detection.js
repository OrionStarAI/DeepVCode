/**
 * Patch script - Modify terminal detection logic in bundled/deepv-code-core
 * Skip expensive process tree traversal in VSCode environment
 */

const fs = require('fs');
const path = require('path');

const TERMINAL_DETECTION_PATH = path.join(__dirname, '../visx/extension/dist/bundled/deepv-code-core/src/utils/terminalDetection.js');

function applyPatch() {
    console.log('🔧 Applying terminal detection performance patch...');

    if (!fs.existsSync(TERMINAL_DETECTION_PATH)) {
        console.log('⚠️ Terminal detection file not found, skipping patch');
        return;
    }

    let content = fs.readFileSync(TERMINAL_DETECTION_PATH, 'utf8');

    // 检查是否已经应用了补丁
    if (content.includes('DEEPV_SKIP_PROCESS_DETECTION')) {
        console.log('✅ Patch already applied');
        return;
    }

    // 在detectWindowsShell函数开头添加VSCode检测
    const patchCode = `
    // 🚀 DEEPV PERFORMANCE PATCH: Skip expensive process detection in VSCode
    if (process.env.DEEPV_SKIP_PROCESS_DETECTION === 'true' ||
        process.env.VSCODE_PID ||
        process.env.TERM_PROGRAM === 'vscode') {
        console.log('[Shell Detection] 🚀 VSCode environment detected, using optimized detection');

        // Use predefined shell info from environment variables, skip process tree traversal
        if (process.env.DEEPV_OPTIMIZED_SHELL) {
            console.log('[Shell Detection] Detection result:', process.env.DEEPV_OPTIMIZED_SHELL, '(VSCode optimized)');
            return process.env.DEEPV_OPTIMIZED_SHELL;
        }

        // Fallback to simple environment variable detection
        if (env.PSModulePath) {
            const result = env.PSEdition === 'Core' ? 'PowerShell Core' : 'Windows PowerShell';
            console.log('[Shell Detection] Detection result:', result, '(VSCode optimized)');
            return result;
        }

        console.log('[Shell Detection] Detection result: Command Prompt (CMD) (VSCode optimized)');
        return 'Command Prompt (CMD)';
    }
    // 🚀 END DEEPV PERFORMANCE PATCH
    `;

    // Insert patch before "Check special environments first"
    const insertPoint = 'console.log(\'[Shell Detection] Checking special environments...\');';

    if (content.includes(insertPoint)) {
        content = content.replace(insertPoint, patchCode + '\n    ' + insertPoint);

        fs.writeFileSync(TERMINAL_DETECTION_PATH, content);
        console.log('✅ Terminal detection patch applied successfully');
    } else {
        console.log('⚠️ Could not find insertion point for patch');
    }
}

function removePatch() {
    console.log('🗑️ Removing terminal detection patch...');

    if (!fs.existsSync(TERMINAL_DETECTION_PATH)) {
        return;
    }

    let content = fs.readFileSync(TERMINAL_DETECTION_PATH, 'utf8');

    // Remove patch code
    const patchStart = '// 🚀 DEEPV PERFORMANCE PATCH';
    const patchEnd = '// 🚀 END DEEPV PERFORMANCE PATCH';

    const startIndex = content.indexOf(patchStart);
    const endIndex = content.indexOf(patchEnd);

    if (startIndex !== -1 && endIndex !== -1) {
        const before = content.substring(0, startIndex);
        const after = content.substring(endIndex + patchEnd.length);
        content = before + after;

        fs.writeFileSync(TERMINAL_DETECTION_PATH, content);
        console.log('✅ Terminal detection patch removed');
    }
}

// Command line interface
const command = process.argv[2];

if (command === 'apply') {
    applyPatch();
} else if (command === 'remove') {
    removePatch();
} else if (command === 'check') {
    if (fs.existsSync(TERMINAL_DETECTION_PATH)) {
        const content = fs.readFileSync(TERMINAL_DETECTION_PATH, 'utf8');
        const hasPath = content.includes('DEEPV_SKIP_PROCESS_DETECTION');
        console.log(`📋 Patch status: ${hasPath ? 'Applied' : 'Not applied'}`);
    } else {
        console.log('📋 Terminal detection file not found');
    }
} else {
    console.log('Usage: node patch-terminal-detection.js [apply|remove|check]');
}

module.exports = { applyPatch, removePatch };