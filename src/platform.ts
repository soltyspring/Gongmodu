import { Device, Environment, SafeArea, Screen, graniteEvent, loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';

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

/** Console ad group for the company report. Unset means the report opens without an ad. */
export const reportAdGroupId = (import.meta.env.VITE_REPORT_AD_GROUP_ID || '').trim();
export const reportNeedsAd = () => !!reportAdGroupId && isNativeToss() && showFullScreenAd.isSupported() && loadFullScreenAd.isSupported();
/**
 * Shows the full-screen ad the CTA announced, then resolves. An ad that fails to load or show
 * still resolves: the user asked for the report and must never be stuck behind an ad error.
 */
export function showReportAd(): Promise<void> {
  if (!reportNeedsAd()) return Promise.resolve();
  return new Promise(resolve => {
    let done = false, stopShow: (() => void) | undefined;
    const finish = () => { if (done) return; done = true; stopLoad(); stopShow?.(); resolve(); };
    const timer = setTimeout(finish, 8000);
    const stopLoad = loadFullScreenAd({ options: { adGroupId: reportAdGroupId }, onError: () => { clearTimeout(timer); finish(); }, onEvent: event => {
      if (event.type !== 'loaded') return;
      clearTimeout(timer);
      stopShow = showFullScreenAd({ options: { adGroupId: reportAdGroupId }, onError: finish, onEvent: shown => {
        if (shown.type === 'dismissed' || shown.type === 'failedToShow') finish();
      } });
    } });
  });
}
