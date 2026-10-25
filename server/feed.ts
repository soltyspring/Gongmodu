import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isScheduleEvent, type ScheduleResponse } from '../shared/schedule.ts';
import { collectDartSchedule } from './dart/collect.ts';
import { DartError } from './dart/client.ts';

interface Options {
  fetcher?: typeof fetch; now?: () => number; key?: () => string | undefined;
  snapshotPath?: string | null; ttlMs?: number; lookbackDays?: number; delayMs?: number;
  collect?: typeof collectDartSchedule;
}
export function createFeed(options: Options = {}) {
  const now = options.now ?? Date.now;
  const key = options.key ?? (() => process.env.DART_API_KEY);
  const snapshotPath = options.snapshotPath === undefined ? '.cache/dart-schedule.json' : options.snapshotPath;
  const ttl = options.ttlMs ?? 60 * 60_000;
  const collect = options.collect ?? collectDartSchedule;
  let cache: ScheduleResponse | undefined;
  let pending: Promise<ScheduleResponse> | undefined;
  let lastError: string | null = null;
  let lastAttempt = -Infinity;
  let progress = { done: 0, total: 0 };
  const ready = (async () => {
    if (!snapshotPath) return;
    try {
      const saved = JSON.parse(await readFile(snapshotPath, 'utf8'));
      if (saved.version === 2 && Array.isArray(saved.data?.events) && saved.data.events.every((e: unknown) => isScheduleEvent(e) && e.disclosure && /^\d{14}$/.test(e.disclosure.receiptNo)) && Number.isFinite(Date.parse(saved.data.fetchedAt))) cache = saved.data;
    } catch { /* Missing/corrupt snapshots never become fabricated data. */ }
  })();
  async function sync() {
    await ready;
    const apiKey = key()?.trim();
    if (!apiKey) throw new DartError('DART_KEY_MISSING');
    if (!/^[a-zA-Z0-9]{40}$/.test(apiKey)) throw new DartError('DART_KEY_INVALID');
    if (!pending) {
      lastAttempt = now(); lastError = null; progress = { done: 0, total: 0 };
      pending = collect({ key: apiKey, fetcher: options.fetcher, now, lookbackDays: options.lookbackDays ?? Number(process.env.DART_LOOKBACK_DAYS || 180), delayMs: options.delayMs, progress: (done, total) => { progress = { done, total }; } }).then(async result => {
        if (snapshotPath) {
          await mkdir(dirname(snapshotPath), { recursive: true });
          await writeFile(`${snapshotPath}.tmp`, JSON.stringify({ version: 2, data: result }), { mode: 0o600 });
          await rename(`${snapshotPath}.tmp`, snapshotPath);
        }
        cache = result; return result;
      }).catch(error => {
        lastError = error instanceof DartError ? error.code : 'DART_SYNC_FAILED';
        throw new DartError(lastError);
      }).finally(() => { pending = undefined; });
    }
    return pending;
  }
  const get = async (): Promise<ScheduleResponse> => {
    await ready;
    if (!key()?.trim()) {
      if (cache) return { ...cache, stale: true };
      throw new DartError('DART_KEY_MISSING');
    }
    if (!/^[a-zA-Z0-9]{40}$/.test(key()!.trim())) throw new DartError('DART_KEY_INVALID');
    if (cache && now() - Date.parse(cache.fetchedAt) < ttl && !lastError) return cache;
    if (!pending && now() - lastAttempt >= 60_000) void sync().catch(() => {});
    if (cache) return { ...cache, stale: true };
    if (lastError && !pending) throw new DartError(lastError);
    throw new DartError('DART_SYNCING');
  };
  return Object.assign(get, { sync, status: () => ({ source: 'dart', configured: !!key()?.trim(), syncing: !!pending, progress, lastFetchedAt: cache?.fetchedAt ?? null, lastErrorCode: lastError, quality: cache?.quality ?? null }) });
}
