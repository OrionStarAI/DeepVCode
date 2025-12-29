/**
 * Model Selector Component - 模型选择器组件
 * 提供类似于图片中显示的模型选择下拉菜单
 * 从服务端API获取模型数据，支持缓存和配置持久化
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Loader2, BarChart2 } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { webviewModelService } from '../services/webViewModelService';
import { getGlobalMessageService } from '../services/globalMessageService';
import { getProviderIcon } from './ModelProviderIcons';
import { SessionStatisticsDialog } from './SessionStatisticsDialog';
import { ChatMessage } from '../types';
import './ModelSelector.css';
import './ModelProviderIcons.css';

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
  category: 'claude' | 'gemini' | 'kimi' | 'gpt' | 'qwen' | 'grok' | 'auto' | 'minimax';
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
  if (modelName.includes('minimax')) return 'minimax';
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
  isSwitchingFromParent?: boolean; // 🎯 新增：从父组件传入的切换状态
  messages?: ChatMessage[]; // 🎯 新增：用于统计
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModelId = 'auto',
  onModelChange,
  disabled = false,
  className = '',
  sessionId,
  isSwitchingFromParent = false,
  messages = []
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false); // 🎯 统计对话框状态
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedModel, setSelectedModel] = useState<ModelOption | null>(null);
  const [isSwitchingLocal, setIsSwitchingLocal] = useState(false); // 🎯 本地切换状态

  // 🎯 最终切换状态：本地或父组件
  const isSwitching = isSwitchingLocal || isSwitchingFromParent;

  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 🎯 Tooltip 状态管理
  const [showTooltip, setShowTooltip] = useState<{ [key: string]: boolean }>({});
  const [tooltipPosition, setTooltipPosition] = useState<{ [key: string]: { top: number; left: number } }>({});
  const modelNameRefs = useRef<{ [key: string]: HTMLSpanElement | null }>({});
  const debounceTimerRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  // 获取可用模型列表（带指数退避重试）
  useEffect(() => {
    const MAX_RETRIES = 3;
    const BASE_DELAY = 500; // 500ms, 1000ms, 2000ms

    const fetchModelsWithRetry = async (retryCount = 0): Promise<void> => {
      try {
        if (retryCount === 0) {
          setLoading(true);
          setError(null);
        }

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

        setLoading(false);
      } catch (err) {
        console.error(`Failed to fetch models (attempt ${retryCount + 1}/${MAX_RETRIES}):`, err);

        // 🎯 指数退避重试
        if (retryCount < MAX_RETRIES - 1) {
          const delay = BASE_DELAY * Math.pow(2, retryCount);
          console.log(`[ModelSelector] Retrying in ${delay}ms...`);
          setTimeout(() => {
            fetchModelsWithRetry(retryCount + 1);
          }, delay);
          return;
        }

        // 所有重试都失败了，显示错误并降级到默认模型
        console.error('[ModelSelector] All retries failed, using fallback model');
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
        setLoading(false);
      }
    };

    fetchModelsWithRetry();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, t]); // 🎯 移除 selectedModelId 依赖，避免循环获取

  // 🎯 响应外部 selectedModelId 变化（如压缩后模型切换）
  useEffect(() => {
    // 🎯 如果正在手动切换中，忽略外部属性同步，避免被旧属性值冲掉状态
    if (isSwitchingLocal) return;

    if (selectedModelId && modelOptions.length > 0) {
      const newModel = modelOptions.find(opt => opt.id === selectedModelId);
      if (newModel && newModel.id !== selectedModel?.id) {
        console.log('📊 [ModelSelector] Updating selectedModel from prop:', selectedModelId);
        setSelectedModel(newModel);
      }
    }
  }, [selectedModelId, modelOptions, selectedModel?.id, isSwitchingLocal]);

  // 🎯 监听模型切换完成消息
  useEffect(() => {
    const messageService = getGlobalMessageService();
    const cleanup = messageService.onExtensionMessage('model_switch_complete', () => {
      console.log('📊 [ModelSelector] Received model_switch_complete, clearing isSwitchingLocal');
      setIsSwitchingLocal(false);
    });

    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, []);

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
    if (!model.isAvailable || disabled || isSwitching) return;

    setIsSwitchingLocal(true); // 🎯 开始切换
    setSelectedModel(model);
    setIsOpen(false);

    // 🎯 增加安全超时保护，防止界面永久卡死
    const safetyTimeout = setTimeout(() => {
      setIsSwitchingLocal(current => {
        if (current) {
          console.warn('⚠️ [ModelSelector] Switch timeout safety triggered');
          return false;
        }
        return current;
      });
    }, 10000);

    // 保存模型选择到扩展配置（传递sessionId）
    let success = false;
    try {
      await webviewModelService.setCurrentModel(model.name, sessionId);
      // 🎯 成功后立即清除状态
      setIsSwitchingLocal(false);
      clearTimeout(safetyTimeout);
      success = true;
    } catch (err) {
      console.error('Failed to save model selection:', err);
      setIsSwitchingLocal(false); // 失败时恢复
      clearTimeout(safetyTimeout);
      success = false;
    }

    // 🎯 只有成功才调用 onModelChange 回调，避免失败时重复尝试
    if (success && onModelChange) {
      onModelChange(model.id, model);
    }
  };

  // 获取模型类别显示样式和图标
  const getCategoryInfo = (category: string) => {
    switch (category) {
      case 'auto':
        return {
          icon: getProviderIcon('auto', 16),
          color: 'var(--vscode-terminal-ansiGreen)',
          name: 'Auto'
        };
      case 'claude':
        return {
          icon: getProviderIcon('claude', 16),
          color: 'var(--vscode-terminal-ansiMagenta)',
          name: 'Claude'
        };
      case 'gemini':
        return {
          icon: getProviderIcon('gemini', 16),
          color: 'var(--vscode-terminal-ansiBlue)',
          name: 'Gemini'
        };
      case 'gpt':
        return {
          icon: getProviderIcon('gpt', 16),
          color: 'var(--vscode-terminal-ansiGreen)',
          name: 'GPT'
        };
      case 'kimi':
        return {
          icon: getProviderIcon('kimi', 16),
          color: 'var(--vscode-terminal-ansiCyan)',
          name: 'Kimi'
        };
      case 'qwen':
        return {
          icon: getProviderIcon('qwen', 16),
          color: 'var(--vscode-terminal-ansiYellow)',
          name: 'Qwen'
        };
      case 'grok':
        return {
          icon: getProviderIcon('grok', 16),
          color: 'var(--vscode-terminal-ansiRed)',
          name: 'Grok'
        };
      case 'minimax':
        return {
          icon: getProviderIcon('minimax', 16),
          color: 'var(--vscode-terminal-ansiMagenta)',
          name: 'Minimax'
        };
      default:
        return {
          icon: getProviderIcon('default', 16),
          color: 'var(--vscode-foreground)',
          name: 'Model'
        };
    }
  };

  // 🎯 检测文本是否被截断（增强跨平台兼容性）
  // 注意：由于 CSS text-overflow: ellipsis 的特性，这个函数可能检测不准确
  // 目前已改为直接显示 tooltip，不依赖此检测
  const isTextTruncated = (element: HTMLElement | null): boolean => {
    if (!element) return false;

    // 🎯 Windows 兼容性：考虑亚像素渲染和 DPI 缩放
    // 在高 DPI 屏幕上，scrollWidth 和 clientWidth 可能有微小差异
    const threshold = 2; // 容差阈值，考虑亚像素渲染
    const scrollWidth = Math.ceil(element.scrollWidth);
    const clientWidth = Math.floor(element.clientWidth);

    return scrollWidth > clientWidth + threshold;
  };

  // 🎯 获取设备像素比率（Windows DPI 缩放支持）
  const getDevicePixelRatio = (): number => {
    return window.devicePixelRatio || 1;
  };

  // 🎯 获取滚动条宽度（Windows 和 Mac 滚动条处理不同）
  const getScrollbarWidth = (): number => {
    // 创建一个临时的div来测量滚动条宽度
    const outer = document.createElement('div');
    outer.style.visibility = 'hidden';
    outer.style.overflow = 'scroll';
    outer.style.width = '100px';
    outer.style.position = 'absolute';
    outer.style.top = '-9999px';
    document.body.appendChild(outer);

    const inner = document.createElement('div');
    inner.style.width = '100%';
    outer.appendChild(inner);

    const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;
    document.body.removeChild(outer);

    return scrollbarWidth;
  };

  // 🎯 处理鼠标悬停 - 显示 tooltip（增强跨平台兼容性）
  const handleMouseEnter = (modelId: string) => {
    // 清除之前的防抖定时器
    if (debounceTimerRef.current[modelId]) {
      clearTimeout(debounceTimerRef.current[modelId]);
    }

    // 🎯 防抖处理：延迟 150ms 显示 tooltip，避免快速滑过时闪烁
    debounceTimerRef.current[modelId] = setTimeout(() => {
      const element = modelNameRefs.current[modelId];

      // 🎯 简化逻辑：直接显示 tooltip，不检测是否截断
      // 这样可以避免 CSS text-overflow 导致的检测不准确问题
      if (!element) return;

      // 🎯 Windows DPI 缩放支持：获取实际的设备像素比率
      const dpr = getDevicePixelRatio();
      const scrollbarWidth = getScrollbarWidth();

      // 计算tooltip的位置
      const rect = element.getBoundingClientRect();

      // 🎯 考虑 DPI 缩放的位置计算
      let tooltipTop = rect.top - 40; // tooltip高度 + 间距
      let tooltipLeft = rect.left + rect.width / 2 + 20; // 🎯 往右偏移20px

      // 🎯 边界检测：确保tooltip不会超出视口（考虑滚动条宽度）
      const viewportWidth = window.innerWidth - scrollbarWidth;
      const viewportHeight = window.innerHeight;
      const tooltipPadding = 10; // 离边界的最小距离
      const estimatedTooltipWidth = 250; // 预估 tooltip 最大宽度

      // 防止tooltip超出顶部
      if (tooltipTop < tooltipPadding) {
        tooltipTop = rect.bottom + 8; // 显示在元素下方
      }

      // 🎯 防止tooltip超出右边界（考虑 Windows 滚动条）
      if (tooltipLeft + estimatedTooltipWidth / 2 > viewportWidth - tooltipPadding) {
        tooltipLeft = viewportWidth - estimatedTooltipWidth / 2 - tooltipPadding;
      }

      // 🎯 防止tooltip超出左边界
      if (tooltipLeft - estimatedTooltipWidth / 2 < tooltipPadding) {
        tooltipLeft = estimatedTooltipWidth / 2 + tooltipPadding;
      }

      // 🎯 Windows 高DPI适配：确保像素对齐，避免模糊
      tooltipTop = Math.round(tooltipTop * dpr) / dpr;
      tooltipLeft = Math.round(tooltipLeft * dpr) / dpr;

      setTooltipPosition(prev => ({
        ...prev,
        [modelId]: { top: tooltipTop, left: tooltipLeft }
      }));
      setShowTooltip(prev => ({ ...prev, [modelId]: true }));
    }, 150); // 150ms 防抖延迟
  };

  // 🎯 处理鼠标离开 - 隐藏 tooltip（清理防抖定时器）
  const handleMouseLeave = (modelId: string) => {
    // 🎯 清除防抖定时器，避免内存泄漏
    if (debounceTimerRef.current[modelId]) {
      clearTimeout(debounceTimerRef.current[modelId]);
      delete debounceTimerRef.current[modelId];
    }
    setShowTooltip(prev => ({ ...prev, [modelId]: false }));
  };

  // 🎯 监听滚动和窗口大小变化，及时隐藏tooltip（增加防抖优化）
  useEffect(() => {
    let scrollTimer: NodeJS.Timeout | null = null;
    let resizeTimer: NodeJS.Timeout | null = null;

    // 🎯 滚动事件防抖处理（Windows 滚动事件触发频率可能不同）
    const handleScroll = () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        setShowTooltip({});
        // 清除所有防抖定时器
        Object.keys(debounceTimerRef.current).forEach(key => {
          if (debounceTimerRef.current[key]) {
            clearTimeout(debounceTimerRef.current[key]);
          }
        });
        debounceTimerRef.current = {};
      }, 50);
    };

    // 🎯 窗口大小变化防抖处理
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setShowTooltip({});
        // 清除所有防抖定时器
        Object.keys(debounceTimerRef.current).forEach(key => {
          if (debounceTimerRef.current[key]) {
            clearTimeout(debounceTimerRef.current[key]);
          }
        });
        debounceTimerRef.current = {};
      }, 100);
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      // 清理定时器
      if (scrollTimer) clearTimeout(scrollTimer);
      if (resizeTimer) clearTimeout(resizeTimer);
      // 清除所有防抖定时器
      Object.values(debounceTimerRef.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  // 🎯 当下拉菜单关闭时，清除所有tooltip和防抖定时器
  useEffect(() => {
    if (!isOpen) {
      setShowTooltip({});
      // 清除所有防抖定时器
      Object.values(debounceTimerRef.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
      debounceTimerRef.current = {};
    }
  }, [isOpen]);

  // 根据类别分组模型
  const groupedModels = useMemo(() => {
    const groups = modelOptions.reduce((groups, model) => {
      if (!groups[model.category]) {
        groups[model.category] = [];
      }
      groups[model.category].push(model);
      return groups;
    }, {} as Record<string, ModelOption[]>);

    // 每组内按显示名称字母排序
    Object.keys(groups).forEach(category => {
      groups[category].sort((a, b) => a.displayName.localeCompare(b.displayName));
    });

    return groups;
  }, [modelOptions]);

  // 🎯 构建模型 ID 到显示名称的映射
  const modelNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    modelOptions.forEach(opt => {
      map[opt.id] = opt.displayName;
    });
    return map;
  }, [modelOptions]);

  return (
    <div
      ref={containerRef}
      className={`model-selector-wrapper ${className}`}
    >
      <div
        className={`model-selector ${disabled || isSwitching ? 'disabled' : ''} ${isOpen ? 'open' : ''}`}
      >
        {/* 触发按钮 */}
        <button
          className="model-selector-trigger"
          onClick={() => !disabled && !loading && !isSwitching && setIsOpen(!isOpen)}
          disabled={disabled || loading || isSwitching}
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
            ) : isSwitching ? (
              <>
                <div className="model-icon">
                  <Loader2 size={16} className="spinning" />
                </div>
                <div className="model-info">
                  <span className="model-name">{t('model.selector.switching', undefined, 'Switching...')}</span>
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
                  <div
                    className="model-name-wrapper"
                    onMouseEnter={() => handleMouseEnter(`selected-${selectedModel.id}`)}
                    onMouseLeave={() => handleMouseLeave(`selected-${selectedModel.id}`)}
                  >
                    <span
                      className="model-name"
                      ref={el => modelNameRefs.current[`selected-${selectedModel.id}`] = el}
                    >
                      {selectedModel.displayName}
                    </span>
                    {showTooltip[`selected-${selectedModel.id}`] && tooltipPosition[`selected-${selectedModel.id}`] && (
                      <div
                        className="model-name-tooltip"
                        style={{
                          top: `${tooltipPosition[`selected-${selectedModel.id}`].top}px`,
                          left: `${tooltipPosition[`selected-${selectedModel.id}`].left}px`,
                          transform: 'translateX(-50%)'
                        }}
                      >
                        {selectedModel.displayName}
                      </div>
                    )}
                  </div>
                  {selectedModel.category !== 'auto' && selectedModel.creditsPerRequest !== undefined && (
                    <span className="model-credits">
                      {selectedModel.creditsPerRequest}x
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="model-icon">{getProviderIcon('default', 16)}</div>
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
              {Object.entries(groupedModels)
                .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
                .map(([category, models]) => (
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
                            <div
                              className="model-name-wrapper"
                              onMouseEnter={() => handleMouseEnter(`option-${model.id}`)}
                              onMouseLeave={() => handleMouseLeave(`option-${model.id}`)}
                            >
                              <span
                                className="model-name"
                                ref={el => modelNameRefs.current[`option-${model.id}`] = el}
                              >
                                {model.displayName}
                              </span>
                              {showTooltip[`option-${model.id}`] && tooltipPosition[`option-${model.id}`] && (
                                <div
                                  className="model-name-tooltip"
                                  style={{
                                    top: `${tooltipPosition[`option-${model.id}`].top}px`,
                                    left: `${tooltipPosition[`option-${model.id}`].left}px`,
                                    transform: 'translateX(-50%)'
                                  }}
                                >
                                  {model.displayName}
                                </div>
                              )}
                            </div>
                            {model.category !== 'auto' && model.creditsPerRequest !== undefined && (
                              <span className="model-credits">
                                {model.creditsPerRequest}x
                              </span>
                            )}
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

      {/* 🎯 新增：统计按钮 */}
      {!loading && !error && (
        <button
          className="model-stats-trigger"
          onClick={(e) => {
            e.stopPropagation();
            setIsStatsOpen(true);
          }}
          title={t('stats.title')}
        >
          <BarChart2 size={14} />
        </button>
      )}

      {/* 🎯 新增：统计对话框 */}
      <SessionStatisticsDialog
        isOpen={isStatsOpen}
        onClose={() => setIsStatsOpen(false)}
        messages={messages}
        modelNameMap={modelNameMap}
      />
    </div>
  );
};
