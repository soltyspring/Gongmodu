import { useState } from 'react';
import type { ScheduleEvent } from '../shared/schedule';
import { parsePreparation, preparationKey, preparationSteps, preparationStorageKey, type PreparationStep } from './preparation';

export function PreparationChecklist({ event }: { event: ScheduleEvent }) {
  const [all, setAll] = useState(() => {
    try { return parsePreparation(localStorage.getItem(preparationStorageKey)); } catch { return {}; }
  });
  const [error, setError] = useState('');
  const key = preparationKey(event);
  const checked = all[key] ?? [];
  function toggle(step: PreparationStep) {
    const nextSteps = checked.includes(step) ? checked.filter(item => item !== step) : [...checked, step];
    const next = Object.fromEntries([...Object.entries(all).filter(([id]) => id !== key).slice(-99), [key, nextSteps]]);
    try {
      localStorage.setItem(preparationStorageKey, JSON.stringify(next));
      setAll(next); setError('');
    } catch { setError('확인 기록을 저장하지 못했어요. 기기 저장 공간을 확인해 주세요.'); }
  }
  return <section className="preparation-section" aria-label="나의 청약 준비">
    <div className="section-heading"><h3>나의 청약 준비</h3><span className="preparation-count">{checked.length} / {preparationSteps.length} 확인</span></div>
    <p className="preparation-description">직접 확인한 항목을 체크해 두세요.</p>
    <div className="preparation-progress" role="progressbar" aria-label="청약 준비 확인" aria-valuemin={0} aria-valuemax={3} aria-valuenow={checked.length}><span style={{ width: `${checked.length / 3 * 100}%` }} /></div>
    {preparationSteps.map(step => <label className="preparation-step" key={step.id}>
      <input type="checkbox" checked={checked.includes(step.id)} onChange={() => toggle(step.id)} />
      <span><strong>{step.title}</strong><span>{step.description}</span></span>
    </label>)}
    <p className="small-note">이 기기에만 저장해요. 청약 신청 여부와는 달라요. 정정 공시가 나오면 다시 확인해 주세요.</p>
    {error && <p className="small-note" role="alert">{error}</p>}
  </section>;
}
