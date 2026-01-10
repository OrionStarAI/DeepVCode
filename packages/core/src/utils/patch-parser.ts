/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { detectLineEnding } from './languageAwareTextProcessor.js';

export namespace PatchParser {

    // Core types matching the Rust implementation
    export interface ApplyPatchArgs {
        patch: string
        hunks: Hunk[]
        workdir?: string
    }

    export type Hunk =
        | { type: "add"; path: string; contents: string }
        | { type: "delete"; path: string }
        | { type: "update"; path: string; move_path?: string; chunks: UpdateFileChunk[] }

    export interface UpdateFileChunk {
        old_lines: string[]
        new_lines: string[]
        change_context?: string
        is_end_of_file?: boolean
    }

    export interface ApplyPatchAction {
        changes: Map<string, ApplyPatchFileChange>
        patch: string
        cwd: string
    }

    export type ApplyPatchFileChange =
        | { type: "add"; content: string }
        | { type: "delete"; content: string }
        | { type: "update"; unified_diff: string; move_path?: string; new_content: string }

    // Parser implementation
    function parsePatchHeader(
        lines: string[],
        startIdx: number,
    ): { filePath: string; movePath?: string; nextIdx: number } | null {
        const line = lines[startIdx]

        if (line.startsWith("*** Add File:")) {
            const filePath = line.split(":", 2)[1]?.trim()
            return filePath ? { filePath, nextIdx: startIdx + 1 } : null
        }

        if (line.startsWith("*** Delete File:")) {
            const filePath = line.split(":", 2)[1]?.trim()
            return filePath ? { filePath, nextIdx: startIdx + 1 } : null
        }

        if (line.startsWith("*** Update File:")) {
            const filePath = line.split(":", 2)[1]?.trim()
            let movePath: string | undefined
            let nextIdx = startIdx + 1

            // Check for move directive
            if (nextIdx < lines.length && lines[nextIdx].startsWith("*** Move to:")) {
                movePath = lines[nextIdx].split(":", 2)[1]?.trim()
                nextIdx++
            }

            return filePath ? { filePath, movePath, nextIdx } : null
        }

        return null
    }

    function parseUpdateFileChunks(lines: string[], startIdx: number): { chunks: UpdateFileChunk[]; nextIdx: number } {
        const chunks: UpdateFileChunk[] = []
        let i = startIdx

        while (i < lines.length && !lines[i].startsWith("***")) {
            if (lines[i].startsWith("@@")) {
                // Parse context line
                const contextLine = lines[i].substring(2).trim()
                i++

                const oldLines: string[] = []
                const newLines: string[] = []
                let isEndOfFile = false

                // Parse change lines
                while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("***")) {
                    const changeLine = lines[i]

                    if (changeLine === "*** End of File") {
                        isEndOfFile = true
                        i++
                        break
                    }

                    if (changeLine.startsWith(" ")) {
                        // Keep line - appears in both old and new
                        const content = changeLine.substring(1)
                        oldLines.push(content)
                        newLines.push(content)
                    } else if (changeLine.startsWith("-")) {
                        // Remove line - only in old
                        oldLines.push(changeLine.substring(1))
                    } else if (changeLine.startsWith("+")) {
                        // Add line - only in new
                        newLines.push(changeLine.substring(1))
                    }

                    i++
                }

                chunks.push({
                    old_lines: oldLines,
                    new_lines: newLines,
                    change_context: contextLine || undefined,
                    is_end_of_file: isEndOfFile || undefined,
                })
            } else {
                i++
            }
        }

