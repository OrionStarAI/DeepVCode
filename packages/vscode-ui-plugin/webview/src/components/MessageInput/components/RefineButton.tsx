/**
 * Refine Button Component - 文本优化按钮
 * 放在输入框右下角，触发 /refine 功能
 */

import React, { useState } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { useTranslation } from '../../../hooks/useTranslation';
import '../styles/RefineButton.css';

interface RefineButtonProps {
  /** 输入框中的当前文本 */
  inputText: string;
  /** 是否禁用按钮 */
  disabled?: boolean;
  /** 是否正在处理中 */
  isLoading?: boolean;
  /** 点击按钮时的回调，触发 /refine 命令 */
  onRefine: (text: string) => void;
}

export function RefineButton({
  inputText,
  disabled = false,
  isLoading = false,
  onRefine,
}: RefineButtonProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  // 判断按钮是否应该启用
  const hasText = inputText.trim().length > 0;
  const isDisabled = disabled || isLoading || !hasText;

  const handleClick = () => {
    if (!isDisabled && inputText.trim()) {
      // 触发 /refine 命令，传入当前输入框的文本
      onRefine(inputText.trim());
    }
  };

  return (
    <button
      className={`refine-button ${isLoading ? 'loading' : ''} ${isHovered && !isDisabled ? 'hovered' : ''}`}
      onClick={handleClick}
      disabled={isDisabled}
      title={
        !hasText
          ? t('command.refine.button.empty_text')
          : t('command.refine.button.tooltip')
      }
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label="Refine text"
    >
      {isLoading ? (
        <Loader2 size={16} className="refine-icon loading-icon" />
      ) : (
        <Wand2 size={16} className="refine-icon" />
      )}
    </button>
  );
}
