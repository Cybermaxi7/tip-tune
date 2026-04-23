import { Inject, Optional, Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  HealthIndicatorFunction,
  HealthIndicatorResult,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import Redis from 'ioredis';
import { statfsSync } from 'fs';
import { REDIS_CLIENT } from '../leaderboards/redis.module';
import { StellarHealthIndicator } from './stellar-health.indicator';
import { ElasticsearchService } from '../metrics/services/elasticsearch.service';

@Controller({ version: VERSION_NEUTRAL })
@SkipThrottle() // Health checks should not be rate limited
export class HealthController {
  constructor(
    private readonly healthCheckService: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly configService: ConfigService,
    private readonly stellarHealthIndicator: StellarHealthIndicator,
    private readonly elasticsearchService: ElasticsearchService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  @Get('health')
  @HealthCheck()
  async health() {
    return this.healthCheckService.check([
      ...this.getCriticalChecks(),
      this.getMemoryIndicator,
      this.getDiskIndicator,
      this.getCacheIndicator,
      this.getAppIndicator,
    ]);
  }

  @Get('ready')
  @HealthCheck()
  async ready() {
    return this.healthCheckService.check(this.getCriticalChecks());
  }

  @Get('live')
  live() {
    const app = this.getAppPayload();
    return {
      status: 'ok',
      info: { app },
      error: {},
      details: { app },
    };
  }

  private getCriticalChecks(): HealthIndicatorFunction[] {
    const checks: HealthIndicatorFunction[] = [
      () => this.db.pingCheck('database', { timeout: 3000 }),
      () => this.stellarHealthIndicator.isHealthy('stellar'),
    ];

    if (this.isRedisConfigured()) {
      checks.push(async () => {
        try {
          if (!this.redis) {
            throw new Error('Redis client not available');
          }
          const ping = await this.redis.ping();
          const isUp = ping === 'PONG';
          if (!isUp) {
            throw new Error('Redis ping did not return PONG');
          }
          const info = await this.redis.info('clients').catch(() => '');
          const memInfo = await this.redis.info('memory').catch(() => '');
          const connectedClients = info.match(/connected_clients:(\d+)/)?.[1] ?? 'unknown';
          const usedMemory = memInfo.match(/used_memory_human:(\S+)/)?.[1] ?? 'unknown';
          return {
            redis: {
              status: 'up' as const,
              connectedClients,
              usedMemory,
            },
          };
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Redis unreachable';
          throw new HealthCheckError('Redis health check failed', {
            redis: { status: 'down', message },
          });
        }
      });
    } else {
      checks.push(async () => ({
        redis: { status: 'up', configured: false, message: 'Redis not configured' },
      }));
    }

    checks.push(async () => {
      try {
        const isUp = await this.elasticsearchService.ping();
        if (!isUp) {
          throw new Error('Elasticsearch ping failed');
        }
        return { elasticsearch: { status: 'up' as const } };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Elasticsearch unreachable';
        throw new HealthCheckError('Elasticsearch health check failed', {
          elasticsearch: { status: 'down', message },
        });
      }
    });

    return checks;
  }

  private getMemoryIndicator = async (): Promise<HealthIndicatorResult> => {
    const usage = process.memoryUsage();
    const heapTotal = usage.heapTotal || 1;
    const heapUsagePercent = Math.round((usage.heapUsed / heapTotal) * 100);

    const memoryResult: {
      status: 'up';
      heapUsed: string;
      threshold: string;
      warning?: string;
    } = {
      status: 'up',
      heapUsed: `${heapUsagePercent}%`,
      threshold: '80%',
    };

    if (heapUsagePercent > 80) {
      memoryResult.warning = 'Heap usage above 80%';
    }

    return {
      memory: memoryResult,
    };
  };

  private getDiskIndicator = async (): Promise<HealthIndicatorResult> => {
    try {
      const healthPath = this.configService.get<string>('HEALTH_DISK_PATH', process.cwd());
      const stats = statfsSync(healthPath);
      const total = stats.blocks * stats.bsize;
      const available = stats.bavail * stats.bsize;
      const freePercent = total > 0 ? Math.round((available / total) * 100) : 100;

      const disk: {
        status: 'up';
        free: string;
        threshold: string;
        path: string;
        warning?: string;
      } = {
        status: 'up',
        free: `${freePercent}%`,
        threshold: '10%',
        path: healthPath,
      };

      if (freePercent < 10) {
        disk.warning = 'Disk free space below 10%';
      }

      return { disk };
    } catch (error: any) {
      return {
        disk: {
          status: 'up' as const,
          warning: 'Unable to read disk usage',
          message: error?.message ?? 'statfs failed',
        },
      };
    }
  };

  private getCacheIndicator = async (): Promise<HealthIndicatorResult> => {
    if (!this.redis || !this.isRedisConfigured()) {
      return { cache: { status: 'up' as const, configured: false } };
    }
    try {
      const info = await this.redis.info('stats');
      const hits = info.match(/keyspace_hits:(\d+)/)?.[1] ?? '0';
      const misses = info.match(/keyspace_misses:(\d+)/)?.[1] ?? '0';
      const totalOps = Number(hits) + Number(misses);
      const hitRate = totalOps > 0 ? Math.round((Number(hits) / totalOps) * 100) : 0;
      return {
        cache: {
          status: 'up' as const,
          hits,
          misses,
          hitRate: `${hitRate}%`,
        },
      };
    } catch {
      return {
        cache: { status: 'up' as const, warning: 'Unable to retrieve cache stats' },
      };
    }
  };

  private getAppIndicator = async (): Promise<HealthIndicatorResult> => ({
    app: this.getAppPayload(),
  });

  private getAppPayload() {
    const version =
      this.configService.get<string>('APP_VERSION') || process.env.npm_package_version || '0.0.1';
    return {
      status: 'up' as const,
      version,
      uptime: Math.floor(process.uptime()),
    };
  }

  private isRedisConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('REDIS_URL') ||
        this.configService.get<string>('REDIS_HOST') ||
        this.configService.get<string>('REDIS_PORT'),
    );
  }
}
