import { ConfigService } from '@nestjs/config';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { StellarHealthIndicator } from './stellar-health.indicator';
import { ElasticsearchService } from '../metrics/services/elasticsearch.service';

describe('HealthController', () => {
  let controller: HealthController;
  let redis: { ping: jest.Mock; info: jest.Mock };
  let configService: { get: jest.Mock };
  let dbIndicator: { pingCheck: jest.Mock };
  let stellarIndicator: { isHealthy: jest.Mock };
  let elasticsearchService: { ping: jest.Mock };
  let healthCheckService: { check: jest.Mock };

  beforeEach(() => {
    redis = {
      ping: jest.fn().mockResolvedValue('PONG'),
      info: jest.fn().mockResolvedValue('connected_clients:5\r\nused_memory_human:1.5M\r\nkeyspace_hits:100\r\nkeyspace_misses:10'),
    };
    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'APP_VERSION') return '1.2.3';
        return defaultValue;
      }),
    };
    dbIndicator = {
      pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    };
    stellarIndicator = {
      isHealthy: jest.fn().mockResolvedValue({ stellar: { status: 'up' } }),
    };
    elasticsearchService = {
      ping: jest.fn().mockResolvedValue(true),
    };
    healthCheckService = {
      check: jest.fn(async (checks: Array<() => Promise<Record<string, any>>>) => {
        const info: Record<string, any> = {};
        for (const check of checks) {
          Object.assign(info, await check());
        }
        return { status: 'ok', info, error: {}, details: info };
      }),
    };

    controller = new HealthController(
      healthCheckService as unknown as HealthCheckService,
      dbIndicator as unknown as TypeOrmHealthIndicator,
      configService as unknown as ConfigService,
      stellarIndicator as unknown as StellarHealthIndicator,
      elasticsearchService as unknown as ElasticsearchService,
      redis as any,
    );
  });

  it('returns complete health payload with critical and warning checks', async () => {
    const result = await controller.health();

    expect(result.status).toBe('ok');
    expect(result.info.database.status).toBe('up');
    expect(result.info.redis.status).toBe('up');
    expect(result.info.redis.connectedClients).toBe('5');
    expect(result.info.redis.usedMemory).toBe('1.5M');
    expect(result.info.stellar.status).toBe('up');
    expect(result.info.elasticsearch.status).toBe('up');
    expect(result.info.memory.status).toBe('up');
    expect(result.info.disk.status).toBe('up');
    expect(result.info.cache.status).toBe('up');
    expect(result.info.cache.hitRate).toBe('91%');
    expect(result.info.app.version).toBe('1.2.3');
  });

  it('returns readiness payload with only critical checks', async () => {
    await controller.ready();

    const checks = healthCheckService.check.mock.calls[0][0];
    expect(checks).toHaveLength(4);
  });

  it('skips redis ping when redis is not configured', async () => {
    configService.get.mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'APP_VERSION') return '1.2.3';
      return defaultValue;
    });

    await controller.ready();
    expect(redis.ping).not.toHaveBeenCalled();
  });

  it('reports elasticsearch as down when ping fails', async () => {
    elasticsearchService.ping.mockResolvedValue(false);

    await expect(controller.ready()).rejects.toThrow();
  });

  it('live endpoint always returns up', () => {
    const result = controller.live();
    expect(result.status).toBe('ok');
    expect(result.info.app.status).toBe('up');
    expect(result.info.app.version).toBe('1.2.3');
    expect(result.info.app.uptime).toBeGreaterThanOrEqual(0);
  });
});
