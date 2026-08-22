import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

export interface LabConfig {
  url: string;
  ratePerSecond: number;
  durationSeconds: number;
  warmupSeconds: number;
  concurrency: number;
  timeoutMs: number;
  json: boolean;
  sloP99Ms?: number;
  maxErrorRate?: number;
}

export interface RequestSample {
  durationMs: number;
  status?: number;
  error?: 'network' | 'timeout';
}

export interface PhaseResult {
  samples: RequestSample[];
  scheduled: number;
  clientBackpressureDrops: number;
  elapsedMs: number;
}

interface LatencySummary {
  min: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

export interface LabReport {
  target: string;
  workload: {
    offeredRatePerSecond: number;
    durationSeconds: number;
    concurrencyLimit: number;
    timeoutMs: number;
  };
  traffic: {
    scheduled: number;
    completed: number;
    successful: number;
    httpFailures: number;
    networkFailures: number;
    timeouts: number;
    clientBackpressureDrops: number;
    achievedRequestsPerSecond: number;
    errorRate: number;
  };
  statusCodes: Record<string, number>;
  latencyMs: LatencySummary;
  successfulLatencyMs: LatencySummary;
  thresholds: {
    configured: boolean;
    passed: boolean;
    failures: string[];
  };
}

type RequestExecutor = () => Promise<RequestSample>;

const USAGE = `ScaleForge scaling lab

Usage:
  npm run lab:scale -- [options]

Options:
  --url <url>                  Target URL (default: SCALEFORGE_LAB_URL or /v1/health/live)
  --rate <requests/second>     Offered request rate (default: 5)
  --duration <seconds>         Measured phase duration (default: 10)
  --warmup <seconds>           Unreported warm-up duration (default: 2)
  --concurrency <count>        Maximum in-flight requests (default: 10)
  --timeout <milliseconds>     Per-request timeout (default: 2000)
  --slo-p99 <milliseconds>     Optional successful-request p99 threshold
  --max-error-rate <0..1>      Optional HTTP/transport error-rate threshold
  --json                       Print machine-readable JSON
  --help                       Show this help

Environment:
  SCALEFORGE_LAB_TOKEN         Optional bearer token; never printed
  SCALEFORGE_LAB_URL           Optional default target URL
`;

function readNumber(
  values: Map<string, string | boolean>,
  key: string,
  fallback: number,
  options: { min: number; max?: number },
): number {
  const raw = values.get(key);
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || raw.trim() === '') throw new Error(`--${key} needs a value`);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < options.min || (options.max && parsed > options.max)) {
    const range = options.max ? `${options.min}..${options.max}` : `at least ${options.min}`;
    throw new Error(`--${key} must be ${range}`);
  }
  return parsed;
}

function collectArguments(argv: string[]): Map<string, string | boolean> {
  const values = new Map<string, string | boolean>();
  const allowed = new Set([
    'url',
    'rate',
    'duration',
    'warmup',
    'concurrency',
    'timeout',
    'slo-p99',
    'max-error-rate',
    'json',
    'help',
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const [rawKey, inlineValue] = argument.slice(2).split('=', 2);
    if (!rawKey || !allowed.has(rawKey)) throw new Error(`Unknown option: --${rawKey}`);
    if (rawKey === 'json' || rawKey === 'help') {
      if (inlineValue !== undefined) throw new Error(`--${rawKey} does not take a value`);
      values.set(rawKey, true);
      continue;
    }
    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`--${rawKey} needs a value`);
    values.set(rawKey, value);
    if (inlineValue === undefined) index += 1;
  }
  return values;
}

