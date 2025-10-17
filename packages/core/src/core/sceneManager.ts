/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 场景类型枚举
 * 定义了不同的AI调用场景，用于选择合适的模型和配置
 */
export enum SceneType {
  /** 主聊天对话场景 */
  CHAT_CONVERSATION = 'chat_conversation',
  
  /** Web内容获取场景 */
  WEB_FETCH = 'web_fetch',
  
  /** Web搜索场景 */
  WEB_SEARCH = 'web_search',
  
  /** 内容摘要场景 */
  CONTENT_SUMMARY = 'content_summary',
  
  /** JSON生成场景 */
  JSON_GENERATION = 'json_generation',
  
  /** 对话压缩场景 */
  COMPRESSION = 'compression',
  
  /** SubAgent子代理场景 */
  SUB_AGENT = 'sub_agent',
  
  /** 代码助手场景 */
  CODE_ASSIST = 'code_assist',
  
  /** 编辑校正场景 */
  EDIT_CORRECTION = 'edit_correction',
}

/**
 * 场景到模型的映射配置
 * 不同场景使用不同的最适合的模型
 * claude-sonnet-4@20250514
 * gemini-2.5-flash
 * gemini-2.5-pro
 */
export const SCENE_MODEL_MAPPING: Record<SceneType, string> = {
  [SceneType.CHAT_CONVERSATION]: 'claude-sonnet-4@20250514',  // 高质量对话
  [SceneType.WEB_FETCH]: 'gemini-2.5-flash',                  // 快速内容理解
  [SceneType.WEB_SEARCH]: 'gemini-2.5-flash',                 // 搜索结果处理
  [SceneType.CODE_ASSIST]: 'claude-sonnet-4@20250514',      // 代码分析
  [SceneType.CONTENT_SUMMARY]: 'gemini-2.5-flash',            // 快速摘要
  [SceneType.EDIT_CORRECTION]: 'claude-sonnet-4@20250514',     // 轻量编辑
  [SceneType.JSON_GENERATION]: 'gemini-2.5-flash',             // 结构化输出
  [SceneType.COMPRESSION]: 'gemini-2.5-flash',               // 对话压缩
  [SceneType.SUB_AGENT]: 'claude-sonnet-4@20250514',       // SubAgent子代理
};

/**
 * 场景管理器
 * 提供场景相关的工具方法
 */
export class SceneManager {
  /**
   * 根据场景获取推荐的模型
   * @param scene 场景类型
   * @param userPreferredModel 用户设置的首选模型，会覆盖 CHAT_CONVERSATION 和 SUB_AGENT 场景的默认模型
   */
  static getModelForScene(scene?: SceneType): string | undefined {
    if (!scene) return undefined;
    return SCENE_MODEL_MAPPING[scene];
  }

  /**
   * 判断是否为Claude模型
   */
  static isClaudeModel(model: string): boolean {
    return model.includes('claude') || model.includes('anthropic');
  }

  /**
   * 判断是否为Gemini模型
   */
  static isGeminiModel(model: string): boolean {
    return model.includes('gemini') && !this.isClaudeModel(model);
  }

  /**
   * 获取场景的显示名称
   */
  static getSceneDisplayName(scene: SceneType): string {
    const displayNames: Record<SceneType, string> = {
      [SceneType.CHAT_CONVERSATION]: '聊天对话',
      [SceneType.WEB_FETCH]: 'Web内容获取',
      [SceneType.WEB_SEARCH]: 'Web搜索',
      [SceneType.CODE_ASSIST]: '代码助手',
      [SceneType.CONTENT_SUMMARY]: '内容摘要',
      [SceneType.EDIT_CORRECTION]: '编辑校正',
      [SceneType.JSON_GENERATION]: 'JSON生成',
      [SceneType.COMPRESSION]: '对话压缩',
      [SceneType.SUB_AGENT]: 'SubAgent子代理',
    };
    
    return displayNames[scene] || scene;
  }

}