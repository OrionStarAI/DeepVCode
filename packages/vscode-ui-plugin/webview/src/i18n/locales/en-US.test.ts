import { describe, it, expect } from 'vitest';
import { enUS } from './en-US';

describe('en-US locale', () => {
  it('should have valid structure', () => {
    expect(enUS).toBeDefined();
    expect(typeof enUS).toBe('object');
  });

  it('should have main sections', () => {
    expect(enUS.common).toBeDefined();
    expect(enUS.welcome).toBeDefined();
    expect(enUS.session).toBeDefined();
    expect(enUS.chat).toBeDefined();
  });

  it('should have common strings in English', () => {
    expect(enUS.common.loading).toBe('Loading...');
    expect(enUS.common.send).toBe('Send');
    expect(enUS.common.cancel).toBe('Cancel');
    expect(enUS.common.confirm).toBe('Confirm');
  });

  it('should have welcome content', () => {
    expect(enUS.welcome.titleMain).toContain('DeepV Code');
    expect(enUS.welcome.description).toContain('code');
  });
});
