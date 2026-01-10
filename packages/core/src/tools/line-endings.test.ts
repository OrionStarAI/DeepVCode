
import { describe, it, expect, beforeEach, afterEach, vi, type Mocked } from 'vitest';
import { WriteFileTool } from './write-file.js';
import { EditTool } from './edit.js';
import { Config, ApprovalMode } from '../config/config.js';
import { Type } from '@google/genai';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { GeminiClient } from '../core/client.js';

// --- MOCKS ---
vi.mock('../core/client.js');
// We don't want to mock the text processor as we want to test its integration
// vi.mock('../utils/languageAwareTextProcessor.js'); 
// But we might need to mock editCorrector if we don't want real API calls.
vi.mock('../utils/editCorrector.js');
import { ensureCorrectEdit, ensureCorrectFileContent } from '../utils/editCorrector.js';

const rootDir = path.resolve(os.tmpdir(), 'gemini-cli-line-ending-test-root');

// Mock Config
const mockConfigInternal = {
    getTargetDir: () => rootDir,
    getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
    setApprovalMode: vi.fn(),
    getGeminiClient: vi.fn(),
    getApiKey: () => 'test-key',
    getModel: () => 'test-model',
    getProjectSettingsManager: vi.fn().mockReturnValue({
        getSettings: vi.fn().mockReturnValue({ autoTrimTrailingSpaces: false }) // Disable auto trim to focus on existing line endings
    }),
};
const mockConfig = mockConfigInternal as unknown as Config;

describe('Line Ending Preservation', () => {
    let writeFileTool: WriteFileTool;
    let editTool: EditTool;
    let tempDir: string;
    let mockGeminiClientInstance: Mocked<GeminiClient>;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'line-ending-test-external-'));
        if (!fs.existsSync(rootDir)) {
            fs.mkdirSync(rootDir, { recursive: true });
        }

        mockGeminiClientInstance = new (vi.mocked(GeminiClient))(mockConfig) as Mocked<GeminiClient>;
        mockConfigInternal.getGeminiClient.mockReturnValue(mockGeminiClientInstance);

        writeFileTool = new WriteFileTool(mockConfig);
        editTool = new EditTool(mockConfig);

        // Mock ensureCorrectEdit to return what we pass it (bypass API)
        vi.mocked(ensureCorrectEdit).mockImplementation(async (filePath, currentContent, params) => {
            return {
                params: { ...params, new_string: params.new_string ?? '' },
                occurrences: 1
            };
        });

        vi.mocked(ensureCorrectFileContent).mockImplementation(async (content) => {
            return content;
        });
    });

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        if (fs.existsSync(rootDir)) {
            fs.rmSync(rootDir, { recursive: true, force: true });
        }
        vi.clearAllMocks();
    });

    it('should preserve CRLF when editing an existing CRLF file using WriteFileTool', async () => {
        const filePath = path.join(rootDir, 'crlf_file.txt');
        const originalContent = 'Line 1\r\nLine 2\r\nLine 3';
        fs.writeFileSync(filePath, originalContent, 'utf8');

        // Verify setup
        expect(fs.readFileSync(filePath, 'utf8')).toBe(originalContent);

        // Use WriteFileTool to overwrite (simulating an edit)
        const proposedContent = 'Line 1\r\nLine 2 (modified)\r\nLine 3';
        // The tool usually receives LF normalized content from LLM, so let's simulate that if relevant,
        // OR just pass what we want. The key is that even if we pass LF, it should output CRLF if original was CRLF.
        // Let's assume LLM sends LF.
        const llmProposedContent = 'Line 1\nLine 2 (modified)\nLine 3';

        await writeFileTool.execute({ file_path: filePath, content: llmProposedContent }, new AbortController().signal);

        const newContent = fs.readFileSync(filePath, 'utf8');
        // Expect CRLF to be preserved
        expect(newContent).toContain('\r\n');
        expect(newContent).not.toContain(/[^\r]\n/); // Should not have bare LF
        expect(newContent).toBe('Line 1\r\nLine 2 (modified)\r\nLine 3');
    });

    it('should preserve CRLF when editing an existing CRLF file using EditTool', async () => {
        const filePath = path.join(rootDir, 'crlf_edit_file.txt');
        const originalContent = 'Line A\r\nLine B\r\nLine C';
        fs.writeFileSync(filePath, originalContent, 'utf8');

        // Edit "Line B" -> "Line B Modified"
        // EditTool expects exact match for old_string.
        // If we pass old_string with LF, it might fail match if we don't handle it,
        // BUT our fix target is the OUTPUT line ending.
        // The calculateEdit helper normalizes file content to LF for matching.
        const oldString = 'Line B';
        const newString = 'Line B Modified';

        await editTool.execute({
            file_path: filePath,
            old_string: oldString,
            new_string: newString
        }, new AbortController().signal);

        const newContent = fs.readFileSync(filePath, 'utf8');
        expect(newContent).toBe('Line A\r\nLine B Modified\r\nLine C');
    });

    it('should preserve LF when editing an existing LF file using WriteFileTool', async () => {
        const filePath = path.join(rootDir, 'lf_file.txt');
        const originalContent = 'Line 1\nLine 2\nLine 3';
        fs.writeFileSync(filePath, originalContent, 'utf8');

        const llmProposedContent = 'Line 1\nLine 2 (modified)\nLine 3';

        await writeFileTool.execute({ file_path: filePath, content: llmProposedContent }, new AbortController().signal);

        const newContent = fs.readFileSync(filePath, 'utf8');
        expect(newContent).not.toContain('\r\n');
        expect(newContent).toBe('Line 1\nLine 2 (modified)\nLine 3');
    });

    it('should use OS default (CRLF on Windows) for NEW files if not specified otherwise', async () => {
        // This test depends on the OS running the test.
        const filePath = path.join(rootDir, 'new_file_default.txt');
        const content = 'Line 1\nLine 2'; // LLM usually sends LF

        await writeFileTool.execute({ file_path: filePath, content: content }, new AbortController().signal);

        const newContent = fs.readFileSync(filePath, 'utf8');
        if (os.platform() === 'win32') {
            expect(newContent).toContain('\r\n');
        } else {
            expect(newContent).not.toContain('\r\n');
        }
    });
});
