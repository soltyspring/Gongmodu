import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePreparation, preparationKey } from '../src/preparation.ts';
import type { ScheduleEvent } from '../shared/schedule.ts';

test('malformed local preparation is ignored and corrections get a fresh checklist', () => {
  assert.deepEqual(parsePreparation('{'), {});
  assert.deepEqual(parsePreparation('{"good":["account","account"],"bad":["submitted"]}'), { good: ['account'] });
  const event = { id: 'a', disclosure: { offeringId: 'offering', receiptNo: '20261022000123' } } as ScheduleEvent;
  const corrected = { ...event, disclosure: { ...event.disclosure!, receiptNo: '20261026000123' } };
  assert.notEqual(preparationKey(event), preparationKey(corrected));
});
