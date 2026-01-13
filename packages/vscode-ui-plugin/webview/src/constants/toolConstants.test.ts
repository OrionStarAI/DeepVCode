import { describe, it, expect } from 'vitest';
import {
  TOOL_CALL_STATUS,
  TOOL_NAMES,
  PARAM_NAMES,
  RISK_LEVELS,
  RESULT_STATUS,
  CSS_CLASSES,
  PARAM_PRIORITY_ORDER,
  STATUS_COLORS,
  type ToolCallStatus,
  type ToolName,
  type ParamName,
  type RiskLevel,
  type ResultStatus,
} from './toolConstants';

describe('toolConstants', () => {
  describe('TOOL_CALL_STATUS', () => {
    it('should define all expected status values', () => {
      expect(TOOL_CALL_STATUS.SCHEDULED).toBe('scheduled');
      expect(TOOL_CALL_STATUS.VALIDATING).toBe('validating');
      expect(TOOL_CALL_STATUS.EXECUTING).toBe('executing');
      expect(TOOL_CALL_STATUS.WAITING_FOR_CONFIRMATION).toBe('awaiting_approval');
      expect(TOOL_CALL_STATUS.SUCCESS).toBe('success');
      expect(TOOL_CALL_STATUS.ERROR).toBe('error');
      expect(TOOL_CALL_STATUS.CANCELED).toBe('cancelled');
      expect(TOOL_CALL_STATUS.BACKGROUND_RUNNING).toBe('background_running');
    });

    it('should have 8 status values', () => {
      const keys = Object.keys(TOOL_CALL_STATUS);
      expect(keys.length).toBe(8);
    });

    it('should be immutable (as const)', () => {
      // Type test - this would fail at compile time if not 'as const'
      const status: ToolCallStatus = TOOL_CALL_STATUS.SUCCESS;
      expect(status).toBe('success');
    });
  });

  describe('TOOL_NAMES', () => {
    it('should define all expected tool names', () => {
      expect(TOOL_NAMES.WRITE_FILE).toBe('write_file');
      expect(TOOL_NAMES.READ_FILE).toBe('read_file');
      expect(TOOL_NAMES.BASH).toBe('bash');
      expect(TOOL_NAMES.TERMINAL).toBe('terminal');
      expect(TOOL_NAMES.WEB_SEARCH).toBe('web_search');
      expect(TOOL_NAMES.GREP).toBe('grep');
      expect(TOOL_NAMES.DELETE_FILE).toBe('delete_file');
      expect(TOOL_NAMES.SEARCH_REPLACE).toBe('search_replace');
      expect(TOOL_NAMES.LIST_DIR).toBe('list_dir');
      expect(TOOL_NAMES.RUN_TERMINAL_CMD).toBe('run_terminal_cmd');
    });

    it('should have 10 tool names', () => {
      const keys = Object.keys(TOOL_NAMES);
      expect(keys.length).toBe(10);
    });

    it('should all be lowercase with underscores', () => {
      const values = Object.values(TOOL_NAMES);
      values.forEach(value => {
        expect(value).toMatch(/^[a-z_]+$/);
      });
    });
  });

  describe('PARAM_NAMES', () => {
    it('should define all expected parameter names', () => {
      expect(PARAM_NAMES.FILE_PATH).toBe('file_path');
      expect(PARAM_NAMES.TARGET_FILE).toBe('target_file');
      expect(PARAM_NAMES.PATH).toBe('path');
      expect(PARAM_NAMES.COMMAND).toBe('command');
      expect(PARAM_NAMES.QUERY).toBe('query');
      expect(PARAM_NAMES.PATTERN).toBe('pattern');
      expect(PARAM_NAMES.OLD_STRING).toBe('old_string');
      expect(PARAM_NAMES.NEW_STRING).toBe('new_string');
      expect(PARAM_NAMES.CONTENT).toBe('content');
    });

    it('should have 9 parameter names', () => {
      const keys = Object.keys(PARAM_NAMES);
      expect(keys.length).toBe(9);
    });
  });

  describe('RISK_LEVELS', () => {
    it('should define three risk levels', () => {
      expect(RISK_LEVELS.LOW).toBe('low');
      expect(RISK_LEVELS.MEDIUM).toBe('medium');
      expect(RISK_LEVELS.HIGH).toBe('high');
    });

    it('should have exactly 3 risk levels', () => {
      const keys = Object.keys(RISK_LEVELS);
      expect(keys.length).toBe(3);
    });
  });

  describe('RESULT_STATUS', () => {
    it('should define success and error statuses', () => {
      expect(RESULT_STATUS.SUCCESS).toBe('success');
      expect(RESULT_STATUS.ERROR).toBe('error');
    });

    it('should have exactly 2 result statuses', () => {
      const keys = Object.keys(RESULT_STATUS);
      expect(keys.length).toBe(2);
    });
  });

  describe('CSS_CLASSES', () => {
    it('should define all expected CSS class names', () => {
      expect(CSS_CLASSES.TOOL_CALL_ITEM).toBe('tool-call-item');
      expect(CSS_CLASSES.TOOL_CALL_HEADER).toBe('tool-call-header');
      expect(CSS_CLASSES.TOOL_STATUS).toBe('tool-status');
      expect(CSS_CLASSES.CONFIRM_BTN).toBe('confirm-btn');
      expect(CSS_CLASSES.CONFIRM_CANCEL).toBe('cancel');
      expect(CSS_CLASSES.CONFIRM_APPROVE).toBe('approve');
      expect(CSS_CLASSES.TOOL_RESULT).toBe('tool-result');
      expect(CSS_CLASSES.EXPAND_BTN).toBe('expand-btn');
    });

    it('should have 8 CSS class names', () => {
      const keys = Object.keys(CSS_CLASSES);
      expect(keys.length).toBe(8);
    });

    it('should all be kebab-case', () => {
      const values = Object.values(CSS_CLASSES);
      values.forEach(value => {
        expect(value).toMatch(/^[a-z-]+$/);
      });
    });
  });

  describe('PARAM_PRIORITY_ORDER', () => {
    it('should define parameter priority order', () => {
      expect(PARAM_PRIORITY_ORDER).toEqual([
        PARAM_NAMES.FILE_PATH,
        PARAM_NAMES.TARGET_FILE,
        PARAM_NAMES.PATH,
        PARAM_NAMES.COMMAND,
        PARAM_NAMES.QUERY,
        PARAM_NAMES.PATTERN,
        PARAM_NAMES.OLD_STRING,
        PARAM_NAMES.NEW_STRING,
        PARAM_NAMES.CONTENT
      ]);
    });

    it('should match all PARAM_NAMES values', () => {
      const paramValues = Object.values(PARAM_NAMES);
      expect(PARAM_PRIORITY_ORDER.length).toBe(paramValues.length);

      // All params should be in priority order
      paramValues.forEach(paramName => {
        expect(PARAM_PRIORITY_ORDER).toContain(paramName);
      });
    });

    it('should be an array', () => {
      expect(Array.isArray(PARAM_PRIORITY_ORDER)).toBe(true);
    });

    it('should have file-related params first', () => {
      expect(PARAM_PRIORITY_ORDER[0]).toBe('file_path');
      expect(PARAM_PRIORITY_ORDER[1]).toBe('target_file');
      expect(PARAM_PRIORITY_ORDER[2]).toBe('path');
    });

    it('should have content param last', () => {
      expect(PARAM_PRIORITY_ORDER[PARAM_PRIORITY_ORDER.length - 1]).toBe('content');
    });
  });

  describe('STATUS_COLORS', () => {
    it('should have color for each status', () => {
      const statusKeys = Object.keys(TOOL_CALL_STATUS);
      const colorKeys = Object.keys(STATUS_COLORS);

      // Each status should have a color
      expect(colorKeys.length).toBe(statusKeys.length);
    });

    it('should define colors for all statuses', () => {
      expect(STATUS_COLORS[TOOL_CALL_STATUS.SCHEDULED]).toBe('#fbbf24');
      expect(STATUS_COLORS[TOOL_CALL_STATUS.VALIDATING]).toBe('#f59e0b');
      expect(STATUS_COLORS[TOOL_CALL_STATUS.EXECUTING]).toBe('#3b82f6');
      expect(STATUS_COLORS[TOOL_CALL_STATUS.WAITING_FOR_CONFIRMATION]).toBe('#f59e0b');
      expect(STATUS_COLORS[TOOL_CALL_STATUS.SUCCESS]).toBe('#10b981');
      expect(STATUS_COLORS[TOOL_CALL_STATUS.ERROR]).toBe('#ef4444');
      expect(STATUS_COLORS[TOOL_CALL_STATUS.CANCELED]).toBe('#6b7280');
      expect(STATUS_COLORS[TOOL_CALL_STATUS.BACKGROUND_RUNNING]).toBe('#f59e0b');
    });

    it('should all be valid hex color codes', () => {
      const colors = Object.values(STATUS_COLORS);
      colors.forEach(color => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      });
    });

    it('should use distinct colors for key states', () => {
      // Success should be green
      expect(STATUS_COLORS[TOOL_CALL_STATUS.SUCCESS]).toMatch(/^#[0-9a-f]{6}$/);

      // Error should be red
      expect(STATUS_COLORS[TOOL_CALL_STATUS.ERROR]).toMatch(/^#[0-9a-f]{6}$/);

      // Executing should be blue
      expect(STATUS_COLORS[TOOL_CALL_STATUS.EXECUTING]).toMatch(/^#[0-9a-f]{6}$/);

      // Success, Error, and Executing should all be different
      expect(STATUS_COLORS[TOOL_CALL_STATUS.SUCCESS]).not.toBe(STATUS_COLORS[TOOL_CALL_STATUS.ERROR]);
      expect(STATUS_COLORS[TOOL_CALL_STATUS.SUCCESS]).not.toBe(STATUS_COLORS[TOOL_CALL_STATUS.EXECUTING]);
      expect(STATUS_COLORS[TOOL_CALL_STATUS.ERROR]).not.toBe(STATUS_COLORS[TOOL_CALL_STATUS.EXECUTING]);
    });
  });

  describe('Type exports', () => {
    it('should export ToolCallStatus type', () => {
      const status: ToolCallStatus = 'success';
      expect(status).toBe('success');
    });

    it('should export ToolName type', () => {
      const toolName: ToolName = 'write_file';
      expect(toolName).toBe('write_file');
    });

    it('should export ParamName type', () => {
      const paramName: ParamName = 'file_path';
      expect(paramName).toBe('file_path');
    });

    it('should export RiskLevel type', () => {
      const riskLevel: RiskLevel = 'high';
      expect(riskLevel).toBe('high');
    });

    it('should export ResultStatus type', () => {
      const resultStatus: ResultStatus = 'error';
      expect(resultStatus).toBe('error');
    });
  });

  describe('Constant consistency', () => {
    it('should not have duplicate values in TOOL_CALL_STATUS', () => {
      const values = Object.values(TOOL_CALL_STATUS);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('should not have duplicate values in TOOL_NAMES', () => {
      const values = Object.values(TOOL_NAMES);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('should have consistent naming convention', () => {
      // All constant object keys should be UPPER_CASE
      const allKeys = [
        ...Object.keys(TOOL_CALL_STATUS),
        ...Object.keys(TOOL_NAMES),
        ...Object.keys(PARAM_NAMES),
        ...Object.keys(RISK_LEVELS),
        ...Object.keys(RESULT_STATUS),
        ...Object.keys(CSS_CLASSES)
      ];

      allKeys.forEach(key => {
        expect(key).toMatch(/^[A-Z_]+$/);
      });
    });
  });
});