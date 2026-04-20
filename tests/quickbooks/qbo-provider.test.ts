import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QboProvider } from '../../src/providers/qbo.js';

// Mock dynamic import of node-quickbooks
vi.mock('node-quickbooks', () => {
  class MockQB {
    [key: string]: any;
    constructor() {
      // no-op
    }
  }
  // will be customized per test
  return { default: MockQB };
});

describe('QboProvider', () => {
  const baseCfg = {
    clientId: 'id',
    clientSecret: 'secret',
    accessToken: 'access',
    refreshToken: 'refresh',
    realmId: '123',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchAll returns empty with error if method missing', async () => {
    const p = new QboProvider(baseCfg, true);
    const result = await p.fetchAll('Customer');
    expect(result.items).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('create handles missing method', async () => {
    const p = new QboProvider(baseCfg, true);
    const res = await p.create('Customer', { DisplayName: 'A' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Method/);
  });

  it('create retries transient errors then succeeds', async () => {
    const mod: any = await import('node-quickbooks');
    let attempts = 0;
    mod.default.prototype.createCustomer = function (_payload: any, cb: any) {
      attempts += 1;
      if (attempts < 3) return cb(new Error('network timeout'));
      cb(null, { Id: '42' });
    };

    const p = new QboProvider(baseCfg, true);
    const res = await p.create('Customer', { DisplayName: 'X' });
    expect(res.success).toBe(true);
    expect(res.id).toBe('42');
    expect(attempts).toBe(3);
  });

  it('batchCreate aggregates errors', async () => {
    const mod: any = await import('node-quickbooks');
    mod.default.prototype.createItem = function (_payload: any, cb: any) {
      cb(new Error('429 rate limit'));
    };

    const p = new QboProvider(baseCfg, true);
    const res = await p.batchCreate('Item', [{ Name: 'A' }, { Name: 'B' }], 10, 0, false, 1);
    expect(res.failed).toBe(2);
    expect(res.errors?.length).toBe(2);
  });
});
