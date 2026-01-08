/**
 * 斜杠命令选择菜单组件
 * / 符号自动完成时显示的命令选择菜单
 */

import React from 'react';
import { SlashCommandOption } from '../../../services/slashCommandHandler';
import { useTranslation } from '../../../hooks/useTranslation';

interface SlashCommandMenuProps {
  anchorElementRef: React.RefObject<HTMLElement>;
  options: SlashCommandOption[];
  selectedIndex: number | null;
  onSelectOption: (option: SlashCommandOption) => void;
  onClose: () => void;
}

/**
 * 🎯 斜杠命令菜单组件
 */
export function SlashCommandMenu({
  anchorElementRef,
  options,
  selectedIndex,
  onSelectOption,
  onClose,
}: SlashCommandMenuProps) {
  const { t } = useTranslation();

  if (!options.length) return null;

  return (
    <div className="slash-command-menu">
      <div className="slash-command-menu-header">
        {t('slashCommand.selectCommand', undefined, 'Select command:')}
      </div>
      {options.map((option, index) => (
        <div
          key={option.name}
          className={`slash-command-menu-item ${selectedIndex === index ? 'selected' : ''}`}
          onClick={() => onSelectOption(option)}
        >
          <span className="slash-command-icon">
            {option.kind === 'file' ? '📝' : '⚡'}
          </span>
          <div className="slash-command-info">
            <div className="slash-command-name">/{option.name}</div>
            <div className="slash-command-description">{option.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
