/**
 * @license
 * Copyright 2026 Easy Code team
 * SPDX-License-Identifier: Apache-2.0
 *
 * User-settings management for the desktop app.
 *
 * These settings live in the same shared store the CLI uses —
 * `~/.easycode-user/settings.json` — the very file the CLI's `/config` command
 * reads and writes (see `packages/cli/src/config/settings.ts`,
 * `USER_SETTINGS_PATH`). A change made in the desktop's Settings dialog is
 * therefore picked up by the CLI and by every spawned `easycode --acp` backend
 * on its next start. This mirrors `customModels.ts` but for the settings file.
 *
 * We deliberately read-modify-write the *whole* JSON object so the many keys the
 * desktop doesn't surface (theme, hooks, mcpServers, customModels, …) are
 * preserved untouched.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import type { DesktopUserSettings } from '../shared/ipc.js';

const SETTINGS_DIRECTORY_NAME = '.easycode-user';
const SETTINGS_FILE = 'settings.json';

function filePath(): string {
  return path.join(homedir(), SETTINGS_DIRECTORY_NAME, SETTINGS_FILE);
}

/** Read the full settings object from disk; never throws (returns {} on failure). */
function readRaw(): Record<string, unknown> {
  try {
    const fp = filePath();
    if (!fs.existsSync(fp)) return {};
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf-8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch (err) {
    console.warn('[userSettings] Failed to read settings.json:', err);
    return {};
  }
}

/** Atomic write (temp file + rename), matching the CLI's storage discipline. */
function writeRaw(data: Record<string, unknown>): void {
  const fp = filePath();
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const tmp = fp + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, fp);
}

/** Project the full settings file down to the subset the desktop exposes. */
function project(raw: Record<string, unknown>): DesktopUserSettings {
  const out: DesktopUserSettings = {};
  if (typeof raw.preferredLanguage === 'string') out.preferredLanguage = raw.preferredLanguage;
  if (typeof raw.healthyUse === 'boolean') out.healthyUse = raw.healthyUse;
  if (
    raw.projectMemoryMode === 'all' ||
    raw.projectMemoryMode === 'deepv-only' ||
    raw.projectMemoryMode === 'none'
  ) {
    out.projectMemoryMode = raw.projectMemoryMode;
  }
  if (typeof raw.minimizeToTray === 'boolean') out.minimizeToTray = raw.minimizeToTray;
  return out;
}

/** The desktop-exposed subset of the shared user settings. */
export function getUserSettings(): DesktopUserSettings {
  return project(readRaw());
}

/**
 * Merge a partial update into the shared settings file, preserving every key the
 * desktop doesn't manage. Pass `preferredLanguage: ''` to clear the language
 * (the key is removed). Returns the new desktop-exposed state.
 */
export function updateUserSettings(patch: DesktopUserSettings): DesktopUserSettings {
  const raw = readRaw();

  if ('preferredLanguage' in patch) {
    const v = patch.preferredLanguage?.trim();
    if (v) raw.preferredLanguage = v;
    else delete raw.preferredLanguage;
  }
  if ('healthyUse' in patch && typeof patch.healthyUse === 'boolean') {
    raw.healthyUse = patch.healthyUse;
  }
  if ('projectMemoryMode' in patch && patch.projectMemoryMode) {
    raw.projectMemoryMode = patch.projectMemoryMode;
  }
  if ('minimizeToTray' in patch && typeof patch.minimizeToTray === 'boolean') {
    raw.minimizeToTray = patch.minimizeToTray;
  }

  writeRaw(raw);
  return project(raw);
}
