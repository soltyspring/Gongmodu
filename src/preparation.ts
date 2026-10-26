import type { ScheduleEvent } from '../shared/schedule';

export const preparationSteps = [
  { id: 'account', title: '계좌와 청약 자격 확인', description: '주관사에서 계좌 개설 기한과 청약 자격을 확인해요.' },
  { id: 'deposit', title: '증거금과 수수료 확인', description: '신청할 수량에 필요한 금액을 증권사에서 확인해요.' },
  { id: 'document', title: '투자설명서 읽기', description: '공시의 투자위험과 청약 조건을 확인해요.' },
] as const;
export type PreparationStep = typeof preparationSteps[number]['id'];
export type Preparation = Record<string, PreparationStep[]>;
export const preparationStorageKey = 'gongmodu:preparation:v1';
// A correction starts a new checklist: previous checks must not imply revised terms were reviewed.
export function preparationKey(event: ScheduleEvent) {
  return `${event.disclosure?.offeringId ?? event.id}:${event.disclosure?.receiptNo ?? event.updatedAt ?? event.start}`;
}
export function parsePreparation(raw: string | null): Preparation {
  try {
    const data: unknown = JSON.parse(raw ?? '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).slice(-100).filter(([key, steps]) =>
      key.length <= 300 && Array.isArray(steps) && steps.every(step => preparationSteps.some(item => item.id === step)))
      .map(([key, steps]) => [key, [...new Set(steps as PreparationStep[])]]));
  } catch { return {}; }
}
