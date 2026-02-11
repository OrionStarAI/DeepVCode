import { CommandKind, SlashCommand } from './types.js';
import { t } from '../utils/i18n.js';
import { HistoryItem } from '../types.js';

type HistoryOptions = {
  limit: number;
  type: 'user' | 'assistant' | 'error' | 'all';
  query: string;
};

const parseHistoryArgs = (args: string): HistoryOptions => {
  const tokens = args.split(/\s+/).filter(Boolean);
  let limit = 20;
  let type: HistoryOptions['type'] = 'user';
  const queryParts: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '--limit' && tokens[i + 1]) {
      limit = Number(tokens[i + 1]) || limit;
      i += 1;
      continue;
    }
    if (token.startsWith('--limit=')) {
      const value = token.split('=')[1];
      limit = Number(value) || limit;
      continue;
    }
    if (token === '--type' && tokens[i + 1]) {
      const value = tokens[i + 1] as HistoryOptions['type'];
      type = value;
      i += 1;
      continue;
    }
    if (token.startsWith('--type=')) {
      const value = token.split('=')[1] as HistoryOptions['type'];
      type = value;
      continue;
    }
    queryParts.push(token);
  }

  return {
    limit: Math.max(1, Math.min(200, limit)),
    type,
    query: queryParts.join(' ').trim(),
  };
};

const matchesType = (
  item: HistoryItem,
  type: HistoryOptions['type'],
): boolean => {
  if (type === 'all') {
    return true;
  }
  if (type === 'user') {
    return item.type === 'user' || item.type === 'user_shell';
  }
  if (type === 'assistant') {
    return item.type === 'gemini' || item.type === 'gemini_content';
  }
  return item.type === 'error';
};

const formatHistoryItem = (item: HistoryItem): string => {
  if (item.text && item.text.trim()) {
    return `[${item.type}] ${item.text}`;
  }
  return `[${item.type}] (no text)`;
};

export const historyCommand: SlashCommand = {
  name: 'history',
  description: t('command.history.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const options = parseHistoryArgs(args);
    const history = context.ui.history ?? [];

    if (history.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: t('command.history.empty'),
      };
    }

    const query = options.query.toLowerCase();
    const filtered = history.filter((item) => {
      if (!matchesType(item, options.type)) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (item.text ?? '').toLowerCase().includes(query);
    });

    const latest = filtered.slice(-options.limit).reverse();
    const lines = latest.map((item, index) =>
      `${index + 1}. ${formatHistoryItem(item)}`.trim(),
    );

    if (lines.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: t('command.history.empty'),
      };
    }

    return {
      type: 'message',
      messageType: 'info',
      content: [t('command.history.header'), ...lines].join('\n'),
    };
  },
};
