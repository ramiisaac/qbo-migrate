import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger } from '@/utils/log.js';

describe('Logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should log info messages', () => {
    logger.info('Test message');
    expect(console.log).toHaveBeenCalled();
  });

  it('should only log debug in verbose mode', () => {
    logger.debug('Debug message');
    expect(console.log).not.toHaveBeenCalled();

    logger.setVerbose(true);
    logger.debug('Debug message');
    expect(console.log).toHaveBeenCalled();
  });

  it('should manage spinner lifecycle', () => {
    logger.startSpinner('Loading...');
    logger.stopSpinner(true, 'Done!');

    // Spinner should be cleared
    logger.startSpinner('New task');
    logger.stopSpinner(false, 'Failed');
  });
});
