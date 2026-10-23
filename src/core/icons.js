/* ---------- icons: inlined Lucide subset (src/00-icons.js), rendered to inline svg ---------- */
import { ICONS } from 'virtual:icons';
import { esc } from './utils.js';

export const _icCache = {};
export function ic(name, size = 16, cls = '') {
  const k = name + '|' + size + '|' + cls;
  if (_icCache[k]) return _icCache[k];
  const inner = ICONS[name] || '<rect x="5" y="5" width="14" height="14" rx="3"/>';
  return (_icCache[k] =
    `<svg class="i ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`);
}
/* App mark: the focus ring (same artwork as public/favicon.svg and src-tauri/icons/app-icon.svg). */
export const LOGO = (px = 22) =>
  `<svg class="logo" width="${px}" height="${px}" viewBox="0 0 120 120" role="img" aria-label="Stint"><rect width="120" height="120" rx="27" fill="#1D1C1A"/><circle cx="60" cy="60" r="32" fill="none" stroke="#33323A" stroke-width="12"/><circle cx="60" cy="60" r="32" fill="none" stroke="#7C83F7" stroke-width="12" stroke-linecap="round" stroke-dasharray="150 201" transform="rotate(-90 60 60)"/></svg>`;
export function wsLogo(w, px = 22) {
  return w && w.brand
    ? `<span class="ws-logo brand" style="width:${px}px;height:${px}px">${LOGO(px)}</span>`
    : `<span class="ws-logo" style="--c:${w.c};width:${px}px;height:${px}px;font-size:${Math.max(9, Math.round(px * 0.46))}px">${esc(w.name[0])}</span>`;
}
