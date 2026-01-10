/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { proxyAuthManager } from './proxyAuth.js';
import { logger } from '../utils/enhancedLogger.js';
import { UnauthorizedError } from '../utils/errors.js';

export interface ImageGenerationTask {
  id: number;
  task_id: string;
  user_uuid: string;
  model: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result_urls: string[] | null;
  task_info: {
    can_cancel: boolean;
    estimated_time?: number;
  };
  request_params: {
    model: string;
    prompt: string;
    size: string;
  };
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  credits_deducted: number;
}

export class ImageGeneratorAdapter {
  private static instance: ImageGeneratorAdapter;

  private constructor() {}

  public static getInstance(): ImageGeneratorAdapter {
    if (!ImageGeneratorAdapter.instance) {
      ImageGeneratorAdapter.instance = new ImageGeneratorAdapter();
    }
    return ImageGeneratorAdapter.instance;
  }

  /**
   * Helper to perform fetch with 401 retry logic
   */
  private async fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
    // First attempt
    let userHeaders = await proxyAuthManager.getUserHeaders();
    let response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...userHeaders,
      },
    });

    // If 401, try to refresh token and retry once
    if (response.status === 401) {
      logger.warn('[ImageGenerator] 401 Unauthorized, attempting token refresh...');
      try {
        await proxyAuthManager.refreshAccessToken();
        // Re-fetch headers with new token
        userHeaders = await proxyAuthManager.getUserHeaders();

        logger.info('[ImageGenerator] Token refreshed, retrying request...');
        response = await fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            ...userHeaders,
          },
        });
      } catch (refreshError) {
        logger.error('[ImageGenerator] Token refresh failed', refreshError);
        // If refresh fails, we'll return the original 401 response or throw
      }
    }

    return response;
  }

  /**
   * Get upload URL for image
   */
  async getUploadUrl(filename: string, contentType: string): Promise<{
    upload_url: string;
    public_url: string;
    storage_path: string;
    expires_in: number;
  }> {
    const endpoint = '/web-api/images/upload-url';
    const proxyUrl = `${proxyAuthManager.getProxyServerUrl()}${endpoint}`;

    logger.debug('[ImageGenerator] Getting upload URL', { filename, contentType });

    try {
      const response = await this.fetchWithRetry(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename,
          content_type: contentType,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) {
          throw new UnauthorizedError(`Authentication failed: ${errorText}`);
        }
        throw new Error(`Failed to get upload URL (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('[ImageGenerator] Get upload URL error', error);
      throw error;
    }
  }

  /**
   * Upload image to Google Cloud Storage
   */
  async uploadImage(uploadUrl: string, fileBuffer: Buffer | Uint8Array, contentType: string): Promise<void> {
    logger.debug('[ImageGenerator] Uploading image to GCS');

    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        body: fileBuffer as any,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload image (${response.status}): ${errorText}`);
      }
    } catch (error) {
      logger.error('[ImageGenerator] Upload image error', error);
      throw error;
    }
  }

  /**
   * Submit an image generation task
   */
  async submitImageGenerationTask(prompt: string, size: string, fromImgUrl?: string, imageSize?: string): Promise<ImageGenerationTask> {
    const endpoint = '/web-api/images/generations';
    const proxyUrl = `${proxyAuthManager.getProxyServerUrl()}${endpoint}`;

    logger.debug('[ImageGenerator] Submitting task', { prompt, size, fromImgUrl, imageSize });

    try {
      const body: any = {
        prompt,
        size,
      };

      if (fromImgUrl) {
        body.from_img_url = fromImgUrl;
      }

      if (imageSize) {
        body.image_size = imageSize;
      }

      const response = await this.fetchWithRetry(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) {
          throw new UnauthorizedError(`Authentication failed: ${errorText}`);
        }
        throw new Error(`Image generation submission failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data as ImageGenerationTask;
    } catch (error) {
      logger.error('[ImageGenerator] Submission error', error);
      throw error;
    }
  }

  /**
   * Get the status of an image generation task
   */
  async getImageTaskStatus(taskId: string): Promise<ImageGenerationTask> {
    const endpoint = `/web-api/images/tasks/${taskId}`;
    const proxyUrl = `${proxyAuthManager.getProxyServerUrl()}${endpoint}`;

    try {
      const response = await this.fetchWithRetry(proxyUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) {
          throw new UnauthorizedError(`Authentication failed: ${errorText}`);
        }
        throw new Error(`Failed to get task status (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data as ImageGenerationTask;
    } catch (error) {
      logger.error('[ImageGenerator] Status check error', error);
      throw error;
    }
  }
}