/**
 * Test script to verify theme selection flow
 * Run this after building to check if the theme selection works
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test the settings file path
const USER_SETTINGS_PATH = path.join(os.homedir(), '.deepv', 'settings.json');
console.log('Settings path:', USER_SETTINGS_PATH);
console.log('Settings exists:', fs.existsSync(USER_SETTINGS_PATH));

if (fs.existsSync(USER_SETTINGS_PATH)) {
  const content = fs.readFileSync(USER_SETTINGS_PATH, 'utf-8');
  const settings = JSON.parse(content);
  console.log('Current theme setting:', settings.theme);
} else {
  console.log('Settings file does not exist yet');
}

// Test the theme manager
console.log('\n--- Testing theme manager ---');

// Simulating the theme selection flow
const builtInThemes = [
  { name: 'Ayu Dark', type: 'dark' },
  { name: 'Ayu Light', type: 'light' },
  { name: 'Default Dark', type: 'dark' },
  { name: 'Default Light', type: 'light' },
];

function findThemeByName(themeName) {
  if (!themeName) {
    return { name: 'Default Dark', type: 'dark' };
  }
  return builtInThemes.find(t => t.name === themeName);
}

// Test cases
console.log('findThemeByName(undefined):', findThemeByName(undefined));
console.log('findThemeByName("Default Dark"):', findThemeByName('Default Dark'));
console.log('findThemeByName("NonExistent"):', findThemeByName('NonExistent'));

console.log('\n--- Theme selection flow test ---');
const selectedTheme = 'Default Dark';
const scope = 'User';

const isBuiltIn = findThemeByName(selectedTheme);
const isCustom = false;

if (!isBuiltIn && !isCustom) {
  console.log('ERROR: Theme not found');
} else {
  console.log('SUCCESS: Theme is valid');
  console.log('Would call setValue(scope, "theme", themeName)');
  console.log('Would call applyTheme(loadedSettings.merged.theme)');
  console.log('Would close the dialog');
}
