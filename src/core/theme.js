/* ---------- theme ---------- */
import { setDateFormat } from './utils.js';
import { S } from './store.js';

export function applyPrefs() {
  const r = document.documentElement,
    p = S.prefs;
  setDateFormat(p.dateFmt);
  if (p.theme === 'system') r.removeAttribute('data-theme');
  else r.setAttribute('data-theme', p.theme);
  if (p.accent === 'indigo') r.removeAttribute('data-accent');
  else r.setAttribute('data-accent', p.accent);
  r.setAttribute('data-side', p.side);
  r.setAttribute('data-density', p.density);
  if (p.motion === 'reduce') r.setAttribute('data-motion', 'reduce');
  else r.removeAttribute('data-motion');
  r.style.setProperty('--glass-tint', (p.glass || 0) + '%');
  // Mac app: the window's glass follows macOS appearance, so pin it to the app's theme.
  if (window.__TAURI_INTERNALS__)
    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().setTheme(p.theme === 'system' ? null : p.theme));
}
export function effectiveDark() {
  if (S.prefs.theme === 'dark') return true;
  if (S.prefs.theme === 'light') return false;
  return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
}
