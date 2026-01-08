
const { loadSettings } = require('./packages/cli/dist/config/settings.js');
const path = require('path');

const workspaceDir = process.cwd();
console.log('Checking settings in:', workspaceDir);

const settings = loadSettings(workspaceDir);

console.log('--- Settings Summary ---');
console.log('User Path:', settings.user.path);
console.log('User Theme:', settings.user.settings.theme);
console.log('Workspace Path:', settings.workspace.path);
console.log('Workspace Theme:', settings.workspace.settings.theme);
console.log('Merged Theme:', settings.merged.theme);

if (settings.merged.theme !== settings.user.settings.theme && settings.user.settings.theme) {
    console.log('\n[!] Warning: Merged theme differs from User theme.');
    console.log('This means another scope (Workspace or System) is overriding it.');
}
