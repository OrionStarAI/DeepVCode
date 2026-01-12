import { DEFAULT_PROJECT_SETTINGS, DEFAULT_YOLO_MODE_SETTINGS, SettingsCategory } from './projectSettings';

describe('projectSettings types', () => {
  it('defines default settings', () => {
    expect(DEFAULT_YOLO_MODE_SETTINGS.yoloMode).toBe(false);
    expect(DEFAULT_PROJECT_SETTINGS.execution.yoloMode).toBe(false);
    expect(SettingsCategory.EXECUTION).toBe('execution');
  });
});