        return { chunks, nextIdx: i }
    }

    function parseAddFileContent(lines: string[], startIdx: number): { content: string; nextIdx: number } {
        let content = ""
        let i = startIdx

        while (i < lines.length && !lines[i].startsWith("***")) {
            if (lines[i].startsWith("+")) {
                content += lines[i].substring(1) + "\n"
            }
            i++
        }

        // Remove trailing newline
        if (content.endsWith("\n")) {
            content = content.slice(0, -1)
        }

        return { content, nextIdx: i }
    }

    function parseUnifiedDiff(patchText: string): { hunks: Hunk[] } {
        const lines = patchText.split("\n");
        const hunks: Hunk[] = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i];

            // Detect Git-style file header
            // --- a/path/to/file
            // +++ b/path/to/file
            if (line.startsWith("--- ")) {
                const oldPathLine = line;
                const newPathLine = lines[i + 1];

                if (!newPathLine || !newPathLine.startsWith("+++ ")) {
                    i++;
                    continue;
                }

                // Extract paths and strip 'a/' and 'b/' prefixes if standard git format
                let oldPath = oldPathLine.substring(4).trim();
                let newPath = newPathLine.substring(4).trim();

                const isDevNullOld = oldPath === "/dev/null";
                const isDevNullNew = newPath === "/dev/null";

                if (!isDevNullOld && oldPath.startsWith("a/")) oldPath = oldPath.substring(2);
                if (!isDevNullNew && newPath.startsWith("b/")) newPath = newPath.substring(2);

                let type: "add" | "delete" | "update" = "update";
                let filePath = isDevNullOld ? newPath : oldPath;
                let movePath: string | undefined = undefined;

                if (isDevNullOld) {
                    type = "add";
                } else if (isDevNullNew) {
                    type = "delete";
                } else if (oldPath !== newPath) {
                    type = "update";
                    movePath = newPath;
                }

                i += 2; // Skip header

                // For delete, we can just record it and skip chunks
                if (type === "delete") {
                    hunks.push({ type: "delete", path: filePath });
                    // Skip until next header
                    while (i < lines.length && !lines[i].startsWith("--- ")) {
                        i++;
                    }
                    continue;
                }

                // For add, we collect content
                if (type === "add") {
                    let content = "";
                    while (i < lines.length && !lines[i].startsWith("--- ")) {
                        const l = lines[i];
                        if (!l.startsWith("@@")) { // Skip chunk headers for pure adds if possible, but usually contexts have @@
                            // Standard git diff for new file has @@ -0,0 +1,x @@
                        }
                        if (l.startsWith("+")) {
                            content += l.substring(1) + "\n";
                        }
                        i++;
                    }
                    if (content.endsWith("\n")) content = content.slice(0, -1);
                    hunks.push({ type: "add", path: filePath, contents: content });
                    continue;
                }

                // For update (and move), parse standard chunks
                const chunks: UpdateFileChunk[] = [];
                while (i < lines.length && !lines[i].startsWith("--- ")) {
                    if (lines[i].startsWith("@@")) {
                        const headerMatch = lines[i].match(/^@@ .+\s@@(.*)$/);
                        const context = headerMatch ? headerMatch[1].trim() : undefined;
                        i++;

                        const oldLines: string[] = [];
                        const newLines: string[] = [];

                        while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("--- ")) {
                            const l = lines[i];
                            if (l.startsWith(" ")) {
                                const c = l.substring(1);
                                oldLines.push(c);
                                newLines.push(c);
                            } else if (l.startsWith("-")) {
                                oldLines.push(l.substring(1));
                            } else if (l.startsWith("+")) {
                                newLines.push(l.substring(1));
                            }
                            // Ignore \ No newline...
                            i++;
                        }

                        chunks.push({
                            old_lines: oldLines,
                            new_lines: newLines,
                            change_context: context,
                        });
                    } else {
                        i++;
                    }
                }

                hunks.push({
                    type: "update",
                    path: filePath,
                    move_path: movePath,
                    chunks
                });

            } else {
                i++;
            }
        }
        return { hunks };
    }

    export function parsePatch(patchText: string): { hunks: Hunk[] } {
        const lines = patchText.split("\n")

        // Look for custom Opencode markers
        const beginMarker = "*** Begin Patch"
        const endMarker = "*** End Patch"
        const beginIdx = lines.findIndex((line) => line.trim() === beginMarker)
        const endIdx = lines.findIndex((line) => line.trim() === endMarker)

        // If markers not found, attempt to parse as standard Unified Diff
        if (beginIdx === -1 || endIdx === -1) {
            return parseUnifiedDiff(patchText);
        }

        // ORIGINAL PARSING LOGIC FOR CUSTOM FORMAT
        const hunks: Hunk[] = []
        let i = beginIdx + 1

        while (i < endIdx) {
            const header = parsePatchHeader(lines, i)
            if (!header) {
                i++
                continue
            }

            if (lines[i].startsWith("*** Add File:")) {
                const { content, nextIdx } = parseAddFileContent(lines, header.nextIdx)
                hunks.push({
                    type: "add",
                    path: header.filePath,
                    contents: content,
                })
                i = nextIdx
            } else if (lines[i].startsWith("*** Delete File:")) {
                hunks.push({
                    type: "delete",
                    path: header.filePath,
                })
                i = header.nextIdx
            } else if (lines[i].startsWith("*** Update File:")) {
                const { chunks, nextIdx } = parseUpdateFileChunks(lines, header.nextIdx)
                hunks.push({
                    type: "update",
                    path: header.filePath,
                    move_path: header.movePath,
                    chunks,
                })
                i = nextIdx
            } else {
                i++
            }
        }

        return { hunks }
    }

    // File content manipulation
    export interface ApplyPatchFileUpdate {
        unified_diff: string
        content: string
    }

    export function deriveNewContentsFromChunks(filePath: string, chunks: UpdateFileChunk[]): ApplyPatchFileUpdate {
        // Read original file content
        let originalContent: string
        let detectedLineEnding: string | undefined = undefined;
        try {
            if (fs.existsSync(filePath)) {
                const rawContent = fs.readFileSync(filePath, "utf-8");
                // 🎯 检测原始文件的行尾符
                detectedLineEnding = detectLineEnding(rawContent);
                // 规范化为 LF 进行处理
                originalContent = rawContent.replace(/\r\n/g, "\n");
            } else {
                throw new Error(`File does not exist: ${filePath}`);
            }
        } catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error}`)
        }

        let originalLines = originalContent.split("\n")

        // Drop trailing empty element for consistent line counting
        if (originalLines.length > 0 && originalLines[originalLines.length - 1] === "") {
            originalLines.pop()
        }

        const replacements = computeReplacements(originalLines, filePath, chunks)
        let newLines = applyReplacements(originalLines, replacements)

        // Ensure trailing newline
        if (newLines.length === 0 || newLines[newLines.length - 1] !== "") {
            newLines.push("")
        }

        // 🎯 使用检测到的行尾符，如果未检测到则使用 LF
        const lineEnding = detectedLineEnding || "\n";
        const newContent = newLines.join(lineEnding)

        // Generate unified diff
        const unifiedDiff = generateUnifiedDiff(originalContent, newContent.replace(/\r\n/g, "\n"))

        return {
            unified_diff: unifiedDiff,
            content: newContent,
        }
    }

    function computeReplacements(
        originalLines: string[],
        filePath: string,
        chunks: UpdateFileChunk[],
    ): Array<[number, number, string[]]> {
        const replacements: Array<[number, number, string[]]> = []
        let lineIndex = 0

        for (const chunk of chunks) {
            // Handle context-based seeking (optional hint, not required)
            if (chunk.change_context) {
                const contextIdx = seekSequence(originalLines, [chunk.change_context], lineIndex)
                if (contextIdx !== -1) {
                    // Context found, update position hint
                    lineIndex = contextIdx + 1
                }
                // 🎯 如果 context 没找到，继续使用当前 lineIndex，不要报错
                // context 只是一个提示，不是必须的
            }

            // Handle pure addition (no old lines)
            if (chunk.old_lines.length === 0) {
                const insertionIdx =
                    originalLines.length > 0 && originalLines[originalLines.length - 1] === ""
                        ? originalLines.length - 1
                        : originalLines.length
                replacements.push([insertionIdx, 0, chunk.new_lines])
                continue
            }

            // Try to match old lines in the file
            let pattern = chunk.old_lines
            let newSlice = chunk.new_lines
            let found = seekSequence(originalLines, pattern, lineIndex)

            // 🎯 策略1: 去除尾部空行重试
            if (found === -1 && pattern.length > 0 && pattern[pattern.length - 1] === "") {
                pattern = pattern.slice(0, -1)
                if (newSlice.length > 0 && newSlice[newSlice.length - 1] === "") {
                    newSlice = newSlice.slice(0, -1)
                }
                found = seekSequence(originalLines, pattern, lineIndex)
            }

            // 🎯 策略2: 从头开始搜索（忽略 lineIndex 位置提示）
            if (found === -1) {
                found = seekSequence(originalLines, chunk.old_lines, 0)
                if (found !== -1) {
                    pattern = chunk.old_lines
                    newSlice = chunk.new_lines
                }
            }

            // 🎯 策略3: 从头开始搜索，去除尾部空行
            if (found === -1 && chunk.old_lines.length > 0 && chunk.old_lines[chunk.old_lines.length - 1] === "") {
                pattern = chunk.old_lines.slice(0, -1)
                newSlice = chunk.new_lines.length > 0 && chunk.new_lines[chunk.new_lines.length - 1] === ""
                    ? chunk.new_lines.slice(0, -1)
                    : chunk.new_lines
                found = seekSequence(originalLines, pattern, 0)
            }

            if (found !== -1) {
                replacements.push([found, pattern.length, newSlice])
                lineIndex = found + pattern.length
            } else {
                throw new Error(`Failed to find expected lines in ${filePath}:\n${chunk.old_lines.join("\n")}`)
            }
        }

        // Sort replacements by index to apply in order
        replacements.sort((a, b) => a[0] - b[0])

        return replacements
    }

    function applyReplacements(lines: string[], replacements: Array<[number, number, string[]]>): string[] {
        // Apply replacements in reverse order to avoid index shifting
        const result = [...lines]

        for (let i = replacements.length - 1; i >= 0; i--) {
            const [startIdx, oldLen, newSegment] = replacements[i]

            // Remove old lines
            result.splice(startIdx, oldLen)

            // Insert new lines
            for (let j = 0; j < newSegment.length; j++) {
                result.splice(startIdx + j, 0, newSegment[j])
            }
        }

        return result
    }

    function seekSequence(lines: string[], pattern: string[], startIndex: number): number {
        if (pattern.length === 0) return -1

        // 🎯 预处理：规范化字符串以确保 emoji 和多字节 UTF-8 字符正确匹配
        // 1. 去除行尾的 \r（Windows 兼容性）
        // 2. 使用 Unicode NFC 规范化（确保 emoji 等字符的一致表示）
        const normalizeString = (s: string): string => {
            return s.replace(/\r$/, '').normalize('NFC').trimEnd();
        };

        const normalizedPattern = pattern.map(normalizeString);
        const normalizedLines = lines.map(normalizeString);

        // Simple substring search implementation
        for (let i = startIndex; i <= normalizedLines.length - normalizedPattern.length; i++) {
            let matches = true

            for (let j = 0; j < normalizedPattern.length; j++) {
                if (normalizedLines[i + j] !== normalizedPattern[j]) {
                    matches = false
                    break
                }
            }

            if (matches) {
                return i
            }
        }

        return -1
    }


    function generateUnifiedDiff(oldContent: string, newContent: string): string {
        const oldLines = oldContent.split("\n")
        const newLines = newContent.split("\n")

        // Simple diff generation - in a real implementation you'd use a proper diff algorithm
        let diff = "@@ -1 +1 @@\n"

        // Find changes (simplified approach)
        const maxLen = Math.max(oldLines.length, newLines.length)
        let hasChanges = false

        for (let i = 0; i < maxLen; i++) {
            const oldLine = oldLines[i] || ""
            const newLine = newLines[i] || ""

            if (oldLine !== newLine) {
                if (oldLine) diff += `-${oldLine}\n`
                if (newLine) diff += `+${newLine}\n`
                hasChanges = true
            } else if (oldLine) {
                diff += ` ${oldLine}\n`
            }
        }

        return hasChanges ? diff : ""
    }
}
