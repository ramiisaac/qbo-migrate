import { describe, it, expect } from 'vitest';
import { computeNodeVersionStatus, computeVersionMismatch } from '@/utils/preflight.js';

describe('preflight helpers', () => {
  describe('computeNodeVersionStatus', () => {
    it('should return ok when current Node major >= min required', () => {
      // Mock process.version for testing
      const originalVersion = process.version;

      try {
        // Simulate Node 20.x.x
        Object.defineProperty(process, 'version', {
          value: 'v20.1.0',
          configurable: true,
        });

        const result = computeNodeVersionStatus(18);

        expect(result.ok).toBe(true);
        expect(result.current).toBe('v20.1.0');
        expect(result.currentMajor).toBe(20);
        expect(result.minMajor).toBe(18);
      } finally {
        // Restore original version
        Object.defineProperty(process, 'version', {
          value: originalVersion,
          configurable: true,
        });
      }
    });

    it('should return not ok when current Node major < min required', () => {
      const originalVersion = process.version;

      try {
        // Simulate Node 16.x.x
        Object.defineProperty(process, 'version', {
          value: 'v16.14.0',
          configurable: true,
        });

        const result = computeNodeVersionStatus(18);

        expect(result.ok).toBe(false);
        expect(result.current).toBe('v16.14.0');
        expect(result.currentMajor).toBe(16);
        expect(result.minMajor).toBe(18);
      } finally {
        Object.defineProperty(process, 'version', {
          value: originalVersion,
          configurable: true,
        });
      }
    });
  });

  describe('computeVersionMismatch', () => {
    it('should return no mismatch for exact version match', () => {
      const result = computeVersionMismatch('1.2.3', '1.2.3');

      expect(result.mismatch).toBe(false);
      expect(result.runningVersion).toBe('1.2.3');
      expect(result.declaredRange).toBe('1.2.3');
      expect(result.reason).toBeUndefined();
    });

    it('should return mismatch for exact version difference', () => {
      const result = computeVersionMismatch('1.0.0', '1.2.3');

      expect(result.mismatch).toBe(true);
      expect(result.runningVersion).toBe('1.0.0');
      expect(result.declaredRange).toBe('1.2.3');
      expect(result.reason).toBe('Version mismatch');
    });

    it('should return mismatch for caret range', () => {
      const result = computeVersionMismatch('1.2.3', '^1.2.3');

      expect(result.mismatch).toBe(true);
      expect(result.runningVersion).toBe('1.2.3');
      expect(result.declaredRange).toBe('^1.2.3');
      expect(result.reason).toBe('Non-exact version range detected');
    });

    it('should return mismatch for tilde range', () => {
      const result = computeVersionMismatch('1.2.3', '~1.2.3');

      expect(result.mismatch).toBe(true);
      expect(result.runningVersion).toBe('1.2.3');
      expect(result.declaredRange).toBe('~1.2.3');
      expect(result.reason).toBe('Non-exact version range detected');
    });

    it('should return mismatch for greater-than range', () => {
      const result = computeVersionMismatch('1.2.3', '>1.0.0');

      expect(result.mismatch).toBe(true);
      expect(result.runningVersion).toBe('1.2.3');
      expect(result.declaredRange).toBe('>1.0.0');
      expect(result.reason).toBe('Non-exact version range detected');
    });
  });
});
