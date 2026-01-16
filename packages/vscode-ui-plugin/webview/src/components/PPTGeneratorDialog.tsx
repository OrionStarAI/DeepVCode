/**
 * PPT Generator Dialog
 * PPT生成对话框 - 独立的PPT生成界面
 *
 * 简化流程：提交任务后直接打开浏览器编辑页面，无需轮询状态
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ExternalLink, RefreshCw, CheckCircle, Sparkles } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { PPTGeneratorIcon } from './PPTGeneratorIcon';
import { getGlobalMessageService } from '../services/globalMessageService';
import {
  PPTStyle,
  PPTColorScheme,
  PPT_STYLES,
  PPT_COLOR_SCHEMES,
  getCombinedStylePrompt
} from '../types/ppt';
import './PPTGeneratorDialog.css';

interface PPTGeneratorDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type DialogState = 'form' | 'generating' | 'success' | 'error';

export const PPTGeneratorDialog: React.FC<PPTGeneratorDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();

  // 表单状态
  const [topic, setTopic] = useState('');
  const [pageCount, setPageCount] = useState(1);
  const [isCustomPageCount, setIsCustomPageCount] = useState(false);
  const [customPageCount, setCustomPageCount] = useState('');
  const [style, setStyle] = useState<PPTStyle>('auto');
  const [colorScheme, setColorScheme] = useState<PPTColorScheme>('auto');
  const [customStyleText, setCustomStyleText] = useState('');
  const [customColorText, setCustomColorText] = useState('');
  const [outline, setOutline] = useState('');

  // 对话框状态
  const [dialogState, setDialogState] = useState<DialogState>('form');
  const [editUrl, setEditUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGenerationCancelled, setIsGenerationCancelled] = useState(false);

  // Refs
  const topicInputRef = useRef<HTMLInputElement>(null);
  const generationAbortRef = useRef<boolean>(false);

  // 处理ESC键关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dialogState !== 'generating') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, dialogState]);

  // 自动聚焦输入框
  useEffect(() => {
    if (isOpen && topicInputRef.current && dialogState === 'form') {
      setTimeout(() => topicInputRef.current?.focus(), 100);
    }
  }, [isOpen, dialogState]);

  // 开始生成PPT
  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) {
      setErrorMessage(t('pptGenerator.error.topicRequired', {}, 'Please enter a PPT topic'));
      setDialogState('error');
      return;
    }

    if (!outline.trim()) {
      setErrorMessage(t('pptGenerator.error.outlineRequired', {}, 'Please enter the outline content'));
      setDialogState('error');
      return;
    }

    // 自定义风格/色系时检查是否填写了描述
    if (style === 'custom' && !customStyleText.trim()) {
      setErrorMessage(t('pptGenerator.error.customStyleRequired', {}, 'Please enter custom style description'));
      setDialogState('error');
      return;
    }

    if (colorScheme === 'custom' && !customColorText.trim()) {
      setErrorMessage(t('pptGenerator.error.customColorRequired', {}, 'Please enter custom color description'));
      setDialogState('error');
      return;
    }

    // 设置生成中状态
    setDialogState('generating');
    setErrorMessage(null);
    setEditUrl(null);
    generationAbortRef.current = false;
    setIsGenerationCancelled(false);

    try {
      const messageService = getGlobalMessageService();

      // 组合风格和色系提示词
      const combinedStylePrompt = getCombinedStylePrompt(style, customStyleText, colorScheme, customColorText);

      // 发送生成请求
      messageService.sendPPTGenerate({
        topic: topic.trim(),
        pageCount,
        style: combinedStylePrompt,
        outline: outline.trim(),
      });

      // 等待生成响应
      const response = await new Promise<{ success: boolean; taskId?: string; editUrl?: string; error?: string }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Generation request timeout')), 60000);

        const handleGenerateResponse = (data: { success: boolean; taskId?: string; editUrl?: string; error?: string }) => {
          clearTimeout(timeout);
          resolve(data);
        };

        messageService.onPPTGenerateResponse(handleGenerateResponse);
      });

      // 检查是否已被取消
      if (generationAbortRef.current) {
        setDialogState('form');
        return;
      }

      if (response.success && response.editUrl) {
        // 成功 - 自动打开编辑页面
        setEditUrl(response.editUrl);
        setDialogState('success');

        // 自动打开浏览器
        messageService.openExternalUrl(response.editUrl);
      } else {
        // 失败
        setErrorMessage(response.error || t('pptGenerator.error.generateFailed', {}, 'Generation failed'));
        setDialogState('error');
      }

    } catch (error) {
      // 检查是否已被取消
      if (generationAbortRef.current) {
        setDialogState('form');
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error occurred');
      setDialogState('error');
    }
  }, [topic, pageCount, style, colorScheme, customStyleText, customColorText, outline, t]);

  // 打开编辑页面
  const openEditPage = useCallback((url: string) => {
    const messageService = getGlobalMessageService();
    messageService.openExternalUrl(url);
  }, []);

  // 取消生成
  const handleCancelGeneration = useCallback(() => {
    generationAbortRef.current = true;
    setIsGenerationCancelled(true);
    setDialogState('form');
  }, []);

  // 新建生成
  const handleNewGeneration = useCallback(() => {
    setDialogState('form');
    setTopic('');
    setPageCount(1);
    setIsCustomPageCount(false);
    setCustomPageCount('');
    setStyle('auto');
    setColorScheme('auto');
    setCustomStyleText('');
    setCustomColorText('');
    setOutline('');
    setEditUrl(null);
    setErrorMessage(null);
    setTimeout(() => topicInputRef.current?.focus(), 100);
  }, []);

  // AI 优化大纲
  const handleOptimizeOutline = useCallback(async () => {
    if (!outline.trim()) {
      return;
    }

    setIsOptimizing(true);

    try {
      const messageService = getGlobalMessageService();

      // 组合风格和色系描述
      const styleDesc = style === 'custom' ? customStyleText :
        (style === 'auto' ? '默认' : PPT_STYLES.find(s => s.value === style)?.value || style);
      const colorDesc = colorScheme === 'custom' ? customColorText :
        (colorScheme === 'auto' ? '默认' : PPT_COLOR_SCHEMES.find(c => c.value === colorScheme)?.value || colorScheme);

      // 发送优化请求
      messageService.sendPPTOptimizeOutline({
        topic: topic.trim() || '未指定',
        pageCount,
        style: styleDesc,
        colorScheme: colorDesc,
        outline: outline.trim(),
      });

      // 等待优化响应
      const response = await new Promise<{ success: boolean; optimizedOutline?: string; error?: string }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Optimization request timeout')), 120000);

        const handleOptimizeResponse = (data: { success: boolean; optimizedOutline?: string; error?: string }) => {
          clearTimeout(timeout);
          resolve(data);
        };

        messageService.onPPTOptimizeOutlineResponse(handleOptimizeResponse);
      });

      if (response.success && response.optimizedOutline) {
        setOutline(response.optimizedOutline);
      } else {
        console.error('Optimization failed:', response.error);
      }

    } catch (error) {
      console.error('Optimization error:', error);
    } finally {
      setIsOptimizing(false);
    }
  }, [topic, pageCount, style, colorScheme, customStyleText, customColorText, outline]);

  if (!isOpen) return null;

  return (
    <div className="ppt-generator-dialog__backdrop" onClick={dialogState === 'generating' ? handleCancelGeneration : onClose}>
      <div
        className="ppt-generator-dialog__container"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="ppt-generator-dialog__header">
          <div className="ppt-generator-dialog__title">
            <PPTGeneratorIcon size={24} />
            <span>{t('pptGenerator.title', {}, 'PPT 生成器')}</span>
          </div>
          <button
            className="ppt-generator-dialog__close-btn"
            onClick={dialogState === 'generating' ? handleCancelGeneration : onClose}
            title={dialogState === 'generating' ? t('pptGenerator.cancelGeneration', {}, '取消生成') : t('common.close', {}, 'Close')}
          >
            <X size={18} />
          </button>
        </header>

        {/* Body */}
        <div className="ppt-generator-dialog__body">
          {/* 表单状态 */}
          {dialogState === 'form' && (
            <>
              {/* 标题输入 */}
              <div className="ppt-generator-dialog__field">
                <label className="ppt-generator-dialog__label">
                  📝 {t('pptGenerator.topicLabel', {}, 'PPT 标题')}
                </label>
                <input
                  ref={topicInputRef}
                  type="text"
                  className="ppt-generator-dialog__input"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={t('pptGenerator.topicPlaceholder', {}, '请输入 PPT 标题...')}
                />
              </div>

              {/* 页数选择 */}
              <div className="ppt-generator-dialog__params">
                <div className="ppt-generator-dialog__param">
                  <label className="ppt-generator-dialog__label">
                    📄 {t('pptGenerator.pageCountLabel', {}, '页数')}
                  </label>
                  <div className="ppt-generator-dialog__page-count-row">
                    <select
                      className="ppt-generator-dialog__select"
                      value={isCustomPageCount ? 'custom' : pageCount}
                      onChange={(e) => {
                        if (e.target.value === 'custom') {
                          setIsCustomPageCount(true);
                        } else {
                          setIsCustomPageCount(false);
                          setPageCount(Number(e.target.value));
                        }
                      }}
                    >
                      {[1, 2, 3, 5, 8, 10, 12, 15, 20].map(num => (
                        <option key={num} value={num}>{num} {t('pptGenerator.pages', {}, '页')}</option>
                      ))}
                      <option value="custom">{t('pptGenerator.customPages', {}, '自定义')}</option>
                    </select>
                    {isCustomPageCount && (
                      <input
                        type="number"
                        className="ppt-generator-dialog__custom-page-input"
                        value={customPageCount}
                        onChange={(e) => {
                          setCustomPageCount(e.target.value);
                          const num = parseInt(e.target.value, 10);
                          if (num > 0 && num <= 100) {
                            setPageCount(num);
                          }
                        }}
                        placeholder={t('pptGenerator.customPagesPlaceholder', {}, '1-100')}
                        min="1"
                        max="100"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* 风格选择 */}
              <div className="ppt-generator-dialog__field">
                <label className="ppt-generator-dialog__label">
                  {t('pptGenerator.styleLabel', {}, '风格')}
                </label>
                <div className="ppt-generator-dialog__style-options">
                  {PPT_STYLES.map((styleConfig) => (
                    <button
                      key={styleConfig.value}
                      className={`ppt-generator-dialog__style-btn ${style === styleConfig.value ? 'ppt-generator-dialog__style-btn--selected' : ''}`}
                      onClick={() => setStyle(styleConfig.value)}
                      title={t(styleConfig.labelKey, {}, styleConfig.value)}
                    >
                      {t(styleConfig.labelKey, {}, styleConfig.value)}
                    </button>
                  ))}
                </div>
                {/* 自定义风格输入框 */}
                {style === 'custom' && (
                  <input
                    type="text"
                    className="ppt-generator-dialog__custom-input"
                    value={customStyleText}
                    onChange={(e) => setCustomStyleText(e.target.value)}
                    placeholder={t('pptGenerator.customStylePlaceholder', {}, '请描述你想要的PPT风格...')}
                  />
                )}
              </div>

              {/* 色系选择 */}
              <div className="ppt-generator-dialog__field">
                <label className="ppt-generator-dialog__label">
                  {t('pptGenerator.colorSchemeLabel', {}, '色系')}
                </label>
                <div className="ppt-generator-dialog__color-options">
                  {PPT_COLOR_SCHEMES.map((colorConfig) => (
                    <button
                      key={colorConfig.value}
                      className={`ppt-generator-dialog__color-btn ${colorScheme === colorConfig.value ? 'ppt-generator-dialog__color-btn--selected' : ''}`}
                      onClick={() => setColorScheme(colorConfig.value)}
                      title={t(colorConfig.labelKey, {}, colorConfig.value)}
                    >
                      {/* 颜色预览 - 自定义显示文字 */}
                      {colorConfig.colors.length > 0 ? (
                        <div className="ppt-generator-dialog__color-preview">
                          {colorConfig.colors.map((color, index) => (
                            <div
                              key={index}
                              className="ppt-generator-dialog__color-dot"
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="ppt-generator-dialog__color-text-icon">+</div>
                      )}
                      <span className="ppt-generator-dialog__color-label">
                        {t(colorConfig.labelKey, {}, colorConfig.value)}
                      </span>
                    </button>
                  ))}
                </div>
                {/* 自定义色系输入框 */}
                {colorScheme === 'custom' && (
                  <input
                    type="text"
                    className="ppt-generator-dialog__custom-input"
                    value={customColorText}
                    onChange={(e) => setCustomColorText(e.target.value)}
                    placeholder={t('pptGenerator.customColorPlaceholder', {}, '请描述你想要的配色风格...')}
                  />
                )}
              </div>

              {/* 大纲输入 */}
              <div className="ppt-generator-dialog__field">
                <div className="ppt-generator-dialog__label-row">
                  <label className="ppt-generator-dialog__label">
                    📋 {t('pptGenerator.outlineLabel', {}, '大纲内容')}
                    <span className="ppt-generator-dialog__label-required">*</span>
                  </label>
                  <button
                    type="button"
                    className="ppt-generator-dialog__optimize-btn"
                    onClick={handleOptimizeOutline}
                    disabled={isOptimizing || !outline.trim()}
                    title={t('pptGenerator.optimizeTooltip', {}, '使用AI优化大纲内容')}
                  >
                    <Sparkles size={14} />
                    {isOptimizing
                      ? t('pptGenerator.optimizing', {}, '优化中...')
                      : t('pptGenerator.optimizeButton', {}, 'AI 优化')}
                  </button>
                </div>
                <textarea
                  className="ppt-generator-dialog__textarea"
                  value={outline}
                  onChange={(e) => setOutline(e.target.value)}
                  placeholder={t('pptGenerator.outlinePlaceholder', {}, '请输入每页的内容描述...')}
                />
              </div>

              {/* 提示信息 */}
              <p className="ppt-generator-dialog__hint">
                💡 {t('pptGenerator.outlineHint', {}, '提示：详细描述每页PPT的内容，将获得更好的生成效果')}
              </p>
            </>
          )}

          {/* 生成中状态 */}
          {dialogState === 'generating' && (
            <div className="ppt-generator-dialog__generating">
              <div className="ppt-generator-dialog__generating-icon">
                <PPTGeneratorIcon size={80} />
              </div>
              <div className="ppt-generator-dialog__generating-text">
                {t('pptGenerator.generating', {}, '正在提交 PPT 生成任务...')}
              </div>
              <div className="ppt-generator-dialog__generating-hint">
                {t('pptGenerator.generatingHint', {}, '任务提交后将自动打开浏览器查看进度')}
              </div>
            </div>
          )}

          {/* 成功结果 */}
          {dialogState === 'success' && (
            <div className="ppt-generator-dialog__results">
              <div className="ppt-generator-dialog__results-header">
                <CheckCircle size={20} />
                {t('pptGenerator.success.generated', {}, 'PPT 任务已提交！')}
              </div>

              <p className="ppt-generator-dialog__results-hint">
                {t('pptGenerator.success.hint', {}, '已自动打开浏览器，请在网页中查看生成进度和编辑PPT')}
              </p>

              <div className="ppt-generator-dialog__results-actions">
                {editUrl && (
                  <button
                    className="ppt-generator-dialog__action-btn ppt-generator-dialog__action-btn--primary"
                    onClick={() => openEditPage(editUrl)}
                  >
                    <ExternalLink size={16} />
                    {t('pptGenerator.openEdit', {}, '再次打开编辑页面')}
                  </button>
                )}
              </div>

              <button
                className="ppt-generator-dialog__new-btn"
                onClick={handleNewGeneration}
              >
                <RefreshCw size={14} />
                {t('pptGenerator.generateAnother', {}, '再生成一个')}
              </button>
            </div>
          )}

          {/* 错误状态 */}
          {dialogState === 'error' && (
            <div className="ppt-generator-dialog__error">
              <div className="ppt-generator-dialog__error-icon">❌</div>
              <div className="ppt-generator-dialog__error-text">
                {errorMessage}
              </div>
              <button
                className="ppt-generator-dialog__retry-btn"
                onClick={handleNewGeneration}
              >
                {t('pptGenerator.tryAgain', {}, '重试')}
              </button>
            </div>
          )}
        </div>

        {/* Footer - 只在表单状态显示 */}
        {dialogState === 'form' && (
          <footer className="ppt-generator-dialog__footer">
            <button
              className="ppt-generator-dialog__cancel-btn"
              onClick={onClose}
            >
              {t('common.cancel', {}, '取消')}
            </button>
            <button
              className="ppt-generator-dialog__generate-btn"
              onClick={handleGenerate}
              disabled={
                !topic.trim() ||
                !outline.trim() ||
                (isCustomPageCount && (!customPageCount || parseInt(customPageCount, 10) < 1 || parseInt(customPageCount, 10) > 100))
              }
            >
              🚀 {t('pptGenerator.generateButton', {}, '生成 PPT')}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};

export default PPTGeneratorDialog;
