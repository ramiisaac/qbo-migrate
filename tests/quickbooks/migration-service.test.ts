import { describe, it, expect } from 'vitest';
import { QboMigrationService } from '../../src/quickbooks/migration-service.js';
import type { QboDataProvider } from '../../src/providers/types.js';
import type { QboAuthConfig } from '../../src/quickbooks/migration-types.js';

class StubProvider implements QboDataProvider {
  private data: Record<string, any[]>;
  constructor(map: Record<string, any[]>) {
    this.data = map;
  }
  async fetchAll(entity: string) {
    return { items: this.data[entity] || [] };
  }
  async batchCreate(entity: string, items: any[]) {
    return { entity, attempted: items.length, created: items.length, failed: 0 };
  }
}

const STUB_AUTH: QboAuthConfig = {
  clientId: 'test',
  clientSecret: 'test',
  accessToken: 'test',
  refreshToken: 'test',
  realmId: '0',
};

describe('QboMigrationService', () => {
  it('dry-run does not perform writes', async () => {
    const src = new StubProvider({ Customer: [{ Id: '1' }, { Id: '2' }] });
    const tgt = new StubProvider({});
    const svc = new QboMigrationService({
      dryRun: true,
      source: STUB_AUTH,
      target: STUB_AUTH,
      includeEntities: ['Customer'],
    });
    const report = await svc.migrate({ source: src, target: tgt });
    expect(report.fetch[0].count).toBe(2);
    expect(report.write.length === 0 || report.write[0].attempted === 0).toBe(true);
    expect(report.success).toBe(true);
  });

  it('writes when not dry-run', async () => {
    const src = new StubProvider({ Customer: [{ Id: '1' }, { Id: '2' }] });
    const tgt = new StubProvider({});
    const svc = new QboMigrationService({
      dryRun: false,
      source: STUB_AUTH,
      target: STUB_AUTH,
      includeEntities: ['Customer'],
    });
    const report = await svc.migrate({ source: src, target: tgt });
    expect(report.write[0].created).toBe(2);
    expect(report.success).toBe(true);
  });
});
