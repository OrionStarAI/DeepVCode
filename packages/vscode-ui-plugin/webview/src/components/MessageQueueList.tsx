/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { MessageQueueItem, MessageContent } from '../types';
import { Trash2, GripVertical, X, Edit2 } from 'lucide-react';
import { messageContentToString } from '../utils/messageContentUtils';
import { useTranslation } from '../hooks/useTranslation';

interface MessageQueueListProps {
  queue: MessageQueueItem[];
  onRemove: (id: string) => void;
  onReorder: (newQueue: MessageQueueItem[]) => void;
  onEdit: (item: MessageQueueItem) => void;
}

export const MessageQueueList: React.FC<MessageQueueListProps> = ({ queue, onRemove, onReorder, onEdit }) => {
  const { t } = useTranslation();
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // 设置透明图像以隐藏默认的拖拽重影（可选，这里先不做）
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;

    const newQueue = [...queue];
    const draggedItem = newQueue[draggedItemIndex];
    newQueue.splice(draggedItemIndex, 1);
    newQueue.splice(index, 0, draggedItem);

    onReorder(newQueue);
    setDraggedItemIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedItemIndex(null);
  };

  if (queue.length === 0) return null;

  return (
    <div className="message-queue-list">
      <div className="queue-header">
        <span className="queue-title">{t('chat.queue.title')} ({queue.length})</span>
        <span className="queue-hint">{t('chat.queue.hint')}</span>
      </div>
      <div className="queue-items">
        {queue.map((item, index) => (
          <div
            key={item.id}
            className={`queue-item ${draggedItemIndex === index ? 'dragging' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
          >
            <div className="queue-drag-handle" title={t('chat.queue.drag')}>
              <GripVertical size={14} />
            </div>
            <div className="queue-content" title={messageContentToString(item.content)}>
              {messageContentToString(item.content)}
            </div>
            <div className="queue-actions">
              <button
                className="queue-action-btn edit"
                onClick={() => onEdit(item)}
                title={t('chat.queue.edit')}
              >
                <Edit2 size={14} />
              </button>
              <button
                className="queue-action-btn remove"
                onClick={() => onRemove(item.id)}
                title={t('chat.queue.remove')}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};