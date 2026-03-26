import { Test, TestingModule } from '@nestjs/testing';
import { PrometheusService } from './prometheus.service';

describe('PrometheusService', () => {
  let service: PrometheusService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrometheusService],
    }).compile();

    service = module.get<PrometheusService>(PrometheusService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have registry', () => {
    expect(service.registry).toBeDefined();
  });

  it('should collect HTTP metrics', () => {
    service.httpRequestTotal.inc({ method: 'GET', route: '/test', status_code: '200' });
    expect(service.httpRequestTotal).toBeDefined();
  });

  it('should collect database metrics', () => {
    service.dbQueryDuration.observe({ query_type: 'SELECT', table: 'users' }, 0.05);
    expect(service.dbQueryDuration).toBeDefined();
  });

  it('should collect business metrics', () => {
    service.tipsPerSecond.inc({ currency: 'XLM', status: 'success' });
    expect(service.tipsPerSecond).toBeDefined();
  });

  it('should collect Stellar transaction metrics', () => {
    service.stellarTransactionSuccess.inc({ operation_type: 'payment' });
    service.stellarTransactionFailure.inc({ operation_type: 'payment', error_code: 'timeout' });
    expect(service.stellarTransactionSuccess).toBeDefined();
    expect(service.stellarTransactionFailure).toBeDefined();
  });

  it('should track active users', () => {
    service.activeUsers.set(100);
    expect(service.activeUsers).toBeDefined();
  });

  it('should track queue length', () => {
    service.queueLength.set({ queue_name: 'tips' }, 50);
    expect(service.queueLength).toBeDefined();
  });

  it('should export metrics', async () => {
    const metrics = await service.getMetrics();
    expect(metrics).toBeDefined();
    expect(typeof metrics).toBe('string');
    expect(metrics.length).toBeGreaterThan(0);
  });

  it('should collect system metrics', async () => {
    // Wait for system metrics collection
    await new Promise(resolve => setTimeout(resolve, 100));
    const metrics = await service.getMetrics();
    expect(metrics).toContain('app_memory_usage_bytes');
  });

  it('should collect cache metrics', () => {
    service.cacheHitTotal.inc({ cache_name: 'user_profiles' });
    service.cacheMissTotal.inc({ cache_name: 'user_profiles' });
    expect(service.cacheHitTotal).toBeDefined();
    expect(service.cacheMissTotal).toBeDefined();
  });

  it('should collect scheduled job metrics', () => {
    service.scheduledJobDuration.observe({ job_name: 'sync_tips', status: 'success' }, 1.5);
    service.scheduledJobTotal.inc({ job_name: 'sync_tips', status: 'success' });
    expect(service.scheduledJobDuration).toBeDefined();
    expect(service.scheduledJobTotal).toBeDefined();
  });

  it('should collect search query metrics', () => {
    service.searchQueryDuration.observe({ query_type: 'full_text' }, 0.25);
    expect(service.searchQueryDuration).toBeDefined();
  });

  it('should collect notification metrics', () => {
    service.notificationsSent.inc({ channel: 'email', status: 'sent' });
    expect(service.notificationsSent).toBeDefined();
  });

  it('should collect artist verification metrics', () => {
    service.artistVerificationTotal.inc({ outcome: 'approved' });
    expect(service.artistVerificationTotal).toBeDefined();
  });
});
