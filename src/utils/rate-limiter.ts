/**
 * Simple rate limiter for API calls
 */
export class RateLimiter {
  private lastCall = 0;
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per second
  private readonly minInterval: number; // minimum ms between calls

  constructor(
    maxTokens = 10,
    refillRate = 1, // 1 token per second
    minInterval = 100 // minimum 100ms between calls
  ) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRate = refillRate;
    this.minInterval = minInterval;
  }

  /**
   * Wait for permission to make an API call
   */
  async waitForToken(): Promise<void> {
    this.refillTokens();

    if (this.tokens <= 0) {
      // Calculate wait time needed
      const waitTime = (1 / this.refillRate) * 1000; // ms to wait for 1 token
      await this.sleep(waitTime);
      this.refillTokens();
    }

    // Enforce minimum interval between calls
    const timeSinceLastCall = Date.now() - this.lastCall;
    if (timeSinceLastCall < this.minInterval) {
      await this.sleep(this.minInterval - timeSinceLastCall);
    }

    this.tokens--;
    this.lastCall = Date.now();
  }

  private refillTokens(): void {
    const now = Date.now();
    if (this.lastCall > 0) {
      const timePassed = (now - this.lastCall) / 1000; // seconds
      const tokensToAdd = timePassed * this.refillRate;
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current token count (for debugging)
   */
  getTokenCount(): number {
    this.refillTokens();
    return this.tokens;
  }
}

/**
 * Global rate limiters for different services
 */
export const rateLimiters = {
  general: new RateLimiter(10, 1, 100), // generic fallback
  qbo: new RateLimiter(15, 2, 100), // QBO API: modest rate (tunable)
};
