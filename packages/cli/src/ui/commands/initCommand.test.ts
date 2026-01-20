/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { initCommand } from './initCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { type CommandContext } from './types.js';

// Mock the 'fs' module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('initCommand', () => {
  let mockContext: CommandContext;
  const targetDir = '/test/dir';
  const deepvMdPath = path.join(targetDir, 'DEEPV.md');

  beforeEach(() => {
    // Create a fresh mock context for each test
    mockContext = createMockCommandContext({
      services: {
        config: {
          getTargetDir: () => targetDir,
        },
      },
    });
  });

  afterEach(() => {
    // Clear all mocks after each test
    vi.clearAllMocks();
  });

  it('should open init-choice dialog if DEEPV.md exists and is not empty', async () => {
    // Arrange: Simulate that the file exists and is not empty
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as any);
    vi.mocked(fs.readFileSync).mockReturnValue('Some content\nMore content');

    // Act: Run the command's action
    const result = await initCommand.action!(mockContext, '');

    // Assert: Check that the dialog action is returned
    expect(result).toEqual({
      type: 'dialog',
      dialog: 'init-choice',
      metadata: {
        filePath: deepvMdPath,
        fileSize: 1,
        lineCount: 2,
      },
    });
    // Assert: Ensure no file was written
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should proceed with init when DEEPV.md is empty (0 bytes)', async () => {
    // Arrange: Simulate that the file exists but is empty
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ size: 0 } as any);

    // Act: Run the command's action
    const result = await initCommand.action!(mockContext, '');

    // Assert: Check that a submit_prompt action is returned
    expect(result).toEqual(
      expect.objectContaining({
        type: 'submit_prompt',
        content: expect.stringContaining('You are a DeepV Code AI assistant'),
      }),
    );
  });

  it('should create DEEPV.md and submit a prompt if it does not exist', async () => {
    // Arrange: Simulate that the file does not exist
    vi.mocked(fs.existsSync).mockReturnValue(false);

    // Act: Run the command's action
    const result = await initCommand.action!(mockContext, '');

    // Assert: Check that writeFileSync was called correctly
    expect(fs.writeFileSync).toHaveBeenCalledWith(deepvMdPath, '', 'utf8');

    // Assert: Check that an informational message was added to the UI
    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      {
        type: 'info',
        text: 'Creating DEEPV.md... Now analyzing the project to populate it.',
      },
      expect.any(Number),
    );

    // Assert: Check that the correct prompt is submitted
    expect(result).toEqual(
      expect.objectContaining({
        type: 'submit_prompt',
        content: expect.stringContaining('You are a DeepV Code AI assistant'),
      }),
    );
  });

  it('should return an error if config is not available', async () => {
    // Arrange: Create a context without config
    const noConfigContext = createMockCommandContext();
    if (noConfigContext.services) {
      noConfigContext.services.config = null;
    }

    // Act: Run the command's action
    const result = await initCommand.action!(noConfigContext, '');

    // Assert: Check for the correct error message
    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Configuration not available.',
    });
  });
});