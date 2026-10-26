import { collectDartSchedule } from './dart/collect.ts';
import { DartError } from './dart/client.ts';
import { publishSnapshot, snapshotPath } from './snapshot.ts';
import type { ScheduleResponse } from '../shared/schedule.ts';

interface Options {
  fetcher?: typeof fetch; now?: () => number; key?: () => string | undefined;
  snapshotPath?: string | null; lookbackDays?: number; delayMs?: number;
  collect?: typeof collectDartSchedule;
}
/** Explicit collector, run only by the Ubuntu timer or the operator's sync command. */
export function createFeed(options: Options = {}) {
  let pending: Promise<ScheduleResponse> | undefined;
  async function sync() {
    const key = (options.key ? options.key() : process.env.DART_API_KEY)?.trim();
    if (!key) throw new DartError('DART_KEY_MISSING');
    if (!/^[a-zA-Z0-9]{40}$/.test(key)) throw new DartError('DART_KEY_INVALID');
    if (!pending) pending = (async () => {
      try {
        const result = await (options.collect ?? collectDartSchedule)({ key,
          fetcher: options.fetcher, now: options.now, delayMs: options.delayMs,
          lookbackDays: options.lookbackDays ?? Number(process.env.DART_LOOKBACK_DAYS || 180) });
        const path = options.snapshotPath === undefined ? snapshotPath() : options.snapshotPath;
        if (path) await publishSnapshot(path, result);
        return result;
      } catch (error) { throw new DartError(error instanceof DartError ? error.code : 'DART_SYNC_FAILED'); }
    })().finally(() => { pending = undefined; });
    return pending;
  }
  return { sync };
}
