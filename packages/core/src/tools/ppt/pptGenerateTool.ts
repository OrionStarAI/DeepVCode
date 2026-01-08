/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, Icon, ToolResult, ToolLocation, ToolCallConfirmationDetails, ToolConfirmationOutcome } from '../tools.js';
import { Type } from '@google/genai';
import { Config } from '../../config/config.js';
import { PPTOutlineManager } from './pptOutlineManager.js';
import { ProxyAuthManager } from '../../core/proxyAuth.js';
import open from 'open';
import { logger } from '../../utils/enhancedLogger.js';
import { t } from '../../utils/simpleI18n.js';

export interface PptGenerateToolParams {
  /** 确认提交（默认true） */
  confirm?: boolean;
}

interface PPTOutlineResponse {
  id: number;
  user_uuid: string;
  topic: string;
  outline: string;
  page_count: number;
  status: string;
  image_task_info: unknown;
  result_data: unknown;
  error_message: string | null;
  pre_deducted_points: number;
  actual_deducted_points: number;
  created_at: string;
  updated_at: string;
}

interface TempCodeResponse {
  success: boolean;
  code?: string;
  expiresAt?: number;
  expiresIn?: number;
  error?: string;
}

export class PptGenerateTool extends BaseTool<PptGenerateToolParams, ToolResult> {
  static readonly Name = 'ppt_generate';

  /** 服务端API地址 */
  private readonly serverUrl: string;
  /** Web前端地址 */
  private readonly webUrl: string;

  constructor(private readonly config: Config) {
    super(
      PptGenerateTool.Name,
      t('tool.ppt_generate'),
      t('tool.ppt_generate.description'),
      Icon.Globe,
      {
        type: Type.OBJECT,
        properties: {
          confirm: {
            type: Type.BOOLEAN,
            description: t('ppt_generate.param.confirm'),
          },
        },
        required: [],
      },
      true, // isOutputMarkdown
      true, // forceMarkdown
    );

    // 使用统一的服务端地址配置
    this.serverUrl = process.env.DEEPX_SERVER_URL || 'https://api-code.deepvlab.ai';
    this.webUrl = process.env.DEEPX_WEB_URL || 'https://dvcode.deepvlab.ai';
  }

  validateToolParams(_params: PptGenerateToolParams): string | null {
    const manager = PPTOutlineManager.getInstance();
    return manager.validateForSubmission();
  }

  getDescription(_params: PptGenerateToolParams): string {
    const manager = PPTOutlineManager.getInstance();
    const state = manager.getState();
    return `提交PPT大纲并生成: ${state.topic || '(未设置主题)'}`;
  }

  toolLocations(_params: PptGenerateToolParams): ToolLocation[] {
    return [];
  }

  /**
   * 需要用户确认才能执行
   */
  async shouldConfirmExecute(
    _params: PptGenerateToolParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const manager = PPTOutlineManager.getInstance();
    const state = manager.getState();

    // 先验证参数
    const validationError = manager.validateForSubmission();
    if (validationError) {
      return false; // 参数无效时不弹确认框，让 execute 返回错误
    }

    // 截取大纲预览（最多显示500字符）
    const outlinePreview = state.outline.length > 500
      ? state.outline.substring(0, 500) + '...'
      : state.outline;

    const confirmationDetails: ToolCallConfirmationDetails = {
      type: 'info',
      title: 'Confirm PPT Generation',
      prompt: `即将提交PPT大纲并生成

📝 主题: ${state.topic}
📄 页数: ${state.pageCount}

📋 大纲预览:
${outlinePreview}

确认后将：
1. 提交大纲到服务端
2. 启动PPT生成任务
3. 打开浏览器预览页面`,
      onConfirm: async (_outcome: ToolConfirmationOutcome) => {
        // No special handling needed on confirm
      },
    };

    return confirmationDetails;
  }

