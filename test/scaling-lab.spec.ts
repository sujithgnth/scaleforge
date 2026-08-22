import { parseArgs, summarize, type LabConfig, type PhaseResult } from '../scripts/scaling-lab.js';

describe('scaling lab', () => {
  const config: LabConfig = {
    url: 'http://localhost:3000/v1/health/live',
    ratePerSecond: 5,
    durationSeconds: 1,
    warmupSeconds: 0,
    concurrency: 2,
    timeoutMs: 500,
    json: false,
  };

  it('parses a bounded workload without reading a token into the report config', () => {
    const parsed = parseArgs(
      [
        '--url',
        'https://example.test/v1/restaurants',
        '--rate=12',
        '--duration',
        '5',
        '--concurrency',
        '4',
        '--max-error-rate',
        '0.01',
      ],
      { SCALEFORGE_LAB_TOKEN: 'must-not-enter-config' },
    );

    expect(parsed).toEqual({
      url: 'https://example.test/v1/restaurants',
      ratePerSecond: 12,
      durationSeconds: 5,
      warmupSeconds: 2,
      concurrency: 4,
      timeoutMs: 2_000,
      json: false,
      maxErrorRate: 0.01,
    });
    expect(JSON.stringify(parsed)).not.toContain('must-not-enter-config');
  });

  it('rejects unsafe or meaningless workload arguments', () => {
    expect(() => parseArgs(['--url', 'file:///etc/passwd'])).toThrow(
      '--url must be a valid HTTP(S) URL',
    );
    expect(() => parseArgs(['--concurrency', '0'])).toThrow('--concurrency must be at least 1');
    expect(() => parseArgs(['--max-error-rate', '1.1'])).toThrow('--max-error-rate must be 0..1');
  });

  it('separates successful tail latency, failures, and client backpressure', () => {
    const phase: PhaseResult = {
      samples: [
        { durationMs: 10, status: 200 },
        { durationMs: 20, status: 200 },
        { durationMs: 30, status: 503 },
        { durationMs: 500, error: 'timeout' },
      ],
      scheduled: 5,
      clientBackpressureDrops: 1,
      elapsedMs: 1_000,
    };

    const report = summarize({ ...config, sloP99Ms: 15, maxErrorRate: 0.1 }, phase);

    expect(report.traffic).toMatchObject({
      scheduled: 5,
      completed: 4,
      successful: 2,
      httpFailures: 1,
      timeouts: 1,
      clientBackpressureDrops: 1,
      achievedRequestsPerSecond: 4,
      errorRate: 0.5,
    });
    expect(report.statusCodes).toEqual({ '200': 2, '503': 1 });
    expect(report.latencyMs.p99).toBe(500);
    expect(report.successfulLatencyMs.p99).toBe(20);
    expect(report.thresholds.passed).toBe(false);
    expect(report.thresholds.failures).toHaveLength(3);
  });
});
