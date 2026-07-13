/**
 * @license
 * Copyright 2025 Felix
 * SPDX-License-Identifier: Apache-2.0
 *
 * Video analyzer tool - downloads video, extracts key frames via FFmpeg,
 * fetches subtitles, generates structured summary.
 * Ported from Otto project: https://github.com/Felix201209/otto
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { BaseTool, Icon, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';

const execAsync = promisify(exec);
const TEMP_DIR = join(homedir(), '.easycode', 'tmp', 'video');
const KB_DIR = join(homedir(), '.easycode', 'kb', 'videos');
const SCENE_THRESHOLD = 0.4;
const MAX_FRAMES = 30;

export interface VideoAnalyzerToolParams {
  url: string;
  save_to_kb?: boolean;
  lang?: string;
}

function isURL(s: string): boolean { return /^https?:\/\//.test(s); }
function isYouTube(u: string): boolean { return /youtube\.com|youtu\.be/.test(u); }
function platform(u: string): string {
  if (/youtube\.com|youtu\.be/.test(u)) return 'youtube';
  if (/zoom\.us|zoom\.com/.test(u)) return 'zoom';
  if (/loom\.com/.test(u)) return 'loom';
  return 'other';
}
function ensureDir(d: string) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }
function parseSub(content: string): string {
  return content.replace(/^WEBVTT.*$/m, '').replace(/^\d+$/gm, '')
    .replace(/^\d{2}:\d{2}:\d{2}[.,]\d{3}.*$/gm, '').replace(/<[^>]+>/g, '')
    .split('\n').map(l => l.trim()).filter(l => l.length > 0).join(' ');
}

export class VideoAnalyzerTool extends BaseTool<VideoAnalyzerToolParams, ToolResult> {
  static readonly Name: string = 'analyze_video';

  constructor(private readonly config: Config) {
    super(VideoAnalyzerTool.Name, 'VideoAnalyzer',
      'Analyze a video from URL or local path. Downloads the video, extracts key frames ' +
      'via FFmpeg scene detection, fetches subtitles (YouTube official or Whisper), ' +
      'and generates a structured summary with key moments and action items. ' +
      'Optionally saves to the knowledge base for future recall.',
      Icon.Globe,
      {
        type: Type.OBJECT,
        properties: {
          url: { type: Type.STRING, description: 'Video URL (YouTube, Zoom, Loom) or local file path' },
          save_to_kb: { type: Type.BOOLEAN, description: 'Save analysis to knowledge base. Default: false' },
          lang: { type: Type.STRING, description: 'Language hint for transcription (e.g. "zh", "en"). Default: "zh"' },
        },
        required: ['url'],
      },
    );
  }

  override validateToolParams(params: VideoAnalyzerToolParams): string | null {
    if (!params.url) return 'Error: url is required.';
    return null;
  }

  async execute(params: VideoAnalyzerToolParams, signal: AbortSignal): Promise<ToolResult> {
    const err = this.validateToolParams(params);
    if (err) return { llmContent: err, returnDisplay: err };

    const { url, save_to_kb = false, lang = 'zh' } = params;

    try {
      let videoPath = url;
      let videoTitle = 'Unknown';
      let videoDuration = 0;

      if (isURL(url)) {
        ensureDir(TEMP_DIR);
        videoPath = join(TEMP_DIR, 'video.mp4');
        const dlCmd = isYouTube(url) || platform(url) !== 'other'
          ? `yt-dlp -f "best[ext=mp4]/best" -o "${videoPath}" "${url}"`
          : `curl -L -s -o "${videoPath}" "${url}"`;
        await execAsync(dlCmd, { timeout: 300000, signal } as any);
        if (!existsSync(videoPath)) return { llmContent: 'Error: video download failed.', returnDisplay: 'Download failed' };
        try { const { stdout: t } = await execAsync(`yt-dlp --get-title "${url}"`, { timeout: 30000 }); videoTitle = t.trim() || 'Unknown'; } catch {}
        try { const { stdout: d } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`); videoDuration = parseFloat(d.trim()) || 0; } catch {}
      } else {
        if (!existsSync(url)) return { llmContent: `Error: file not found: ${url}`, returnDisplay: 'File not found' };
        try { const { stdout: d } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${url}"`); videoDuration = parseFloat(d.trim()) || 0; } catch {}
        videoTitle = url.split(/[\\/]/).pop() || 'Unknown';
      }

      // Scene detection frame extraction
      const framesDir = join(TEMP_DIR, 'frames');
      ensureDir(framesDir);
      const framePattern = join(framesDir, 'frame_%04d.jpg');
      await execAsync(`ffmpeg -i "${videoPath}" -vf "select='gt(scene,${SCENE_THRESHOLD})'" -vsync vfr -q:v 2 "${framePattern}" -y`, { timeout: 120000, signal } as any).catch(() => {});
      let frames = existsSync(framesDir) ? readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort() : [];

      // Fallback: uniform sampling
      if (frames.length < 3) {
        const count = 10;
        for (let i = 1; i <= count; i++) {
          const t = (videoDuration / count * i).toFixed(1);
          const out = join(framesDir, `sample_${String(i).padStart(4, '0')}.jpg`);
          try { await execAsync(`ffmpeg -ss ${t} -i "${videoPath}" -frames:v 1 -q:v 2 "${out}" -y`, { timeout: 10000 }); } catch {}
        }
        frames = readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort();
      }
      if (frames.length > MAX_FRAMES) { const step = Math.ceil(frames.length / MAX_FRAMES); frames = frames.filter((_, i) => i % step === 0); }

      // Subtitles
      let subtitleText = '';
      let subtitleSource = 'none';
      if (isURL(url) && isYouTube(url)) {
        try {
          const subBase = join(TEMP_DIR, 'subtitle');
          await execAsync(`yt-dlp --write-auto-sub --sub-lang ${lang},en --skip-download -o "${subBase}" "${url}"`, { timeout: 60000 });
          const subFiles = readdirSync(TEMP_DIR).filter(f => f.startsWith('subtitle') && (f.endsWith('.vtt') || f.endsWith('.srt')));
          if (subFiles.length > 0) { subtitleText = parseSub(readFileSync(join(TEMP_DIR, subFiles[0]), 'utf-8')); subtitleSource = 'youtube_official'; }
        } catch {}
      }
      if (!subtitleText) {
        try {
          await execAsync(`whisper "${videoPath}" --model base --language ${lang} --output_format txt --output_dir "${TEMP_DIR}"`, { timeout: 600000, signal } as any);
          const txtFile = join(TEMP_DIR, videoPath.split(/[\\/]/).pop()!.replace(/\.\w+$/, '') + '.txt');
          if (existsSync(txtFile)) { subtitleText = readFileSync(txtFile, 'utf-8').trim(); subtitleSource = 'whisper'; }
        } catch {}
      }

      // LLM Analysis (simplified - no Otto-specific deps)
      let analysisResult = '';
      try {
        const framePaths = frames.slice(0, MAX_FRAMES).map(f => join(framesDir, f));
        const subContext = subtitleText ? `\n\n字幕内容（来源：${subtitleSource}）：\n${subtitleText.substring(0, 4000)}` : '\n\n（无字幕信息）';
        const prompt = `你是一个视频分析助手。以下是视频的关键帧和字幕信息。请分析视频内容并输出结构化总结。\n\n视频标题：${videoTitle}\n视频时长：${Math.round(videoDuration)}秒\n提取帧数：${framePaths.length}帧${subContext}\n\n请输出：\n1. summary: 一句话概述\n2. topics: 主要主题\n3. key_moments: 关键时刻\n4. action_items: 可执行建议`;

        // Try using OttoClient if available
        const client = (this.config as any).getOttoClient?.();
        if (client?.createTemporaryChat) {
          const chat = await client.createTemporaryChat('IMAGE_READER' as any, undefined, { type: 'sub', agentId: 'VideoAnalyzer' }, { disableSystemPrompt: true });
          const parts: any[] = [{ text: prompt }];
          for (const fp of framePaths) { try { parts.push({ inlineData: { mimeType: 'image/jpeg', data: readFileSync(fp).toString('base64') } }); } catch {} }
          const resp = await chat.sendMessage({ message: parts, config: { abortSignal: signal } }, `video-${Date.now()}`, 'IMAGE_READER' as any);
          analysisResult = (resp?.text || resp?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
        }
      } catch {}

      if (!analysisResult) {
        analysisResult = `视频"${videoTitle}"分析完成。\n时长：${Math.round(videoDuration)}秒\n提取帧数：${frames.length}帧\n字幕来源：${subtitleSource}\n${subtitleText ? '字幕摘要：' + subtitleText.substring(0, 500) : ''}\n\n（注：视觉分析模型不可用，以上为基础摘要）`;
      }

      // Knowledge base
      let kbId = '';
      if (save_to_kb) {
        ensureDir(KB_DIR);
        const ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        kbId = `video_${ts}`;
        writeFileSync(join(KB_DIR, `${kbId}.json`), JSON.stringify({ id: kbId, url, title: videoTitle, platform: isURL(url) ? platform(url) : 'local', analyzed_at: new Date().toISOString(), duration_sec: Math.round(videoDuration), summary: analysisResult, subtitle_source: subtitleSource, transcript: subtitleText, frame_count: frames.length }, null, 2));
      }

      const output = `视频分析完成\n\n标题：${videoTitle}\n来源：${isURL(url) ? platform(url) : '本地文件'}\n时长：${Math.round(videoDuration)}秒\n关键帧：${frames.length}帧\n字幕：${subtitleSource}\n\n分析结果：\n${analysisResult}${save_to_kb ? `\n\n已存入知识库（ID: ${kbId}）` : ''}`;
      return { llmContent: output, returnDisplay: `Analyzed: ${videoTitle} (${Math.round(videoDuration)}s, ${frames.length} frames)` };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { llmContent: `Error analyzing video "${url}": ${msg}`, returnDisplay: `Error: ${msg}` };
    }
  }
}
