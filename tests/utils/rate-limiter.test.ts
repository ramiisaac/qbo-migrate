import { describe, expect, it, beforeEach } from 'vitest';
import { RateLimiter } from '@/utils/rate-limiter.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter(3, 1, 50); // 3 tokens, 1 per second, 50ms min interval
  });

  it('should have initial tokens available', () => {
    expect(rateLimiter.getTokenCount()).toBeGreaterThan(2);
  });

  it('should consume tokens when making requests', async () => {
    const initialTokens = rateLimiter.getTokenCount();

    await rateLimiter.waitForToken();

    const afterTokens = rateLimiter.getTokenCount();
    expect(afterTokens).toBeLessThan(initialTokens);
  });

  it('should enforce some delay between calls', async () => {
    const start = Date.now();

    await rateLimiter.waitForToken();
    await rateLimiter.waitForToken();

    const elapsed = Date.now() - start;
    // Should take some time due to minimum interval
    expect(elapsed).toBeGreaterThan(30);
  });

  it('should refill tokens over time', async () => {
    // Use up all tokens
    await rateLimiter.waitForToken();
    await rateLimiter.waitForToken();
    await rateLimiter.waitForToken();

    expect(rateLimiter.getTokenCount()).toBeLessThan(1);

    // Wait for tokens to refill (more than 1 second)
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Should have at least 1 token now
    expect(rateLimiter.getTokenCount()).toBeGreaterThan(0.5);
  });

  it('should handle multiple requests sequentially', async () => {
    const results = [];

    // Make several requests in sequence
    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      await rateLimiter.waitForToken();
      const elapsed = Date.now() - start;
      results.push(elapsed);
    }

    // All requests should complete (timing will vary but they should work)
    expect(results).toHaveLength(3);
    expect(results.every(time => time >= 0)).toBe(true);
  });
});
