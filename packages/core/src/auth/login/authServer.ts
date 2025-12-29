/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http';
import { URL } from 'url';
import * as crypto from 'crypto';

import { createDeepvlabAuthHandler } from './deepvlabAuth.js';
import { getFeishuConfigFromServer } from '../../config/serverConfig.js';
import { ProxyAuthManager } from '../../core/proxyAuth.js';
import { AuthTemplates } from './templates/index.js';



/**
 * 认证服务器
 * 在7862端口提供认证选择页面，在7863端口处理回调
 */
export class AuthServer {
  private selectServer?: http.Server;
  private callbackServer?: http.Server;
  private readonly BASE_SELECT_PORT = 7862;
  private readonly BASE_CALLBACK_PORT = 7863;
  private actualSelectPort: number = 7862;
  private actualCallbackPort: number = 7863;

  /**
   * 启动认证服务器
   */
  public async start(): Promise<void> {
    await this.startSelectServer();
    await this.startCallbackServer();
  }

  /**
   * 获取实际的选择服务器端口
   */
  public getActualSelectPort(): number {
    return this.actualSelectPort;
  }

  /**
   * 获取实际的回调服务器端口
   */
  public getActualCallbackPort(): number {
    return this.actualCallbackPort;
  }

  /**
   * 启动认证选择服务器（7862端口起）
   */
  private async startSelectServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.selectServer = http.createServer(async (req, res) => {
        // Add CORS headers to all responses
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // Handle preflight requests
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        if (!req.url) {
          this.sendErrorResponse(res, 'Invalid request');
          return;
        }

        const reqUrl = new URL(req.url, `http://localhost:${this.actualSelectPort}`);

        if (reqUrl.pathname === '/' || reqUrl.pathname === '/auth-select') {
          await this.sendAuthSelectPage(res);
        } else if (reqUrl.pathname === '/start-feishu-auth' && req.method === 'POST') {
          await this.handleStartFeishuAuth(res);
        } else if (reqUrl.pathname === '/start-deepvlab-auth' && req.method === 'POST') {
          await this.handleStartDeepvlabAuth(res);
        } else if (reqUrl.pathname === '/start-cheetah-auth' && req.method === 'POST') {
          await this.handleStartCheetahAuth(req, res);
        } else if (reqUrl.pathname === '/api/backend/feishu-allowed' && req.method === 'GET') {
          await this.handleFeishuAllowedCheck(res);
        } else {
          this.sendErrorResponse(res, 'Not found');
        }
      });

