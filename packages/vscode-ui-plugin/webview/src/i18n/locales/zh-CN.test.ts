import { describe, it, expect } from 'vitest';
import { zhCN } from './zh-CN';

describe('zh-CN locale', () => {
  it('should have valid structure', () => {
    expect(zhCN).toBeDefined();
    expect(typeof zhCN).toBe('object');
  });

  it('should have main sections', () => {
    expect(zhCN.common).toBeDefined();
    expect(zhCN.welcome).toBeDefined();
    expect(zhCN.session).toBeDefined();
    expect(zhCN.chat).toBeDefined();
  });

  it('should have common strings in Chinese', () => {
    expect(zhCN.common.loading).toBe('加载中...');
    expect(zhCN.common.send).toBe('发送');
    expect(zhCN.common.cancel).toBe('取消');
    expect(zhCN.common.confirm).toBe('确认');
  });

  it('should have welcome content', () => {
    expect(zhCN.welcome.titleMain).toContain('DeepV Code');
    expect(zhCN.welcome.description).toContain('代码');
  });
});
