import { zhCN } from './zh-CN';

describe('zh-CN locale', () => {
  it('defines common strings', () => {
    expect(zhCN.common.loading.length).toBeGreaterThan(0);
    expect(zhCN.welcome.titleMain).toContain('DeepV Code');
  });
});
