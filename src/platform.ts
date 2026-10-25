import { Device, Environment, SafeArea, Screen, graniteEvent } from '@apps-in-toss/web-framework';

export function isNativeToss() {
  try { return /^\d+\.\d+/.test(Environment.tossAppVersion); } catch { return false; }
}
export function connectNative(onBack: () => void) {
  if (!isNativeToss()) return () => {};
  document.documentElement.dataset.native = 'true';
  const applyInsets = (insets: { top: number; bottom: number }) => {
    document.documentElement.style.setProperty('--safe-top', `${insets.top}px`);
    document.documentElement.style.setProperty('--safe-bottom', `${insets.bottom}px`);
  };
  applyInsets(SafeArea.get());
  const unsubscribeInsets = SafeArea.subscribe({ onEvent: applyInsets });
  const unsubscribeBack = graniteEvent.addEventListener('backEvent', { onEvent: onBack });
  const unsubscribeHome = graniteEvent.addEventListener('homeEvent', { onEvent: () => { void Screen.close(); } });
  return () => { unsubscribeInsets(); unsubscribeBack(); unsubscribeHome(); };
}
export const closeNative = () => Screen.close();
export async function openExternal(url: string) {
  if (!/^https:\/\//.test(url)) return;
  if (isNativeToss()) await Device.openURL(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