export function parseArgs(
  argv: string[],
  environment: NodeJS.ProcessEnv = process.env,
): LabConfig | { help: true } {
  const values = collectArguments(argv);
  if (values.has('help')) return { help: true };

  const rawUrl = values.get('url') ?? environment.SCALEFORGE_LAB_URL;
  const url = typeof rawUrl === 'string' ? rawUrl : 'http://localhost:3000/v1/health/live';
  try {
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('unsupported protocol');
  } catch {
    throw new Error('--url must be a valid HTTP(S) URL');
  }

  const sloP99 = values.has('slo-p99') ? readNumber(values, 'slo-p99', 0, { min: 0 }) : undefined;
  const maxErrorRate = values.has('max-error-rate')
    ? readNumber(values, 'max-error-rate', 0, { min: 0, max: 1 })
    : undefined;

  return {
    url,
    ratePerSecond: readNumber(values, 'rate', 5, { min: 0.1 }),
    durationSeconds: readNumber(values, 'duration', 10, { min: 0.1 }),
    warmupSeconds: readNumber(values, 'warmup', 2, { min: 0 }),
    concurrency: Math.floor(readNumber(values, 'concurrency', 10, { min: 1 })),
    timeoutMs: readNumber(values, 'timeout', 2_000, { min: 1 }),
    json: values.has('json'),
    ...(sloP99 === undefined ? {} : { sloP99Ms: sloP99 }),
    ...(maxErrorRate === undefined ? {} : { maxErrorRate }),
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function executeRequest(config: LabConfig): Promise<RequestSample> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const token = process.env.SCALEFORGE_LAB_TOKEN;

  try {
    const response = await fetch(config.url, {
      headers: {
        accept: 'application/json',
        'x-correlation-id': `scaling-lab-${randomUUID()}`,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return { durationMs: performance.now() - started, status: response.status };
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return { durationMs: performance.now() - started, error: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runPhase(
  durationSeconds: number,
  ratePerSecond: number,
  concurrency: number,
  request: RequestExecutor,
): Promise<PhaseResult> {
  const started = performance.now();
  const deadline = started + durationSeconds * 1_000;
  const intervalMs = 1_000 / ratePerSecond;
  const samples: RequestSample[] = [];
  const active = new Set<Promise<void>>();
  let scheduled = 0;
  let clientBackpressureDrops = 0;

  while (true) {
    const scheduledAt = started + scheduled * intervalMs;
    const waitMs = scheduledAt - performance.now();
    if (waitMs > 0) await delay(waitMs);
    if (performance.now() >= deadline) break;
    scheduled += 1;

    if (active.size >= concurrency) {
      clientBackpressureDrops += 1;
      continue;
    }

    const task: Promise<void> = request()
      .then((sample) => {
        samples.push(sample);
      })
      .finally(() => active.delete(task));
    active.add(task);
  }

  await Promise.all(active);
  return {
    samples,
    scheduled,
    clientBackpressureDrops,
    elapsedMs: performance.now() - started,
  };
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
  return Number(sorted[index]?.toFixed(2));
}

function latencySummary(samples: RequestSample[]): LatencySummary {
  const values = samples.map((sample) => sample.durationMs);
  if (values.length === 0) return { min: null, p50: null, p95: null, p99: null, max: null };
  return {
    min: Number(Math.min(...values).toFixed(2)),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: Number(Math.max(...values).toFixed(2)),
  };
}

export function summarize(config: LabConfig, phase: PhaseResult): LabReport {
  const successfulSamples = phase.samples.filter(
    (sample) => sample.status !== undefined && sample.status >= 200 && sample.status < 400,
  );
  const httpFailures = phase.samples.filter(
    (sample) => sample.status !== undefined && (sample.status < 200 || sample.status >= 400),
  ).length;
  const networkFailures = phase.samples.filter((sample) => sample.error === 'network').length;
  const timeouts = phase.samples.filter((sample) => sample.error === 'timeout').length;
  const completed = phase.samples.length;
  const failures = httpFailures + networkFailures + timeouts;
  const statusCodes: Record<string, number> = {};
  for (const sample of phase.samples) {
    if (sample.status !== undefined) {
      const key = String(sample.status);
      statusCodes[key] = (statusCodes[key] ?? 0) + 1;
    }
  }

  const thresholdFailures: string[] = [];
  const successfulLatency = latencySummary(successfulSamples);
  const errorRate = completed === 0 ? 1 : failures / completed;
  if (config.sloP99Ms !== undefined) {
    if (successfulLatency.p99 === null || successfulLatency.p99 > config.sloP99Ms) {
      thresholdFailures.push(
        `successful p99 ${successfulLatency.p99 ?? 'unavailable'}ms exceeds ${config.sloP99Ms}ms`,
      );
    }
  }
  if (config.maxErrorRate !== undefined && errorRate > config.maxErrorRate) {
    thresholdFailures.push(
      `error rate ${(errorRate * 100).toFixed(2)}% exceeds ${(config.maxErrorRate * 100).toFixed(2)}%`,
    );
  }
  if (phase.clientBackpressureDrops > 0) {
    thresholdFailures.push(
      `${phase.clientBackpressureDrops} scheduled requests were not started because the concurrency limit was full`,
    );
  }

  return {
    target: config.url,
    workload: {
      offeredRatePerSecond: config.ratePerSecond,
      durationSeconds: config.durationSeconds,
      concurrencyLimit: config.concurrency,
      timeoutMs: config.timeoutMs,
    },
    traffic: {
      scheduled: phase.scheduled,
      completed,
      successful: successfulSamples.length,
      httpFailures,
      networkFailures,
      timeouts,
      clientBackpressureDrops: phase.clientBackpressureDrops,
      achievedRequestsPerSecond: Number((completed / (phase.elapsedMs / 1_000)).toFixed(2)),
      errorRate: Number(errorRate.toFixed(4)),
    },
    statusCodes,
    latencyMs: latencySummary(phase.samples),
    successfulLatencyMs: successfulLatency,
    thresholds: {
      configured: config.sloP99Ms !== undefined || config.maxErrorRate !== undefined,
      passed: thresholdFailures.length === 0,
      failures: thresholdFailures,
    },
  };
}

function formatReport(report: LabReport): string {
  const latency = report.successfulLatencyMs;
  const statuses = Object.entries(report.statusCodes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}=${count}`)
    .join(', ');
  const lines = [
    'ScaleForge scaling lab',
    `Target: ${report.target}`,
    `Workload: ${report.workload.offeredRatePerSecond} req/s for ${report.workload.durationSeconds}s, concurrency <= ${report.workload.concurrencyLimit}`,
    `Traffic: scheduled=${report.traffic.scheduled}, completed=${report.traffic.completed}, successful=${report.traffic.successful}, achieved=${report.traffic.achievedRequestsPerSecond} req/s`,
    `Status: ${statuses || 'none'}; network=${report.traffic.networkFailures}, timeouts=${report.traffic.timeouts}, client-dropped=${report.traffic.clientBackpressureDrops}`,
    `Successful latency (ms): min=${latency.min ?? '-'}, p50=${latency.p50 ?? '-'}, p95=${latency.p95 ?? '-'}, p99=${latency.p99 ?? '-'}, max=${latency.max ?? '-'}`,
    `Error rate: ${(report.traffic.errorRate * 100).toFixed(2)}%`,
    `Thresholds: ${
      !report.thresholds.configured && report.thresholds.failures.length === 0
        ? 'NOT SET'
        : report.thresholds.passed
          ? 'PASS'
          : `FAIL - ${report.thresholds.failures.join('; ')}`
    }`,
  ];
  return lines.join('\n');
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);
  if ('help' in parsed) {
    console.info(USAGE);
    return;
  }

  const request = () => executeRequest(parsed);
  if (parsed.warmupSeconds > 0) {
    console.error(`Warming up for ${parsed.warmupSeconds}s (samples are discarded)...`);
    await runPhase(parsed.warmupSeconds, parsed.ratePerSecond, parsed.concurrency, request);
  }
  const phase = await runPhase(
    parsed.durationSeconds,
    parsed.ratePerSecond,
    parsed.concurrency,
    request,
  );
  const report = summarize(parsed, phase);
  console.info(parsed.json ? JSON.stringify(report, null, 2) : formatReport(report));
  if (!report.thresholds.passed) process.exitCode = 2;
}

const entryPoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPoint === import.meta.url) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
