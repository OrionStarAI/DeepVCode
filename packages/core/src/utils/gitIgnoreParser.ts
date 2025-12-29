/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import ignore, { type Ignore } from 'ignore';
import { isGitRepository } from './gitUtils.js';

export interface GitIgnoreFilter {
  isIgnored(filePath: string): boolean;
  getPatterns(): string[];
}

export class GitIgnoreParser implements GitIgnoreFilter {
  private projectRoot: string;
  private ig: Ignore = ignore();
  private patterns: string[] = [];

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  loadGitRepoPatterns(): void {
    if (!isGitRepository(this.projectRoot)) return;

    // Always ignore .git directory regardless of .gitignore content
    this.addPatterns(['.git']);

    const patternFiles = ['.gitignore', path.join('.git', 'info', 'exclude')];
    for (const pf of patternFiles) {
      this.loadPatterns(pf);
    }
  }

  loadPatterns(patternsFileName: string): void {
    const patternsFilePath = path.join(this.projectRoot, patternsFileName);
    let content: string;
    try {
      content = fs.readFileSync(patternsFilePath, 'utf-8');
    } catch (_error) {
      // ignore file not found
      return;
    }
    const patterns = (content ?? '')
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p !== '' && !p.startsWith('#'));
    this.addPatterns(patterns);
  }

  private addPatterns(patterns: string[]) {
    this.ig.add(patterns);
    this.patterns.push(...patterns);
  }

  isIgnored(filePath: string): boolean {
    // 🔧 FIX: Handle project-external absolute paths safely
    // If filePath is already an absolute path outside the project, resolve() might not work as expected
    let resolved: string;
    let relativePath: string;

    if (path.isAbsolute(filePath)) {
      // For absolute paths, check if they're within the project
      relativePath = path.relative(this.projectRoot, filePath);
      resolved = filePath;
    } else {
      // For relative paths, resolve normally
      resolved = path.resolve(this.projectRoot, filePath);
      relativePath = path.relative(this.projectRoot, resolved);
    }

    // Return false immediately for paths outside the project (avoid passing invalid paths to ignore library)
    if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return false;
    }

    // Even in windows, Ignore expects forward slashes.
    const normalizedPath = relativePath.replace(/\\/g, '/');

    try {
      return this.ig.ignores(normalizedPath);
    } catch (error) {
      // 🛡️ SAFETY: If ignore library throws an error, treat the path as not ignored
      console.warn(`GitIgnoreParser: Error checking path "${normalizedPath}":`, error);
      return false;
    }
  }

  getPatterns(): string[] {
    return this.patterns;
  }
}
