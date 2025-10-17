/**
 * Model Selector Component - 模型选择器组件
 * 提供类似于图片中显示的模型选择下拉菜单
 * 从服务端API获取模型数据，支持缓存和配置持久化
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { webviewModelService } from '../services/webViewModelService';
import './ModelSelector.css';

// 模型信息接口（匹配服务端API）
export interface ModelInfo {
  name: string;
  displayName: string;
  creditsPerRequest: number;
  available: boolean;
  maxToken: number;
  highVolumeThreshold: number;
  highVolumeCredits: number;
}

// 模型类型定义（用于UI显示）
interface ModelOption {
  id: string;
  name: string;
  displayName: string;
  category: 'claude' | 'gemini' | 'kimi' | 'gpt' | 'qwen' | 'grok' | 'auto';
  creditsPerRequest: number | undefined;
  maxToken: number;
  description?: string;
  isAvailable: boolean;
  highVolumeCredits?: number;
  highVolumeThreshold?: number;
}

// 根据模型名称推断类别
const inferCategory = (modelName: string): ModelOption['category'] => {
  if (modelName === 'auto') return 'auto';
  if (modelName.includes('claude')) return 'claude';
  if (modelName.includes('gemini')) return 'gemini';
  if (modelName.includes('kimi')) return 'kimi';
  if (modelName.includes('gpt')) return 'gpt';
  if (modelName.includes('qwen')) return 'qwen';
  if (modelName.includes('grok')) return 'grok';
  return 'gemini'; // 默认
};

// 将ModelInfo转换为ModelOption
const convertToModelOption = (model: ModelInfo, t: any): ModelOption => ({
  id: model.name,
  name: model.name,
  displayName: model.displayName,
  category: inferCategory(model.name),
  creditsPerRequest: model.creditsPerRequest,
  maxToken: model.maxToken,
  description: t(`model.descriptions.${model.name}`, model.displayName),
  isAvailable: model.available,
  highVolumeCredits: model.highVolumeCredits,
  highVolumeThreshold: model.highVolumeThreshold
});

interface ModelSelectorProps {
  selectedModelId?: string;
  onModelChange?: (modelId: string, model: ModelOption) => void;
  disabled?: boolean;
  className?: string;
  sessionId?: string; // 🎯 新增：当前会话ID
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModelId = 'auto',
  onModelChange,
  disabled = false,
  className = '',
  sessionId
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取可用模型列表
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);
        setError(null);

        // 并行获取可用模型和当前模型（传递sessionId）
        const [models, currentModelName] = await Promise.all([
          webviewModelService.getAvailableModels(),
          webviewModelService.getCurrentModel(sessionId)
        ]);

        // 转换为UI所需的ModelOption格式
        const options = models.map(model => convertToModelOption(model, t));
        setModelOptions(options);

        // 设置当前选中模型（优先使用服务端返回的当前模型）
        const selectedModelName = currentModelName || selectedModelId;
        const currentModel = options.find(opt => opt.id === selectedModelName) || options[0];
        if (currentModel) {
          setSelectedModel(currentModel);
        }

      } catch (err) {
        console.error('Failed to fetch models:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');

        // 降级到默认模型
        const fallbackModel: ModelOption = {
          id: 'auto',
          name: 'auto',
          displayName: 'Auto',
          category: 'auto',
          creditsPerRequest: undefined,
          maxToken: 200000,
          isAvailable: true
        };
        setModelOptions([fallbackModel]);
        setSelectedModel(fallbackModel);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, [selectedModelId, t]);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // 处理模型选择
  const handleModelSelect = async (model: ModelOption) => {
    if (!model.isAvailable || disabled) return;

    setSelectedModel(model);
    setIsOpen(false);

    // 保存模型选择到扩展配置（传递sessionId）
    try {
      await webviewModelService.setCurrentModel(model.name, sessionId);
    } catch (err) {
      console.error('Failed to save model selection:', err);
      // 可以在这里显示用户提示
    }

    if (onModelChange) {
      onModelChange(model.id, model);
    }
  };

  // 获取模型类别显示样式和图标
  const getCategoryInfo = (category: string) => {
    switch (category) {
      case 'auto':
        return {
          icon: '🎯',
          color: 'var(--vscode-terminal-ansiGreen)',
          name: 'Auto'
        };
      case 'claude':
        return {
          icon: '🧠',
          color: 'var(--vscode-terminal-ansiMagenta)',
          name: 'Claude'
        };
      case 'gemini':
        return {
          icon: '⭐',
          color: 'var(--vscode-terminal-ansiBlue)',
          name: 'Gemini'
        };
      case 'gpt':
        return {
          icon: '🤖',
          color: 'var(--vscode-terminal-ansiGreen)',
          name: 'GPT'
        };
      case 'kimi':
        return {
          icon: '🌙',
          color: 'var(--vscode-terminal-ansiCyan)',
          name: 'Kimi'
        };
      case 'qwen':
        return {
          icon: '🔷',
          color: 'var(--vscode-terminal-ansiYellow)',
          name: 'Qwen'
        };
      case 'grok':
        return {
          icon: '⚡',
          color: 'var(--vscode-terminal-ansiRed)',
          name: 'Grok'
        };
      default:
        return {
          icon: '🤖',
          color: 'var(--vscode-foreground)',
          name: 'Model'
        };
    }
  };

  // 根据类别分组模型
  const groupedModels = modelOptions.reduce((groups, model) => {
    if (!groups[model.category]) {
      groups[model.category] = [];
    }
    groups[model.category].push(model);
    return groups;
  }, {} as Record<string, ModelOption[]>);

  return (
    <div
      ref={containerRef}
      className={`model-selector ${className} ${disabled ? 'disabled' : ''} ${isOpen ? 'open' : ''}`}
    >
      {/* 触发按钮 */}
      <button
        className="model-selector-trigger"
        onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="selected-model">
          {loading ? (
            <>
              <div className="model-icon">⏳</div>
              <div className="model-info">
                <span className="model-name">{t('model.selector.loading', undefined, 'Loading...')}</span>
              </div>
            </>
          ) : error ? (
            <>
              <div className="model-icon">⚠️</div>
              <div className="model-info">
                <span className="model-name">{t('model.selector.error', undefined, 'Error')}</span>
              </div>
            </>
          ) : selectedModel ? (
            <>
              <div className="model-icon">
                {getCategoryInfo(selectedModel.category).icon}
              </div>
              <div className="model-info">
                <span className="model-name">{selectedModel.displayName}</span>
                <span
                  className="model-credits"
                  style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '10px' }}
                >
                  {selectedModel.creditsPerRequest} credits
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="model-icon">🤖</div>
              <div className="model-info">
                <span className="model-name">{t('model.selector.noModel', undefined, 'No Model')}</span>
              </div>
            </>
          )}
        </div>
        <ChevronDown
          size={16}
          className={`chevron ${isOpen ? 'rotated' : ''}`}
        />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div ref={dropdownRef} className="model-dropdown">
          <div className="dropdown-header">
            <span className="dropdown-title">{t('model.selector.selectModel')}</span>
          </div>

          <div className="model-list">
            {Object.entries(groupedModels).map(([category, models]) => (
              <div key={category} className="model-group">
                {models.map((model) => (
                  <div
                    key={model.id}
                    className={`model-option ${selectedModel?.id === model.id ? 'selected' : ''} ${!model.isAvailable ? 'disabled' : ''}`}
                    onClick={() => handleModelSelect(model)}
                    role="option"
                    aria-selected={selectedModel?.id === model.id}
                  >
                    <div className="model-option-content">
                      <div className="model-icon">
                        {getCategoryInfo(model.category).icon}
                      </div>
                      <div className="model-details">
                        <div className="model-main">
                          <span className="model-name">{model.displayName}</span>
                          <span
                            className="model-credits"
                            style={{
                              color: 'var(--vscode-descriptionForeground)',
                              opacity: 0.8,
                              fontSize: '11px',
                              fontWeight: '400'
                            }}
                          >
                            {model.creditsPerRequest} credits
                          </span>
                        </div>
                      </div>
                    </div>
                    {selectedModel?.id === model.id && (
                      <div className="check-icon">
                        <Check size={16} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};