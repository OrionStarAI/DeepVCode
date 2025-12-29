import open from 'open';
import { CommandKind, SlashCommand, SlashCommandActionReturn, CommandContext } from './types.js';

export const hooksCommand: SlashCommand = {
  name: 'hooks',
  description: 'Open hooks documentation',
  kind: CommandKind.BUILT_IN,
  action: async (_context: CommandContext, _args: string): Promise<SlashCommandActionReturn> => {
    try {
      await open('https://dvcode.deepvlab.ai/hooks-help');
      return {
        type: 'message',
        messageType: 'info',
        content: 'Opening hooks documentation in your browser...',
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to open URL: ${error}`,
      };
    }
  },
};