      // 尝试启动服务器，如果端口被占用则尝试下一个端口
      const tryListenSelect = (currentPort: number) => {
        // 如果不是第一次尝试，需要重新创建服务器实例
        if (currentPort > this.BASE_SELECT_PORT) {
          this.selectServer = http.createServer(async (req, res) => {
            // Add CORS headers to all responses
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            // Handle preflight requests
            if (req.method === 'OPTIONS') {
              res.writeHead(200);
              res.end();
              return;
            }

            if (!req.url) {
              this.sendErrorResponse(res, 'Invalid request');
              return;
            }

            const reqUrl = new URL(req.url, `http://localhost:${this.actualSelectPort}`);

            if (reqUrl.pathname === '/' || reqUrl.pathname === '/auth-select') {
              await this.sendAuthSelectPage(res);
            } else if (reqUrl.pathname === '/start-feishu-auth' && req.method === 'POST') {
              await this.handleStartFeishuAuth(res);
            } else if (reqUrl.pathname === '/start-deepvlab-auth' && req.method === 'POST') {
              await this.handleStartDeepvlabAuth(res);
            } else if (reqUrl.pathname === '/start-cheetah-auth' && req.method === 'POST') {
              await this.handleStartCheetahAuth(req, res);
            } else if (reqUrl.pathname === '/api/backend/feishu-allowed' && req.method === 'GET') {
              await this.handleFeishuAllowedCheck(res);
            } else {
              this.sendErrorResponse(res, 'Not found');
            }
          });
        }

        this.selectServer!.listen(currentPort, () => {
          this.actualSelectPort = currentPort;
          console.log(`🌐 认证选择服务器启动在端口 ${currentPort}`);
          console.log(`🔗 认证选择页面: http://localhost:${currentPort}`);
          resolve();
        });

        this.selectServer!.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            console.log(`⚠️ 端口 ${currentPort} 被占用，尝试端口 ${currentPort + 1}`);
            if (currentPort < this.BASE_SELECT_PORT + 10) { // 最多尝试10个端口
              // 移除所有监听器，避免重复绑定
              this.selectServer!.removeAllListeners();
              tryListenSelect(currentPort + 1);
            } else {
              reject(new Error(`无法找到可用端口 (${this.BASE_SELECT_PORT}-${this.BASE_SELECT_PORT + 10})`));
            }
          } else {
            reject(err);
          }
        });
      };

      tryListenSelect(this.BASE_SELECT_PORT);
    });
  }

  /**
   * 启动回调处理服务器（7863端口起）
   */
  private async startCallbackServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.callbackServer = http.createServer(async (req, res) => {
        if (!req.url) {
          this.sendErrorResponse(res, 'Invalid request');
          return;
        }

        const reqUrl = new URL(req.url, `http://localhost:${this.actualCallbackPort}`);

        if (reqUrl.pathname === '/callback') {
          await this.handleCallback(reqUrl, res);
        } else {
          this.sendErrorResponse(res, 'Not found');
        }
      });

      // 尝试启动服务器，如果端口被占用则尝试下一个端口
      const tryListenCallback = (currentPort: number) => {
        // 如果不是第一次尝试，需要重新创建服务器实例
        if (currentPort > this.BASE_CALLBACK_PORT) {
          this.callbackServer = http.createServer(async (req, res) => {
            if (!req.url) {
              this.sendErrorResponse(res, 'Invalid request');
              return;
            }

            const reqUrl = new URL(req.url, `http://localhost:${this.actualCallbackPort}`);

            if (reqUrl.pathname === '/callback') {
              await this.handleCallback(reqUrl, res);
            } else {
              this.sendErrorResponse(res, 'Not found');
            }
          });
        }

        this.callbackServer!.listen(currentPort, () => {
          this.actualCallbackPort = currentPort;
          console.log(`🌐 认证回调服务器启动在端口 ${currentPort}`);
          console.log(`🔗 认证回调地址: http://localhost:${currentPort}/callback`);
          resolve();
        });

        this.callbackServer!.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            console.log(`⚠️ 端口 ${currentPort} 被占用，尝试端口 ${currentPort + 1}`);
            if (currentPort < this.BASE_CALLBACK_PORT + 10) { // 最多尝试10个端口
              // 移除所有监听器，避免重复绑定
              this.callbackServer!.removeAllListeners();
              tryListenCallback(currentPort + 1);
            } else {
              reject(new Error(`无法找到可用端口 (${this.BASE_CALLBACK_PORT}-${this.BASE_CALLBACK_PORT + 10})`));
            }
          } else {
            reject(err);
          }
        });
      };

      tryListenCallback(this.BASE_CALLBACK_PORT);
    });
  }

  /**
   * 发送认证选择页面
   */
  private async sendAuthSelectPage(res: http.ServerResponse): Promise<void> {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const html = AuthTemplates.getAuthSelectPage();

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(html);
  }

  /**
   * 处理飞书允许检查请求
   */
  private async handleFeishuAllowedCheck(res: http.ServerResponse): Promise<void> {
    try {
      console.log('🔍 [Auth Server] 处理飞书允许检查请求');

      // 调用后台接口检查是否允许飞书登录
      const proxyServerUrl = process.env.DEEPX_SERVER_URL || 'https://api-code.deepvlab.ai';
      const apiUrl = `${proxyServerUrl}/api/client/feishu-allowed`;

      console.log('🔍 [Auth Server] 调用后台接口:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DeepCode-CLI/1.0.0'
        }
      });

      if (!response.ok) {
        console.error('❌ [Auth Server] 后台接口调用失败:', response.status, response.statusText);
        throw new Error(`后台接口调用失败: ${response.status}`);
      }

      const data = await response.json();
      console.log('📋 [Auth Server] 后台接口返回:', data);

      // 返回完整的后台数据，包含所有字段
      const result = {
        ip: data.ip || 'unknown',
        feishuLoginAllowed: Boolean(data.feishuLoginAllowed),
        isPrivateNetwork: Boolean(data.isPrivateNetwork),
        isInWhitelist: Boolean(data.isInWhitelist),
        isChina: Boolean(data.isChina),
        messages: Array.isArray(data.messages) ? data.messages : [],
        country: data.country || 'unknown',
        timestamp: data.timestamp || new Date().toISOString()
      };

      console.log('✅ [Auth Server] 飞书登录权限检查结果:', result);

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(result));

    } catch (error) {
      console.error('❌ [Auth Server] 飞书允许检查失败:', error);

      // 发生错误时返回不允许飞书登录
      const errorResponse = {
        ip: 'unknown',
        feishuLoginAllowed: false,
        isPrivateNetwork: false,
        isInWhitelist: false,
        isChina: false,
        messages: [],
        country: 'unknown',
        error: error instanceof Error ? error.message : '检查失败',
        timestamp: new Date().toISOString()
      };

      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(errorResponse));
    }
  }

  /**
   * 处理启动飞书认证请求
   */
  private async handleStartFeishuAuth(res: http.ServerResponse): Promise<void> {
    try {
      console.log('🚀 [Auth Server] 启动飞书认证流程');

      // 获取飞书配置（只需要appId）
      const feishuConfig = await getFeishuConfigFromServer();

      // 直接构建飞书认证URL，只使用appId
      const authUrl = this.buildFeishuAuthUrl(feishuConfig.appId);

      const response = {
        success: true,
        authUrl: authUrl
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(response));

    } catch (error) {
      console.error('❌ [Auth Server] 飞书认证启动失败:', error);
      const response = {
        success: false,
        error: error instanceof Error ? error.message : '飞书认证启动失败'
      };

      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(response));
    }
  }

  /**
   * 构建飞书认证URL
   */
  private buildFeishuAuthUrl(appId: string): string {
    const state = this.generateState();
    const params = new URLSearchParams({
      app_id: appId,
      redirect_uri: `http://localhost:${this.actualCallbackPort}/callback`,
      response_type: 'code',
      scope: 'contact:user.employee_id:readonly',
      state: state,
    });

    const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`;
    console.log('🔗 [Auth Server] 飞书认证URL:', authUrl);

    return authUrl;
  }

  /**
   * 生成state参数用于防止CSRF攻击
   */
  private generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * 处理启动DeepVlab认证请求
   */
  private async handleStartDeepvlabAuth(res: http.ServerResponse): Promise<void> {
    try {
      console.log('🚀 [Auth Server] 启动DeepVlab认证流程');

      const deepvlabHandler = createDeepvlabAuthHandler(this.actualCallbackPort);
      const authUrl = deepvlabHandler.buildAuthUrl();

      const response = {
        success: true,
        authUrl: authUrl
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(response));

    } catch (error) {
      console.error('❌ [Auth Server] DeepVlab认证启动失败:', error);
      const response = {
        success: false,
        error: error instanceof Error ? error.message : 'DeepVlab认证启动失败'
      };

      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(response));
    }
  }

  /**
   * 处理启动猎豹OA认证请求
   */
  private async handleStartCheetahAuth(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      console.log('🚀 [Auth Server] 启动猎豹OA认证流程');

      // 读取请求体
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });

      req.on('end', async () => {
        try {
          const { email, password } = JSON.parse(body);

          if (!email || !password) {
            const response = {
              success: false,
              message: '邮箱和密码不能为空'
            };

            res.writeHead(400, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(response));
            return;
          }

          console.log('🔄 [Auth Server] 验证猎豹OA凭据:', email);

          // 调用后端接口验证猎豹OA
          const proxyServerUrl = process.env.DEEPX_SERVER_URL || 'https://api-code.deepvlab.ai';
          const jwtResponse = await fetch(`${proxyServerUrl}/auth/jwt/cheetah-login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'DeepCode-CLI/1.0.0'
            },
            body: JSON.stringify({
              email: email,
              password: password,
              clientInfo: {
                platform: process.platform,
                version: process.version,
                timestamp: Date.now(),
                userAgent: 'DeepCode-CLI/1.0.0'
              }
            })
          });

          if (!jwtResponse.ok) {
            const errorText = await jwtResponse.text();
            console.error('❌ [Auth Server] 猎豹OA验证失败:', jwtResponse.status, errorText);

            const response = {
              success: false,
              message: '登录失败，请检查您的凭据'
            };

            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(response));
            return;
          }

          const jwtData = await jwtResponse.json();
          console.log('✅ [Auth Server] 猎豹OA验证成功');

          // 保存JWT令牌和用户信息到~/.deepv/目录
          const proxyAuthManager = ProxyAuthManager.getInstance();

          // 保存JWT token
          if (jwtData.accessToken) {
            proxyAuthManager.setJwtTokenData({
              accessToken: jwtData.accessToken,
              refreshToken: jwtData.refreshToken,
              expiresIn: jwtData.expiresIn || 900
            });
            console.log('✅ [Auth Server] JWT访问令牌和刷新令牌已保存到~/.deepv/');
          }

          // 保存用户信息
          if (jwtData.user) {
            const userInfo = {
              openId: jwtData.user.openId || jwtData.user.userId,
              userId: jwtData.user.userId,
              name: jwtData.user.name,
              enName: jwtData.user.name,
              email: jwtData.user.email,
              avatar: jwtData.user.avatar
            };
            proxyAuthManager.setUserInfo(userInfo);
            console.log(`✅ [Auth Server] 用户信息已保存到~/.deepv/: ${userInfo.name} (${userInfo.email || userInfo.openId || 'N/A'})`);
          }

          // 返回成功响应
          const response = {
            success: true,
            message: '登录成功'
          };

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify(response));

          // 延迟恢复终端状态，确保响应已发送
          setTimeout(() => {
            this.restoreVSCodeTerminalState();
          }, 100);

        } catch (parseError) {
          console.error('❌ [Auth Server] 解析请求体失败:', parseError);
          const response = {
            success: false,
            message: '请求格式错误'
          };

          res.writeHead(400, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify(response));
        }
      });

    } catch (error) {
      console.error('❌ [Auth Server] 猎豹OA认证启动失败:', error);
      const response = {
        success: false,
        message: error instanceof Error ? error.message : '猎豹OA认证启动失败'
      };

      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(response));
    }
  }

  /**
   * 处理认证回调
   */
  private async handleCallback(url: URL, res: http.ServerResponse): Promise<void> {
    const plat = url.searchParams.get('plat');

    console.log('🔄 [Auth Server] 收到认证回调');
    console.log('🔄 [Auth Server] 回调URL:', url.toString());
    console.log('🔄 [Auth Server] 平台参数:', plat);

    if (plat === 'deepvlab') {
      // DeepVlab认证回调处理
      await this.handleDeepvlabCallback(url, res);
    } else {
      // 飞书认证回调处理（默认）
      console.log('🔄 [Auth Server] 处理飞书认证回调');
      await this.handleFeishuCallback(url, res);
    }
  }

  /**
   * 验证JWT token格式
   */
  private verifyJwtFormat(token: string): { valid: boolean; payload?: any; error?: string } {
    try {
      // JWT应该有3个部分，用.分隔
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, error: 'JWT格式错误：应该包含3个部分' };
      }

      const [header, payload, signature] = parts;

      // 验证header
      let decodedHeader;
      try {
        decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString());
      } catch (e) {
        return { valid: false, error: 'JWT header解码失败' };
      }

      // 验证payload
      let decodedPayload;
      try {
        decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString());
      } catch (e) {
        return { valid: false, error: 'JWT payload解码失败' };
      }

      // 检查必要字段
      if (!decodedPayload.exp) {
        return { valid: false, error: 'JWT缺少过期时间(exp)字段' };
      }

      if (!decodedPayload.iat) {
        return { valid: false, error: 'JWT缺少签发时间(iat)字段' };
      }

      // 检查是否过期
      const now = Math.floor(Date.now() / 1000);
      if (decodedPayload.exp < now) {
        return { valid: false, error: 'JWT已过期' };
      }

      console.log('✅ [Auth Server] JWT格式验证通过:', {
        header: decodedHeader,
        exp: new Date(decodedPayload.exp * 1000).toISOString(),
        iat: new Date(decodedPayload.iat * 1000).toISOString()
      });

      return { valid: true, payload: decodedPayload };

    } catch (error) {
      return {
        valid: false,
        error: `JWT验证失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 处理DeepVlab认证回调
   */
  private async handleDeepvlabCallback(url: URL, res: http.ServerResponse): Promise<void> {
    try {
      console.log('🔄 [Auth Server] 处理DeepVlab认证回调');
      const deepvlabHandler = createDeepvlabAuthHandler(this.actualCallbackPort);
      const result = deepvlabHandler.handleCallback(url);

      if (!result.success) {
        console.error('❌ [Auth Server] DeepVlab认证失败:', result.error);
        this.sendErrorResponse(res, result.error || 'DeepVlab认证失败');
        return;
      }

      if (!result.token || !result.user_id) {
        console.error('❌ [Auth Server] DeepVlab认证回调缺少必要参数');
        this.sendErrorResponse(res, 'DeepVlab认证回调缺少token或user_id参数');
        return;
      }

      // 🔍 新增：JWT格式验证
      console.log('� [Auth Server] 开始验证JWT token格式');
      const jwtVerification = this.verifyJwtFormat(result.token);

      if (!jwtVerification.valid) {
        console.error('❌ [Auth Server] JWT格式验证失败:', jwtVerification.error);
        this.sendErrorResponse(res, `JWT格式验证失败: ${jwtVerification.error}`);
        return;
      }

      console.log('✅ [Auth Server] JWT格式验证通过，开始交换JWT令牌');

      // 调用后端接口交换JWT令牌
      const proxyServerUrl = process.env.DEEPX_SERVER_URL || 'https://api-code.deepvlab.ai';
      console.log ('deepvlab交换JWT，proxyServerUrl:', `${proxyServerUrl}/auth/jwt/deepvlab-login`);

      const jwtResponse = await fetch(`${proxyServerUrl}/auth/jwt/deepvlab-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DeepCode-CLI/1.0.0'
        },
        body: JSON.stringify({
          plat: 'deepvlab',
          token: result.token,
          user_id: result.user_id,
          clientInfo: {
            platform: process.platform,
            version: process.version,
            timestamp: Date.now(),
            userAgent: 'DeepCode-CLI/1.0.0'
          }
        })
      });

      if (!jwtResponse.ok) {
        const errorText = await jwtResponse.text();
        console.error('❌ [Auth Server] JWT交换失败:', jwtResponse.status, errorText);
        this.sendErrorResponse(res, `JWT交换失败: ${jwtResponse.status}`);
        return;
      }

      const jwtData = await jwtResponse.json();
      console.log('📋 [Auth Server] JWT交换响应数据:', jwtData);

      console.log('✅ [Auth Server] JWT交换成功:', {
        user: jwtData.user?.name,
        email: jwtData.user?.email,
        expiresIn: jwtData.expiresIn,
      });

      // 保存JWT令牌和用户信息到~/.deepv/目录
      const proxyAuthManager = ProxyAuthManager.getInstance();

      // 保存JWT token
      if (jwtData.accessToken) {
        proxyAuthManager.setJwtTokenData({
          accessToken: jwtData.accessToken,
          refreshToken: jwtData.refreshToken,
          expiresIn: jwtData.expiresIn || 900
        });
        console.log('✅ [Auth Server] JWT访问令牌和刷新令牌已保存到~/.deepv/');
      }

      // 保存用户信息
      if (jwtData.user) {
        const userInfo = {
          openId: jwtData.user.openId || jwtData.user.userId,
          userId: jwtData.user.userId,
          name: jwtData.user.name,
          enName: jwtData.user.name,
          email: jwtData.user.email,
          avatar: jwtData.user.avatar
        };
        proxyAuthManager.setUserInfo(userInfo);
        console.log(`✅ [Auth Server] 用户信息已保存到~/.deepv/: ${userInfo.name} (${userInfo.email || userInfo.openId || 'N/A'})`);
      }

      // 显示成功页面
      this.sendDeepvlabSuccessResponse(res);

    } catch (error) {
      console.error('❌ [Auth Server] DeepVlab认证处理失败:', error);
      const errorMsg = error instanceof Error ? error.message : 'DeepVlab认证处理失败';
      this.sendErrorResponse(res, errorMsg);
    }
  }

  /**
   * 处理飞书认证回调
   */
  private async handleFeishuCallback(url: URL, res: http.ServerResponse): Promise<void> {
    try {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        console.error('❌ [Auth Server] 飞书认证错误:', error);
        this.sendErrorResponse(res, `飞书认证失败: ${error}`);
        return;
      }

      if (!code) {
        console.error('❌ [Auth Server] 缺少授权码');
        this.sendErrorResponse(res, '飞书认证回调中缺少授权码');
        return;
      }

      console.log('🔄 [Auth Server] 开始处理飞书认证回调');
      console.log('🔄 [Auth Server] 授权码已获取，开始交换访问令牌');

      console.log('🔄 [Auth Server] 调用服务端exchange接口交换飞书token');

      // 调用服务端的飞书token交换接口（与官网相同的流程）
      const proxyServerUrl = process.env.DEEPX_SERVER_URL || 'https://api-code.deepvlab.ai';
      console.log('飞书token交换，proxyServerUrl:', `${proxyServerUrl}/api/auth/feishu/exchange`);

      const exchangeResponse = await fetch(`${proxyServerUrl}/api/auth/feishu/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DeepCode-CLI/1.0.0'
        },
        body: JSON.stringify({
          code: code,
          redirect_uri: `http://localhost:${this.actualCallbackPort}/callback`
        })
      });

      if (!exchangeResponse.ok) {
        throw new Error(`飞书token交换失败: ${exchangeResponse.status}`);
      }

      const exchangeData = await exchangeResponse.json();

      if (!exchangeData.success) {
        throw new Error(`飞书token交换失败: ${exchangeData.error}`);
      }

      const accessToken = exchangeData.data.accessToken;
      console.log('✅ [Auth Server] 飞书访问令牌获取成功');
      console.log('🔄 [Auth Server] 开始交换JWT令牌');

      // 调用后端接口交换JWT令牌
      console.log ('飞书交换JWT，proxyServerUrl:', `${proxyServerUrl}/auth/jwt/feishu-login`);
      const jwtResponse = await fetch(`${proxyServerUrl}/auth/jwt/feishu-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DeepCode-CLI/1.0.0'
        },
        body: JSON.stringify({
          feishuAccessToken: accessToken,
          clientInfo: {
            platform: process.platform,
            version: process.version,
            timestamp: Date.now(),
            userAgent: 'DeepCode-CLI/1.0.0'
          }
        })
      });

      if (!jwtResponse.ok) {
        const errorText = await jwtResponse.text();
        console.error('❌ [Auth Server] JWT交换失败:', jwtResponse.status, errorText);
        this.sendErrorResponse(res, `JWT交换失败: ${jwtResponse.status}`);
        return;
      }

      const jwtData = await jwtResponse.json();
      console.log('📋 [Auth Server] JWT交换响应数据:', jwtData);

      console.log('✅ [Auth Server] JWT交换成功33:', {
        user: jwtData.user?.name,
        email: jwtData.user?.email,
        expiresIn: jwtData.expiresIn,
      });

      // 保存JWT令牌和用户信息到~/.deepv/目录
      const proxyAuthManager = ProxyAuthManager.getInstance();

      // 保存JWT token
      if (jwtData.accessToken) {
        proxyAuthManager.setJwtTokenData({
          accessToken: jwtData.accessToken,
          refreshToken: jwtData.refreshToken,
          expiresIn: jwtData.expiresIn || 900
        });
        console.log('✅ [Auth Server] JWT访问令牌和刷新令牌已保存到~/.deepv/');
      }

      // 保存用户信息（与其他登录方式保持一致的字段映射）
      if (jwtData.user) {
        const userInfo = {
          openId: jwtData.user.openId || jwtData.user.userId,
          userId: jwtData.user.userId,
          name: jwtData.user.name,
          enName: jwtData.user.name,
          email: jwtData.user.email,
          avatar: jwtData.user.avatar
        };
        proxyAuthManager.setUserInfo(userInfo);
        console.log(`✅ [Auth Server] 用户信息已保存到~/.deepv/: ${userInfo.name} (${userInfo.email || userInfo.openId || 'N/A'})`);
      }

      // 显示成功页面
      this.sendFeishuSuccessResponse(res);

    } catch (error) {
      console.error('❌ [Auth Server] 飞书认证处理失败:', error);
      const errorMsg = error instanceof Error ? error.message : '飞书认证处理失败';
      this.sendErrorResponse(res, errorMsg);
    }
  }



  /**
   * 发送DeepVlab认证成功响应
   */
  private sendDeepvlabSuccessResponse(res: http.ServerResponse): void {
    const html = AuthTemplates.getDeepvlabSuccessPage();

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(html);

    // 延迟恢复终端状态，确保响应已发送
    setTimeout(() => {
      this.restoreVSCodeTerminalState();
    }, 100);
  }

  /**
   * 发送飞书认证成功响应
   */
  private sendFeishuSuccessResponse(res: http.ServerResponse): void {
    const html = AuthTemplates.getFeishuSuccessPage();

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(html);

    // 延迟恢复终端状态，确保响应已发送
    setTimeout(() => {
      this.restoreVSCodeTerminalState();
    }, 100);
  }

  /**
   * 发送错误响应
   */
  private sendErrorResponse(res: http.ServerResponse, message: string): void {
    // Add CORS headers to error responses too
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    const html = AuthTemplates.getErrorPage(message);

    res.writeHead(400, {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(html);
  }

  /**
   * 停止服务器
   */
  public stop(): void {
    if (this.selectServer) {
      this.selectServer.close();
      console.log('🛑 认证选择服务器已停止');
    }
    if (this.callbackServer) {
      this.callbackServer.close();
      console.log('🛑 认证回调服务器已停止');
    }

    // VSCode终端特殊处理：确保终端状态正确恢复
    this.restoreVSCodeTerminalState();
  }

  /**
   * VSCode终端状态恢复（同步版本）
   */
  private restoreVSCodeTerminalState(): void {
    const isVSCodeTerminal = !!(
      process.env.VSCODE_PID ||
      process.env.TERM_PROGRAM === 'vscode'
    );

    if (!isVSCodeTerminal) {
      return; // 非VSCode环境，无需特殊处理
    }

    console.log('🔧 检测到VSCode终端环境，正在恢复终端状态...');

    try {
      // 强制刷新终端状态
      if (process.stdout.isTTY) {
        // 发送终端重置序列
        process.stdout.write('\x1b[0m'); // 重置所有属性
        process.stdout.write('\x1b[?25h'); // 显示光标

        // 触发终端重新计算
        const originalColumns = process.stdout.columns;
        if (originalColumns) {
          // 模拟resize事件来强制终端重新校准
          process.stdout.emit('resize');
        }
      }

      // 发送一个空的输入提示来激活输入状态
      process.stdout.write('\r'); // 回车符

      console.log('✅ VSCode终端状态恢复完成');

    } catch (error) {
      console.warn('⚠️ VSCode终端状态恢复时出现警告:', error);
      // 即使恢复失败也不影响主流程
    }
  }
}
