import { enUS } from './en-US';

describe('en-US locale', () => {
  it('defines common strings', () => {
    expect(enUS.common.loading.length).toBeGreaterThan(0);
    expect(enUS.welcome.titleMain).toContain('DeepV Code');
  });
});
