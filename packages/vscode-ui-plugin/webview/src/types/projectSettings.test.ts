import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROJECT_SETTINGS,
  DEFAULT_YOLO_MODE_SETTINGS,
  SettingsCategory,
  type YoloModeSettings,
  type ExecutionSettings,
  type ProjectSettings,
} from './projectSettings';

describe('projectSettings types', () => {
  describe('SettingsCategory enum', () => {
    it('should have EXECUTION category', () => {
      expect(SettingsCategory.EXECUTION).toBe('execution');
    });
  });

  describe('DEFAULT_YOLO_MODE_SETTINGS', () => {
    it('should have yoloMode disabled by default', () => {
      expect(DEFAULT_YOLO_MODE_SETTINGS.yoloMode).toBe(false);
    });

    it('should be a valid YoloModeSettings object', () => {
      const settings: YoloModeSettings = DEFAULT_YOLO_MODE_SETTINGS;
      expect(settings).toHaveProperty('yoloMode');
    });
  });

  describe('DEFAULT_PROJECT_SETTINGS', () => {
    it('should have execution settings', () => {
      expect(DEFAULT_PROJECT_SETTINGS.execution).toBeDefined();
    });

    it('should have yoloMode disabled in execution', () => {
      expect(DEFAULT_PROJECT_SETTINGS.execution.yoloMode).toBe(false);
    });

    it('should be a valid ProjectSettings object', () => {
      const settings: ProjectSettings = DEFAULT_PROJECT_SETTINGS;
      expect(settings.execution).toBeDefined();
    });
  });

  describe('YoloModeSettings', () => {
    it('should accept enabled yoloMode', () => {
      const settings: YoloModeSettings = {
        yoloMode: true,
      };
      expect(settings.yoloMode).toBe(true);
    });

    it('should accept disabled yoloMode', () => {
      const settings: YoloModeSettings = {
        yoloMode: false,
      };
      expect(settings.yoloMode).toBe(false);
    });
  });

  describe('ExecutionSettings (deprecated)', () => {
    it('should extend YoloModeSettings', () => {
      const settings: ExecutionSettings = {
        yoloMode: true,
      };
      expect(settings.yoloMode).toBe(true);
    });
  });

  describe('ProjectSettings (deprecated)', () => {
    it('should have execution property', () => {
      const settings: ProjectSettings = {
        execution: {
          yoloMode: false,
        },
      };
      expect(settings.execution.yoloMode).toBe(false);
    });
  });
});