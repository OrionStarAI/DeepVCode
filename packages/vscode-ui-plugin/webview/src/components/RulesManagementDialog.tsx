/**
 * Custom Rules Management Dialog
 * 自定义规则管理对话框
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { getGlobalMessageService } from '../services/globalMessageService';
import './RulesManagementDialog.css';

interface CustomRule {
  id: string;
  frontmatter: {
    title?: string;
    type: 'always_apply' | 'manual_apply' | 'context_aware';
    priority?: 'low' | 'medium' | 'high';
    description?: string;
    enabled?: boolean;
    tags?: string[];
    triggers?: {
      fileExtensions?: string[];
      pathPatterns?: string[];
      languages?: string[];
    };
  };
  content: string;
  filePath?: string;
  isBuiltIn?: boolean;
}

interface RulesManagementDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesManagementDialog: React.FC<RulesManagementDialogProps> = ({
  isOpen,
  onClose
}) => {
  const { t } = useTranslation();
  const messageService = getGlobalMessageService();
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [selectedRule, setSelectedRule] = useState<CustomRule | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomRule | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; ruleId: string | null }>({
    show: false,
    ruleId: null
  });

  // 使用 useCallback 包装函数，避免闭包问题
  const loadRules = useCallback(() => {
    messageService.requestRulesList();
  }, [messageService]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditingRule(null);
  }, []);

  const handleCancelDelete = useCallback(() => {
    console.log('[RulesManagement] User cancelled deletion');
    setDeleteConfirm({ show: false, ruleId: null });
  }, []);

  // 🎯 处理 ESC 键关闭 - 独立 useEffect，只依赖必要的状态
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 只处理当前对话框打开时的 ESC 键
      if (e.key === 'Escape') {
        e.stopPropagation(); // 防止事件冒泡到其他对话框
        if (isEditing) {
          handleCancelEdit();
        } else if (deleteConfirm.show) {
          handleCancelDelete();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isEditing, deleteConfirm.show, handleCancelEdit, handleCancelDelete, onClose]);

  // 注册消息处理器 - 独立 useEffect
  useEffect(() => {
    if (!isOpen) return;

    loadRules();

    const unsubscribeList = messageService.onRulesListResponse((data) => {
      setRules(data.rules);
    });

    const unsubscribeSave = messageService.onRulesSaveResponse((data) => {
      if (data.success) {
        // 使用 setTimeout 延迟刷新，避免与文件监听器冲突导致重复
        setTimeout(() => {
          loadRules();
        }, 100);
        setIsEditing(false);
        setEditingRule(null);
      } else {
        alert(t('rules.saveError') + ': ' + (data.error || 'Unknown error'));
      }
    });

    const unsubscribeDelete = messageService.onRulesDeleteResponse((data) => {
      if (data.success) {
        // 使用 setTimeout 延迟刷新，避免与文件监听器冲突导致重复
        setTimeout(() => {
          loadRules();
        }, 100);
        setSelectedRule(null);
      } else {
        alert(t('rules.deleteError') + ': ' + (data.error || 'Unknown error'));
      }
    });

    return () => {
      unsubscribeList();
      unsubscribeSave();
      unsubscribeDelete();
    };
  }, [isOpen, t, messageService, loadRules]);

  const handleNewRule = () => {
    const newRule: CustomRule = {
      id: `rule_${Date.now()}`,
      frontmatter: {
        title: t('rules.newRuleTitle'),
        type: 'manual_apply',
        priority: 'medium',
        enabled: true,
        tags: []
      },
      content: t('rules.newRuleContent')
    };
    setEditingRule(newRule);
    setIsEditing(true);
  };

  const handleEditRule = (rule: CustomRule) => {
    setEditingRule({ ...rule });
    setIsEditing(true);
  };

  const handleSaveRule = () => {
    if (!editingRule) return;
    console.log('[RulesManagement] Saving rule:', editingRule.id);
    messageService.saveRule(editingRule);
  };

  const handleDeleteRule = (ruleId: string) => {
    console.log('[RulesManagement] Delete button clicked, ruleId:', ruleId);
    setDeleteConfirm({ show: true, ruleId });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm.ruleId) {
      console.log('[RulesManagement] Calling messageService.deleteRule...');
      try {
        messageService.deleteRule(deleteConfirm.ruleId);
        console.log('[RulesManagement] deleteRule called successfully');
      } catch (error) {
        console.error('[RulesManagement] Error calling deleteRule:', error);
      }
    }
    setDeleteConfirm({ show: false, ruleId: null });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="rules-dialog-overlay" onClick={onClose}>
        <div className="rules-dialog-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="rules-dialog-header">
          <h2>{t('rules.title')}</h2>
          <button className="close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="rules-dialog-content">
          {isEditing && editingRule ? (
            // Edit View
            <div className="rules-edit-view">
              <div className="rules-edit-section">
                <label>{t('rules.ruleTitle')}</label>
                <input
                  type="text"
                  value={editingRule.frontmatter.title || ''}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      frontmatter: { ...editingRule.frontmatter, title: e.target.value }
                    })
                  }
                />
              </div>

              <div className="rules-edit-section">
                <label>{t('rules.ruleType')}</label>
                <select
                  value={editingRule.frontmatter.type}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      frontmatter: {
                        ...editingRule.frontmatter,
                        type: e.target.value as any
                      }
                    })
                  }
                >
                  <option value="always_apply">{t('rules.typeAlwaysApply')}</option>
                  <option value="manual_apply">{t('rules.typeManualApply')}</option>
                  <option value="context_aware">{t('rules.typeContextAware')}</option>
                </select>
              </div>

              <div className="rules-edit-section">
                <label>{t('rules.rulePriority')}</label>
                <select
                  value={editingRule.frontmatter.priority || 'medium'}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      frontmatter: {
                        ...editingRule.frontmatter,
                        priority: e.target.value as any
                      }
                    })
                  }
                >
                  <option value="low">{t('rules.priorityLow')}</option>
                  <option value="medium">{t('rules.priorityMedium')}</option>
                  <option value="high">{t('rules.priorityHigh')}</option>
                </select>
              </div>

              <div className="rules-edit-section">
                <label>{t('rules.ruleDescription')}</label>
                <input
                  type="text"
                  value={editingRule.frontmatter.description || ''}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      frontmatter: {
                        ...editingRule.frontmatter,
                        description: e.target.value
                      }
                    })
                  }
                  placeholder={t('rules.descriptionPlaceholder')}
                />
              </div>

              {editingRule.frontmatter.type === 'context_aware' && (
                <>
                  <div className="rules-edit-section">
                    <label>{t('rules.fileExtensions')}</label>
                    <input
                      type="text"
                      value={editingRule.frontmatter.triggers?.fileExtensions?.join(', ') || ''}
                      onChange={(e) =>
                        setEditingRule({
                          ...editingRule,
                          frontmatter: {
                            ...editingRule.frontmatter,
                            triggers: {
                              ...editingRule.frontmatter.triggers,
                              fileExtensions: e.target.value.split(',').map((s) => s.trim())
                            }
                          }
                        })
                      }
                      placeholder=".ts, .tsx, .js"
                    />
                  </div>

                  <div className="rules-edit-section">
                    <label>{t('rules.pathPatterns')}</label>
                    <input
                      type="text"
                      value={editingRule.frontmatter.triggers?.pathPatterns?.join(', ') || ''}
                      onChange={(e) =>
                        setEditingRule({
                          ...editingRule,
                          frontmatter: {
                            ...editingRule.frontmatter,
                            triggers: {
                              ...editingRule.frontmatter.triggers,
                              pathPatterns: e.target.value.split(',').map((s) => s.trim())
                            }
                          }
                        })
                      }
                      placeholder="src/components/**, tests/**"
                    />
                  </div>

                  <div className="rules-edit-section">
                    <label>{t('rules.languages')}</label>
                    <input
                      type="text"
                      value={editingRule.frontmatter.triggers?.languages?.join(', ') || ''}
                      onChange={(e) =>
                        setEditingRule({
                          ...editingRule,
                          frontmatter: {
                            ...editingRule.frontmatter,
                            triggers: {
                              ...editingRule.frontmatter.triggers,
                              languages: e.target.value.split(',').map((s) => s.trim())
                            }
                          }
                        })
                      }
                      placeholder="typescript, javascript, python"
                    />
                  </div>
                </>
              )}

              <div className="rules-edit-section">
                <label>{t('rules.ruleContent')}</label>
                <textarea
                  value={editingRule.content}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, content: e.target.value })
                  }
                  rows={12}
                  placeholder={t('rules.contentPlaceholder')}
                />
              </div>

              <div className="rules-edit-actions">
                <button className="button-primary" onClick={handleSaveRule}>
                  {t('common.save')}
                </button>
                <button className="button-secondary" onClick={handleCancelEdit}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            // List View
            <div className="rules-list-view">
              <div className="rules-list-header">
                <button className="button-primary" onClick={handleNewRule}>
                  + {t('rules.newRule')}
                </button>
              </div>

              <div className="rules-list">
                {rules.length === 0 ? (
                  <div className="rules-empty-state">
                    <p>{t('rules.noRules')}</p>
                    <p className="rules-hint">{t('rules.createHint')}</p>
                  </div>
                ) : (
                  rules.map((rule) => (
                    <div
                      key={rule.id}
                      className={`rules-list-item ${selectedRule?.id === rule.id ? 'selected' : ''}`}
                      onClick={() => setSelectedRule(rule)}
                    >
                      <div className="rules-item-header">
                        <h3>{rule.frontmatter.title || 'Untitled Rule'}</h3>
                        <div className="rules-item-badges">
                          <span className={`badge badge-${rule.frontmatter.type}`}>
                            {t(`rules.type${rule.frontmatter.type.charAt(0).toUpperCase() + rule.frontmatter.type.slice(1).replace(/_/g, '')}`)}
                          </span>
                          <span className={`badge badge-priority-${rule.frontmatter.priority}`}>
                            {t(`rules.priority${rule.frontmatter.priority?.charAt(0).toUpperCase()}${rule.frontmatter.priority?.slice(1)}`)}
                          </span>
                          {!rule.frontmatter.enabled && (
                            <span className="badge badge-disabled">{t('rules.disabled')}</span>
                          )}
                        </div>
                      </div>
                      {rule.frontmatter.description && (
                        <p className="rules-item-description">{rule.frontmatter.description}</p>
                      )}
                      <div className="rules-item-actions">
                        <button
                          className="button-small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditRule(rule);
                          }}
                        >
                          {t('common.edit')}
                        </button>
                        {!rule.isBuiltIn && (
                          <button
                            className="button-small button-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRule(rule.id);
                            }}
                          >
                            {t('common.delete')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="rules-dialog-footer">
          <p className="rules-info-text">{t('rules.infoText')}</p>
        </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm.show && (
        <div className="rules-dialog-overlay" style={{ zIndex: 10001 }}>
          <div className="rules-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="rules-confirm-header">
              <h3>{t('rules.confirmDeleteTitle')}</h3>
            </div>
            <div className="rules-confirm-content">
              <p>{t('rules.confirmDelete')}</p>
            </div>
            <div className="rules-confirm-actions">
              <button className="button-danger" onClick={handleConfirmDelete}>
                {t('common.delete')}
              </button>
              <button className="button-secondary" onClick={handleCancelDelete}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
