import { describe, it, expect } from 'vitest';
import { maskValue, shouldMaskVar, getPlaceholder } from '@/utils/masking.js';

describe('Masking utilities', () => {
  describe('maskValue', () => {
    it('should mask tokens and secrets', () => {
      expect(maskValue('token=abc123xyz789')).toBe('token=abc123…');
      expect(maskValue('key=secret-key-12345678')).toBe('key=secret…');
    });

    it('should truncate long values', () => {
      const longValue = 'a'.repeat(100);
      const masked = maskValue(longValue, 50);
      expect(masked).toHaveLength(51); // 50 + ellipsis
      expect(masked.endsWith('…')).toBe(true);
    });

    it('should strip outer quotes', () => {
      expect(maskValue('"quoted"')).toBe('quoted');
      expect(maskValue('not "quoted"')).toBe('not "quoted"');
    });
  });

  describe('shouldMaskVar', () => {
    it('should identify sensitive variable names', () => {
      expect(shouldMaskVar('API_KEY')).toBe(true);
      expect(shouldMaskVar('SECRET_TOKEN')).toBe(true);
      expect(shouldMaskVar('PASSWORD')).toBe(true);
      expect(shouldMaskVar('AUTH_TOKEN')).toBe(true);
      expect(shouldMaskVar('PRIVATE_KEY')).toBe(true);
      expect(shouldMaskVar('NODE_ENV')).toBe(false);
      expect(shouldMaskVar('PORT')).toBe(false);
    });
  });

  describe('getPlaceholder', () => {
    it('should return CHANGE_ME for all vars', () => {
      expect(getPlaceholder('NEXT_PUBLIC_API_URL')).toBe('CHANGE_ME');
      expect(getPlaceholder('NEXT_PUBLIC_ANYTHING')).toBe('CHANGE_ME');
      expect(getPlaceholder('API_KEY')).toBe('CHANGE_ME');
      expect(getPlaceholder('DATABASE_URL')).toBe('CHANGE_ME');
    });
  });
});
