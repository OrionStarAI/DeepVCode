/**
 * Custom Rules Management Dialog
 * 自定义规则管理对话框
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  vscode: any;
}

export const RulesManagementDialog: React.FC<RulesManagementDialogProps> = ({
  isOpen,
  onClose,
  vscode
}) => {
  const { t } = useTranslation();
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [selectedRule, setSelectedRule] = useState<CustomRule | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingRule, setEditingRule] = useState<CustomRule | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadRules();
    }

    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'rules_list_response') {
        setRules(message.payload.rules);
      } else if (message.type === 'rules_save_response') {
        if (message.payload.success) {
          loadRules();
          setIsEditing(false);
          setEditingRule(null);
        } else {
          alert(t('rules.saveError') + ': ' + (message.payload.error || 'Unknown error'));
        }
      } else if (message.type === 'rules_delete_response') {
        if (message.payload.success) {
          loadRules();
          setSelectedRule(null);
        } else {
          alert(t('rules.deleteError') + ': ' + (message.payload.error || 'Unknown error'));
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen, t]);

  const loadRules = () => {
    vscode.postMessage({ type: 'rules_list_request', payload: {} });
  };

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
    vscode.postMessage({ type: 'rules_save', payload: { rule: editingRule } });
  };

  const handleDeleteRule = (ruleId: string) => {
    if (confirm(t('rules.confirmDelete'))) {
      vscode.postMessage({ type: 'rules_delete', payload: { ruleId } });
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingRule(null);
  };

  if (!isOpen) return null;

  return (
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
  );
};
