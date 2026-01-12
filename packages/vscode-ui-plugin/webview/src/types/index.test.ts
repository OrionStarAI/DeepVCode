import { describe, it, expect } from 'vitest';
import { ToolCallStatus } from './index';

describe('types index', () => {
  describe('ToolCallStatus enum', () => {
    it('should have all status values', () => {
      expect(ToolCallStatus.Scheduled).toBe('scheduled');
      expect(ToolCallStatus.Validating).toBe('validating');
      expect(ToolCallStatus.Executing).toBe('executing');
      expect(ToolCallStatus.WaitingForConfirmation).toBe('awaiting_approval');
      expect(ToolCallStatus.Success).toBe('success');
      expect(ToolCallStatus.Error).toBe('error');
      expect(ToolCallStatus.Canceled).toBe('cancelled');
      expect(ToolCallStatus.BackgroundRunning).toBe('background_running');
    });

    it('should have unique values', () => {
      const values = Object.values(ToolCallStatus);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('should contain executing status', () => {
      expect(ToolCallStatus.Executing).toBe('executing');
    });

    it('should contain success status', () => {
      expect(ToolCallStatus.Success).toBe('success');
    });

    it('should contain error status', () => {
      expect(ToolCallStatus.Error).toBe('error');
    });

    it('should contain cancelled status', () => {
      expect(ToolCallStatus.Canceled).toBe('cancelled');
    });
  });
});