  async execute(params: PptGenerateToolParams, signal: AbortSignal): Promise<ToolResult> {
    const manager = PPTOutlineManager.getInstance();
    const state = manager.getState();

    // 再次验证
    const validationError = manager.validateForSubmission();
    if (validationError) {
      return {
        llmContent: `❌ ${validationError}`,
        returnDisplay: `❌ ${validationError}`,
      };
    }

    try {
      // 1. 获取认证token
      logger.info('[PptGenerateTool] Getting access token...');
      const proxyAuthManager = ProxyAuthManager.getInstance();
      const accessToken = await proxyAuthManager.getAccessToken();

      if (!accessToken) {
        return {
          llmContent: `❌ 未登录，请先执行 /auth 命令进行身份认证

💡 提示：在命令行中输入 /auth 进行登录`,
          returnDisplay: '❌ 未登录，请先执行 /auth 命令',
        };
      }

      // 2. 提交大纲到 API
      logger.info('[PptGenerateTool] Submitting outline to API...');
      const outlineResponse = await this.submitOutline(state, accessToken, signal);
      const taskId = outlineResponse.id;
      manager.setTaskId(taskId);
      logger.info(`[PptGenerateTool] Outline submitted, task ID: ${taskId}`);

      // 3. 启动生成任务
      logger.info('[PptGenerateTool] Starting generate task...');
      await this.startGenerateTask(taskId, accessToken, signal);
      logger.info('[PptGenerateTool] Generate task started');

      // 4. 获取临时登录代码
      logger.info('[PptGenerateTool] Getting temp code for browser login...');
      const tempCode = await this.getTempCode(accessToken, signal);
      logger.info('[PptGenerateTool] Temp code obtained');

      // 5. 构建登录跳转URL
      const redirectPath = `/ppt/edit/${taskId}`;
      const loginUrl = `${this.webUrl}/token-login?code=${tempCode}&redirect=${encodeURIComponent(redirectPath)}`;

      // 6. 打开浏览器
      logger.info(`[PptGenerateTool] Opening browser: ${loginUrl}`);
      try {
        await open(loginUrl);
        logger.info('[PptGenerateTool] Browser opened successfully');
      } catch (openError) {
        // 浏览器打开失败时，提供URL让用户手动打开
        logger.warn('[PptGenerateTool] Failed to open browser:', openError);
        manager.clear();
        return {
          llmContent: `✅ PPT生成任务已提交成功！

📊 任务信息:
- 任务ID: ${taskId}
- 主题: ${state.topic}
- 页数: ${state.pageCount}

⚠️ 无法自动打开浏览器，请手动访问以下链接查看PPT：
${loginUrl}

PPT模式已退出。`,
          returnDisplay: `✅ PPT任务 #${taskId} 已提交（请手动打开链接）`,
        };
      }

      // 7. 清理PPT模式
      manager.clear();

      return {
        llmContent: `✅ PPT生成任务已提交成功！

📊 任务信息:
- 任务ID: ${taskId}
- 主题: ${state.topic}
- 页数: ${state.pageCount}

🌐 已打开浏览器跳转到预览页面: ${redirectPath}

PPT模式已退出。`,
        returnDisplay: `✅ PPT任务 #${taskId} 已提交，浏览器已打开`,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[PptGenerateTool] Error:', errorMessage);

      return {
        llmContent: `❌ PPT生成失败: ${errorMessage}

💡 可能的解决方案：
1. 检查网络连接
2. 确认已正确登录 (/auth)
3. 检查服务端是否正常运行`,
        returnDisplay: `❌ 生成失败: ${errorMessage}`,
      };
    }
  }

  /**
   * 提交大纲到API
   */
  private async submitOutline(
    state: { topic: string; pageCount: number; outline: string },
    accessToken: string,
    signal: AbortSignal,
  ): Promise<PPTOutlineResponse> {
    const url = `${this.serverUrl}/web-api/ppt/outline`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'DeepCode CLI',
      },
      body: JSON.stringify({
        topic: state.topic,
        page_count: state.pageCount,
        outline: state.outline,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`提交大纲失败 (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * 启动生成任务
   */
  private async startGenerateTask(taskId: number, accessToken: string, signal: AbortSignal): Promise<void> {
    const url = `${this.serverUrl}/web-api/ppt/generate/${taskId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'DeepCode CLI',
      },
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`启动生成任务失败 (${response.status}): ${errorText}`);
    }
  }

  /**
   * 获取临时登录代码
   */
  private async getTempCode(accessToken: string, signal: AbortSignal): Promise<string> {
    const url = `${this.serverUrl}/auth/temp-code/generate`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'DeepCode CLI',
      },
      body: JSON.stringify({
        expiresIn: 600, // 10分钟有效期
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`获取登录代码失败 (${response.status}): ${errorText}`);
    }

    const result: TempCodeResponse = await response.json();

    if (!result.success || !result.code) {
      throw new Error(`获取登录代码失败: ${result.error || '未知错误'}`);
    }

    return result.code;
  }
}
