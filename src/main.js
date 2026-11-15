import './styles.css';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { App as CapApp } from '@capacitor/app';
import { kvGet, kvSet, photoGet, photoSet, photoDel } from './db.js';
import { ic } from './icons.js';
import { summarizeNotes, askAboutNote, testKey } from './ai.js';

const NATIVE = Capacitor.isNativePlatform();
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const DAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
const DAYS_FULL = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const plural = (n, a, b, c) => (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);

/* ======================= STATE ======================= */
const COLORS = ['#2f6bff', '#0891b2', '#f97316', '#eab308', '#16a34a', '#0ea5e9', '#6366f1', '#64748b', '#ef4444', '#14b8a6'];
const ACCENTS = [['Niebieski', '#2f6bff'], ['Zielony', '#16a34a'], ['Pomarańczowy', '#f97316'], ['Czerwony', '#ef4444'], ['Turkusowy', '#0891b2'], ['Grafit', '#27272a']];
const EMOJIS = ['📘', '🚑', '❤️‍🩹', '⚖️', '🇪🇸', '🇫🇷', '🔧', '🤔', '🧭', '🛠️', '📐', '🧪', '🧬', '🌍', '🏛️', '🇬🇧', '🇩🇪', '💻', '⚽', '🎨', '🎵', '⚛️', '📖', '✝️', '🧠', '💼', '🔢', '🧲', '🌱', '📝', '🎭', '🏥', '⭐'];
const SUBJECT_LIST = [
  ['Polski', '📖'], ['Matematyka', '📐'], ['Angielski', '🇬🇧'], ['Niemiecki', '🇩🇪'], ['Hiszpański', '🇪🇸'], ['Francuski', '🇫🇷'], ['Rosyjski', '🇷🇺'], ['Włoski', '🇮🇹'], ['Łacina', '🏺'],
  ['Historia', '🏛️'], ['HiT', '📰'], ['WOS', '⚖️'], ['Edukacja obywatelska', '🗳️'], ['Biznes i zarządzanie', '💼'], ['Podstawy przedsiębiorczości', '📈'],
  ['Biologia', '🧬'], ['Chemia', '🧪'], ['Fizyka', '⚛️'], ['Geografia', '🌍'], ['Przyroda', '🌱'], ['Astronomia', '🔭'],
  ['Informatyka', '💻'], ['Technika', '🔧'], ['EDB', '🚑'], ['Edukacja zdrowotna', '❤️‍🩹'], ['WDŻ', '👪'],
  ['WF', '⚽'], ['Plastyka', '🎨'], ['Muzyka', '🎵'], ['Wiedza o kulturze', '🎭'], ['Historia sztuki', '🖼️'], ['Filozofia', '🤔'],
  ['Religia', '✝️'], ['Etyka', '🧭'], ['Godzina wychowawcza', '🏫'], ['Doradztwo zawodowe', '🧑‍💼'], ['Przedmioty zawodowe', '🛠️'], ['Zajęcia dodatkowe', '⭐'],
];
const defaultSubjects = () => SUBJECT_LIST.map(([name, emoji], i) => ({ id: uid(), name, emoji, color: COLORS[i % COLORS.length] }));

const TYPES = [
  { id: 'test', name: 'Sprawdzian', emoji: '📝' },
  { id: 'quiz', name: 'Kartkówka', emoji: '⚡' },
  { id: 'hw', name: 'Zadanie', emoji: '📚' },
  { id: 'project', name: 'Projekt', emoji: '🎯' },
  { id: 'other', name: 'Inne', emoji: '📌' },
];
const REMIND = [
  { id: 'at', name: 'O czasie' }, { id: '60', name: 'Godzinę przed' },
  { id: 'eve', name: 'Dzień przed (18:00)' }, { id: 'morning', name: 'Rano (7:00)' }, { id: 'none', name: 'Bez powiadomienia' },
];

let S = null;
const blank = () => ({
  v: 1, name: '', theme: 'auto', accent: '#2f6bff', apiKey: '', model: 'claude-haiku-5-5', aiProvider: 'gemini', geminiKey: '', geminiModel: 'gemini-flash-latest',
  subjects: defaultSubjects(), reminders: [], notes: [], cards: {}, timetable: { 1: [], 2: [], 3: [], 4: [], 5: [] },
  grades: [], subjVer: 2, focus: {}, activity: {}, focusCfg: { work: 25, brk: 5 }, vacation: '2027-06-25', digest: true, onboarded: false,
});

let saveT;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => kvSet('state', S).catch(console.error), 250);
}
const subj = (id) => S.subjects.find((s) => s.id === id);
const aiCfg = () => (S.aiProvider === 'claude' ? { provider: 'claude', key: S.apiKey, model: S.model } : { provider: 'gemini', key: S.geminiKey, model: S.geminiModel });
function subjOrder() {
  const score = {};
  const bump = (id, k) => id && (score[id] = (score[id] || 0) + k);
  Object.values(S.timetable).flat().forEach((l) => bump(l.subjectId, 3));
  S.grades.forEach((g) => bump(g.subjectId, 2));
  S.notes.forEach((n) => bump(n.subjectId, 2));
  S.reminders.forEach((r) => bump(r.subjectId, 1));
  return S.subjects.map((s, i) => ({ s, i })).sort((a, b) => (score[b.s.id] || 0) - (score[a.s.id] || 0) || a.i - b.i).map((x) => x.s);
}
const hasAI = () => !!aiCfg().key;
const markActive = () => { S.activity[ymd()] = true; save(); };

/* ======================= UTIL UI ======================= */
async function haptic(kind = 'light') {
  if (!NATIVE) return;
  try {
    if (kind === 'success') await Haptics.notification({ type: NotificationType.Success });
    else if (kind === 'warn') await Haptics.notification({ type: NotificationType.Warning });
    else await Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch {}
}

let toastT;
function toast(msg, action, fn) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.append(t); }
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { fn(); t.classList.remove('in'); };
  requestAnimationFrame(() => t.classList.add('in'));
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('in'), action ? 4000 : 2400);
}

function confetti(x = innerWidth / 2, y = innerHeight / 2, n = 90) {
  const c = document.createElement('canvas');
  c.id = 'confetti'; c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
  c.style.width = '100%'; c.style.height = '100%';
  document.body.append(c);
  const g = c.getContext('2d'); g.scale(devicePixelRatio, devicePixelRatio);
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const cols = [acc, '#facc15', '#22c55e', '#38bdf8', '#f97316'];
  const ps = Array.from({ length: n }, () => {
    const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 9;
    return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, r: Math.random() * 6 + 3, c: cols[(Math.random() * cols.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, s: Math.random() > 0.5 };
  });
  let f = 0;
  (function tick() {
    g.clearRect(0, 0, innerWidth, innerHeight);
    ps.forEach((p) => {
      p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = Math.max(0, 1 - f / 110); g.fillStyle = p.c;
      if (p.s) g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); else { g.beginPath(); g.arc(0, 0, p.r / 2.4, 0, 7); g.fill(); }
      g.restore();
    });
    if (++f < 110) requestAnimationFrame(tick); else c.remove();
  })();
}

function countUp(el, to, dec = 0, dur = 900) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = (to * e).toFixed(dec).replace('.', ',');
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---- sheet ---- */
let sheetStack = [];
function openSheet(html, mount) {
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const sh = document.createElement('div'); sh.className = 'sheet';
  sh.innerHTML = `<div class="grab"></div>${html}`;
  document.body.append(scrim, sh);
  requestAnimationFrame(() => { scrim.classList.add('in'); sh.classList.add('in'); });
  const close = () => {
    sheetStack = sheetStack.filter((x) => x !== close);
    scrim.classList.remove('in'); sh.classList.remove('in');
    setTimeout(() => { scrim.remove(); sh.remove(); }, 450);
  };
  scrim.onclick = close;
  // drag to dismiss
  let y0 = null, dy = 0;
  sh.addEventListener('touchstart', (e) => { if (sh.scrollTop <= 0) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
  sh.addEventListener('touchmove', (e) => {
    if (y0 == null) return; dy = e.touches[0].clientY - y0;
    if (dy > 0) { sh.style.transition = 'none'; sh.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  sh.addEventListener('touchend', () => {
    if (y0 == null) return; sh.style.transition = ''; sh.style.transform = '';
    if (dy > 110) close(); y0 = null;
  });
  sheetStack.push(close);
  mount && mount(sh, close);
  haptic();
  return close;
}

/* ---- pages (stack) ---- */
let pages = [];
function openPage(title, render, action) {
  const p = document.createElement('div'); p.className = 'page';
  $('#app').append(p);
  const obj = { el: p, title, render, action, onClose: null };
  obj.refresh = () => {
    const st = p.scrollTop;
    p.innerHTML = `<div class="page-bar ${action ? 'has-action' : ''}"><button class="iconbtn" data-back>${ic('back')}</button><h2>${esc(obj.title)}</h2>${action ? action.html : ''}</div><div class="pc"></div>`;
    p.querySelector('[data-back]').onclick = closePage;
    if (action) p.querySelector('[data-action]').onclick = action.fn;
    render($('.pc', p), obj);
    p.scrollTop = st;
  };
  obj.refresh();
  pages.push(obj);
  requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('in')));
  haptic();
  return obj;
}
function closePage() {
  const o = pages.pop(); if (!o) return;
  o.onClose && o.onClose();
  o.el.classList.remove('in');
  setTimeout(() => o.el.remove(), 460);
  pages.at(-1)?.refresh();
  if (!pages.length) render();
}

/* ======================= THEME ======================= */
const mq = matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const dark = S.theme === 'dark' || (S.theme === 'auto' && mq.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.setProperty('--accent', S.accent);
  if (NATIVE) SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
}
mq.addEventListener?.('change', () => S && applyTheme());

/* ======================= NOTIFICATIONS ======================= */
const nid = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h % 2000000000) + 10; };
let notifOk = null;
async function ensureNotif() {
  if (!NATIVE) return false;
  if (notifOk) return true;
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
    notifOk = p.display === 'granted';
  } catch { notifOk = false; }
  return notifOk;
}
function fireTime(r) {
  const due = new Date(r.due);
  if (r.remind === 'none') return null;
  if (r.remind === '60') return new Date(due - 3600e3);
  if (r.remind === 'eve') { const d = new Date(due); d.setDate(d.getDate() - 1); d.setHours(18, 0, 0, 0); return d; }
  if (r.remind === 'morning') { const d = new Date(due); d.setHours(7, 0, 0, 0); return d; }
  return due;
}
async function scheduleReminder(r) {
  if (!NATIVE) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: nid(r.id) }] });
    const at = fireTime(r);
    if (r.done || !at || at <= new Date()) return;
    if (!(await ensureNotif())) return;
    const t = TYPES.find((x) => x.id === r.type) || TYPES[4];
    const s = subj(r.subjectId);
    await LocalNotifications.schedule({
      notifications: [{
        id: nid(r.id), title: `${t.emoji} ${t.name}${s ? ' · ' + s.name : ''}`,
        body: `${r.title} — ${relWhen(new Date(r.due), true)}`,
        schedule: { at, allowWhileIdle: true }, smallIcon: 'ic_stat_icon', iconColor: S.accent, extra: { rid: r.id },
      }],
    });
  } catch (e) { console.warn(e); }
}
async function cancelReminder(r) { if (NATIVE) try { await LocalNotifications.cancel({ notifications: [{ id: nid(r.id) }] }); } catch {} }
async function scheduleDigest() {
  if (!NATIVE) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: 5 }] });
    if (!S.digest) return;
    const p = await LocalNotifications.checkPermissions(); if (p.display !== 'granted') return;
    const at = new Date(); at.setHours(19, 0, 0, 0); if (at <= new Date()) at.setDate(at.getDate() + 1);
    const tom = new Date(at); tom.setDate(tom.getDate() + 1);
    const items = S.reminders.filter((r) => !r.done && r.due.slice(0, 10) === ymd(tom));
    const lessons = (S.timetable[tom.getDay()] || []).length;
    let body = items.length ? `Jutro: ${items.map((r) => r.title).slice(0, 3).join(', ')}${items.length > 3 ? '…' : ''}` : 'Na jutro nic nie ma w przypominajkach. Spakuj plecak 🎒';
    if (lessons) body += ` · ${lessons} ${plural(lessons, 'lekcja', 'lekcje', 'lekcji')}`;
    await LocalNotifications.schedule({ notifications: [{ id: 5, title: '🌙 Wieczorny przegląd', body, schedule: { at, allowWhileIdle: true }, smallIcon: 'ic_stat_icon', iconColor: S.accent }] });
  } catch {}
}

/* ======================= DATES ======================= */
function dayDiff(d) { const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(d); b.setHours(0, 0, 0, 0); return Math.round((b - a) / 864e5); }
function relWhen(d, long = false) {
  const dd = dayDiff(d), t = hm(d);
  const now = new Date();
  if (d < now && dd <= 0) {
    if (dd === 0) return 'dziś ' + t;
    return dd === -1 ? 'wczoraj' : `${-dd} dni temu`;
  }
  if (dd === 0) { const m = Math.round((d - now) / 6e4); return m < 60 ? `za ${m} min` : `dziś ${t}`; }
  if (dd === 1) return long ? `jutro ${t}` : 'jutro';
  if (dd < 7) return long ? `${DAYS_FULL[d.getDay()]} ${t}` : `za ${dd} dni`;
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}
const fmtLong = (d) => `${DAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;

/* ======================= NAV / ROUTER ======================= */
const TABS = [
  { id: 'home', name: 'Dziś', icon: 'home' },
  { id: 'tasks', name: 'Zadania', icon: 'bell' },
  { id: 'notes', name: 'Notatki', icon: 'note' },
  { id: 'study', name: 'Nauka', icon: 'brain' },
  { id: 'more', name: 'Więcej', icon: 'grid' },
];
let tab = 'home';
function buildShell() {
  $('#app').innerHTML = `<div class="view" id="view"></div>
  <nav class="nav"><div class="ind"></div>${TABS.map((t) => `<button data-tab="${t.id}">${ic(t.icon)}<span>${t.name}</span></button>`).join('')}</nav>
  <button class="fab" id="fab">${ic('plus')}</button>`;
  $$('.nav button').forEach((b) => (b.onclick = () => go(b.dataset.tab)));
  $('#fab').onclick = () => (tab === 'notes' ? newNoteSheet() : reminderSheet());
  // hide nav on scroll down
  let last = 0;
  $('#view').addEventListener('scroll', (e) => {
    const y = e.target.scrollTop, dn = y > last && y > 80;
    $('.nav').classList.toggle('hide', dn); $('#fab').classList.toggle('hide', dn || !['home', 'tasks', 'notes'].includes(tab));
    last = y;
  }, { passive: true });
}
function go(t) {
  if (t === tab) { $('#view').scrollTo({ top: 0, behavior: 'smooth' }); return; }
  tab = t; haptic(); render(true);
}
function moveInd() {
  const i = TABS.findIndex((t) => t.id === tab);
  const b = $$('.nav button')[i];
  $('.nav .ind').style.left = b.offsetLeft + 'px';
  $$('.nav button').forEach((x, j) => x.classList.toggle('on', j === i));
  $('#fab').classList.toggle('hide', !['home', 'tasks', 'notes'].includes(tab));
}
function render(anim = false) {
  const v = $('#view');
  if (anim) { v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); v.scrollTop = 0; }
  ({ home: viewHome, tasks: viewTasks, notes: viewNotes, study: viewStudy, more: viewMore })[tab](v);
  moveInd();
}
const refreshAll = () => { pages.length ? pages.at(-1).refresh() : render(); };

/* ======================= HOME ======================= */
const QUOTES = [
  ['Małe kroki codziennie robią większą różnicę niż wielki zryw raz na miesiąc.', 'zasada 1%'],
  ['Nie musisz mieć ochoty. Wystarczy, że zaczniesz — ochota przyjdzie w trakcie.', 'reguła 5 minut'],
  ['Najlepszy moment na naukę był wczoraj. Drugi najlepszy jest teraz.', 'przysłowie, trochę przerobione'],
  ['Zrozumieć raz to lepiej niż wkuć dziesięć razy.', 'notatka na marginesie'],
  ['Przerwa to też część nauki. Mózg układa wtedy wszystko na półkach.', 'neuronauka w skrócie'],
  ['Zrób dziś coś, za co jutrzejszy ty powie dzięki.', 'przyszły ty'],
  ['Błąd na kartkówce to informacja, nie wyrok.', 'growth mindset'],
  ['Telefon w drugim pokoju = +20% skupienia. Serio.', 'tryb fokus'],
  ['Najtrudniejsza jest pierwsza strona. Potem już leci.', 'każdy uczeń kiedyś'],
  ['Powtórka po dniu, po trzech dniach i po tygodniu — i zostaje na zawsze.', 'krzywa zapominania'],
  ['Spokojnie. Jedna rzecz naraz.', 'oddech'],
  ['Nie porównuj swojego rozdziału 1 z czyimś rozdziałem 20.', 'perspektywa'],
];
function currentLessonInfo() {
  const now = new Date(), d = now.getDay(), m = now.getHours() * 60 + now.getMinutes();
  const today = [...(S.timetable[d] || [])].sort((a, b) => toMin(a.start) - toMin(b.start));
  const hasPlan = Object.values(S.timetable).some((x) => x.length);
  if (!hasPlan) return { kind: 'none' };
  const cur = today.find((l) => toMin(l.start) <= m && m < toMin(l.end));
  if (cur) return { kind: 'now', l: cur, left: toMin(cur.end) - m, prog: (m - toMin(cur.start)) / (toMin(cur.end) - toMin(cur.start)), next: today[today.indexOf(cur) + 1] };
  const nxt = today.find((l) => toMin(l.start) > m);
  if (nxt) return { kind: 'next', l: nxt, in: toMin(nxt.start) - m, isBreak: today.some((l) => toMin(l.end) <= m) };
  for (let i = 1; i <= 7; i++) {
    const dd = (d + i) % 7, ls = [...(S.timetable[dd] || [])].sort((a, b) => toMin(a.start) - toMin(b.start));
    if (ls.length) return { kind: 'free', l: ls[0], day: dd, i, count: ls.length };
  }
  return { kind: 'none' };
}
function streak() {
  let n = 0; const d = new Date();
  if (!S.activity[ymd(d)]) d.setDate(d.getDate() - 1);
  while (S.activity[ymd(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function heroHTML() {
  const c = currentLessonInfo();
  if (c.kind === 'none') return `<button class="hero press" data-go="timetable" style="width:100%;text-align:left"><div class="label">Plan lekcji</div><div class="big">Ustaw swój plan</div><div class="meta">Zobaczysz tu, co masz teraz i co dalej →</div></button>`;
  const s = subj(c.l.subjectId) || { name: '?', emoji: '📘' };
  if (c.kind === 'now') return `<div class="hero"><div class="label"><span class="live"></span>Teraz · do ${c.l.end}</div><div class="big">${s.emoji} ${esc(s.name)}</div><div class="meta">${c.l.room ? 'sala ' + esc(c.l.room) + ' · ' : ''}zostało ${c.left} min${c.next ? ` · potem ${esc(subj(c.next.subjectId)?.name || '')}` : ' · ostatnia lekcja 🎉'}</div><div class="bar"><i style="width:${(c.prog * 100).toFixed(1)}%"></i></div></div>`;
  if (c.kind === 'next') return `<div class="hero"><div class="label">${c.isBreak ? 'Przerwa · następna' : 'Pierwsza lekcja'}</div><div class="big">${s.emoji} ${esc(s.name)}</div><div class="meta">za ${c.in < 60 ? c.in + ' min' : Math.floor(c.in / 60) + ' h ' + (c.in % 60) + ' min'} · ${c.l.start}${c.l.room ? ' · sala ' + esc(c.l.room) : ''}</div></div>`;
  return `<div class="hero"><div class="label">Na dziś koniec 🎉</div><div class="big">${c.i === 1 ? 'Jutro' : DAYS_FULL[c.day][0].toUpperCase() + DAYS_FULL[c.day].slice(1)} ${s.emoji}</div><div class="meta">${c.count} ${plural(c.count, 'lekcja', 'lekcje', 'lekcji')} · start ${c.l.start} (${esc(s.name)})</div></div>`;
}
function overallAvg() {
  const avgs = S.subjects.map((s) => subjAvg(s.id)).filter((x) => x != null);
  return avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
}
function viewHome(v) {
  const h = new Date().getHours();
  const greet = h < 5 ? 'Dobranoc' : h < 12 ? 'Dzień dobry' : h < 18 ? 'Cześć' : 'Dobry wieczór';
  const pending = S.reminders.filter((r) => !r.done).sort((a, b) => a.due.localeCompare(b.due));
  const todayN = pending.filter((r) => dayDiff(new Date(r.due)) <= 0).length;
  const st = streak(), avg = overallAvg();
  const q = QUOTES[Math.floor(Date.now() / 864e5) % QUOTES.length];
  const vac = Math.max(0, dayDiff(new Date(S.vacation + 'T00:00')));
  const recent = S.notes.slice(0, 2);
  v.innerHTML = `
  <div class="hello"><div class="date">${fmtLong(new Date())}</div><h1 class="serif">${greet}${S.name ? ',<br><span>' + esc(S.name) + '</span>' : ''}</h1></div>
  <div class="stagger">
    ${heroHTML()}
    <div class="stats">
      <div class="stat"><b data-cu="${todayN}">0</b><span>na dziś</span></div>
      <div class="stat"><b data-cu="${st}">0</b><span>${ic('flame', 'style="width:12px;height:12px;display:inline;vertical-align:-1px;color:var(--warn)"')} seria dni</span></div>
      <div class="stat"><b ${avg != null ? `data-cu="${avg.toFixed(2)}" data-dec="2"` : ''}>${avg == null ? '–' : '0'}</b><span>średnia</span></div>
    </div>
    <div class="section-h"><h3>Szybko</h3></div>
    <div class="quick">
      <button data-q="task"><div class="ic">${ic('bell')}</div>Przypomnij</button>
      <button data-q="scan"><div class="ic">${ic('camera')}</div>Skanuj</button>
      <button data-q="focus"><div class="ic">${ic('timer')}</div>Fokus</button>
      <button data-q="cards"><div class="ic">${ic('cards')}</div>Fiszki</button>
    </div>
    <div class="section-h"><h3>Nadchodzące</h3>${pending.length ? `<button data-tabgo="tasks">Wszystkie</button>` : ''}</div>
    <div>${pending.length ? pending.slice(0, 4).map(remHTML).join('') : `<div class="card" style="text-align:center;padding:26px"><div style="font-size:30px">🌿</div><div style="font-weight:650;margin-top:6px">Czysto!</div><div class="muted" style="font-size:13px;margin-top:4px">Nic nie wisi nad głową. Dodaj coś przyciskiem +</div></div>`}</div>
    ${recent.length ? `<div class="section-h"><h3>Ostatnie notatki</h3><button data-tabgo="notes">Wszystkie</button></div><div class="notes-grid">${recent.map(noteCardHTML).join('')}</div>` : ''}
    <div class="section-h"><h3>Odliczanie</h3></div>
    <button class="card countdown press" data-go="settings" style="width:100%;text-align:left"><div class="num" data-cu="${vac}">0</div><div class="txt"><b>${plural(vac, 'dzień', 'dni', 'dni')} do wakacji ☀️</b>koniec roku szkolnego: ${new Date(S.vacation + 'T00:00').toLocaleDateString('pl-PL')}</div></button>
    <div class="card quote" style="margin-top:12px">„${esc(q[0])}”<small>— ${esc(q[1])}</small></div>
  </div>`;
  bindCommon(v);
  $$('[data-cu]', v).forEach((el) => countUp(el, parseFloat(el.dataset.cu), +(el.dataset.dec || 0)));
  $$('[data-q]', v).forEach((b) => (b.onclick = () => ({ task: () => reminderSheet(), scan: () => newNoteSheet(), focus: pageFocus, cards: () => pageFlashcards() })[b.dataset.q]()));
}

/* ======================= REMINDERS ======================= */
function remHTML(r) {
  const d = new Date(r.due), t = TYPES.find((x) => x.id === r.type) || TYPES[4], s = subj(r.subjectId);
  const late = !r.done && d < new Date(), soon = !r.done && !late && d - new Date() < 864e5 * 1.5;
  return `<div class="rem-wrap" data-rid="${r.id}"><div class="del-bg">${ic('trash')}</div>
  <div class="rem ${r.done ? 'done' : ''}"><span class="bar-c" style="background:${s?.color || 'var(--surface-3)'}"></span>
    <button class="check ${r.done ? 'on' : ''}" data-check>${ic('check')}</button>
    <div class="body" data-open><div class="t">${esc(r.title)}</div><div class="s"><span>${t.emoji} ${t.name}</span>${s ? `<span>· ${esc(s.name)}</span>` : ''}${r.note ? '<span>· 📎</span>' : ''}</div></div>
    <span class="when ${late ? 'late' : soon ? 'soon' : ''}">${r.done ? '✓' : relWhen(d)}</span>
  </div></div>`;
}
function bindRems(root) {
  $$('.rem-wrap', root).forEach((w) => {
    const id = w.dataset.rid, r = S.reminders.find((x) => x.id === id); if (!r) return;
    const card = $('.rem', w), bg = $('.del-bg', w);
    $('[data-check]', w).onclick = (e) => {
      e.stopPropagation();
      r.done = !r.done; r.doneAt = r.done ? Date.now() : null;
      const b = e.currentTarget; b.classList.toggle('on', r.done); card.classList.toggle('done', r.done);
      if (r.done) { const bb = b.getBoundingClientRect(); confetti(bb.x + 13, bb.y + 13, 40); haptic('success'); cancelReminder(r); markActive(); }
      else scheduleReminder(r);
      save(); scheduleDigest();
      setTimeout(refreshAll, 650);
    };
    $('[data-open]', w).onclick = () => reminderSheet(r);
    // swipe to delete
    let x0 = null, y0 = 0, dx = 0, lock = null;
    card.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; lock = null; }, { passive: true });
    card.addEventListener('touchmove', (e) => {
      if (x0 == null) return;
      const ddx = e.touches[0].clientX - x0, ddy = e.touches[0].clientY - y0;
      if (lock == null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) lock = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y';
      if (lock !== 'x') return;
      dx = Math.min(0, ddx); card.classList.add('swiping'); card.style.transform = `translateX(${dx}px)`;
      bg.style.opacity = Math.min(1, -dx / 90);
    }, { passive: true });
    card.addEventListener('touchend', () => {
      card.classList.remove('swiping');
      if (dx < -110) {
        haptic('medium'); card.style.transform = 'translateX(-110%)';
        setTimeout(() => { w.classList.add('removing'); }, 120);
        setTimeout(() => deleteReminder(r, true), 450);
      } else { card.style.transform = ''; bg.style.opacity = 0; }
      x0 = null;
    });
  });
}
function deleteReminder(r, undo) {
  const i = S.reminders.indexOf(r); if (i < 0) return;
  S.reminders.splice(i, 1); cancelReminder(r); save(); refreshAll(); scheduleDigest();
  if (undo) toast('Usunięto', 'Cofnij', () => { S.reminders.splice(i, 0, r); scheduleReminder(r); save(); refreshAll(); });
}
let taskFilter = 'all';
function viewTasks(v) {
  const now = new Date();
  let list = S.reminders.filter((r) => taskFilter === 'all' || r.type === taskFilter || (taskFilter.startsWith('s:') && r.subjectId === taskFilter.slice(2)));
  const pending = list.filter((r) => !r.done).sort((a, b) => a.due.localeCompare(b.due));
  const done = list.filter((r) => r.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 20);
  const groups = [['Po terminie', (r) => new Date(r.due) < now], ['Dziś', (r) => dayDiff(new Date(r.due)) === 0], ['Jutro', (r) => dayDiff(new Date(r.due)) === 1], ['Ten tydzień', (r) => dayDiff(new Date(r.due)) < 7], ['Później', () => true]];
  const used = new Set(); const out = [];
  groups.forEach(([name, f]) => { const g = pending.filter((r) => !used.has(r) && f(r)); g.forEach((r) => used.add(r)); if (g.length) out.push([name, g]); });
  const usedTypes = TYPES.filter((t) => S.reminders.some((r) => r.type === t.id));
  v.innerHTML = `
  <div class="title-row"><div><h1 class="serif">Zadania</h1><div class="sub">${pending.length} ${plural(pending.length, 'aktywne', 'aktywne', 'aktywnych')} · ${S.reminders.filter((r) => r.done).length} zrobionych</div></div></div>
  <div class="chips"><button class="chip ${taskFilter === 'all' ? 'on' : ''}" data-f="all">Wszystko</button>${usedTypes.map((t) => `<button class="chip ${taskFilter === t.id ? 'on' : ''}" data-f="${t.id}">${t.emoji} ${t.name}</button>`).join('')}${S.subjects.filter((s) => S.reminders.some((r) => r.subjectId === s.id)).map((s) => `<button class="chip ${taskFilter === 's:' + s.id ? 'on' : ''}" data-f="s:${s.id}">${s.emoji} ${esc(s.name)}</button>`).join('')}</div>
  ${!S.reminders.length ? `<div class="empty"><div class="blob">🔔</div><h4>Pusto tu</h4><p>Dodaj sprawdzian, kartkówkę albo zadanie — przypomnę Ci o nim na czas.</p><button class="btn small" style="margin:20px auto 0;width:auto" data-add>${ic('plus')} Dodaj przypominajkę</button></div>` : ''}
  ${out.map(([n, g]) => `<div class="group-h"><span>${n}</span><span>${g.length}</span></div><div class="stagger">${g.map(remHTML).join('')}</div>`).join('')}
  ${done.length ? `<div class="group-h"><span>Zrobione</span><span>${done.length}</span></div><div>${done.map(remHTML).join('')}</div>` : ''}
  ${S.reminders.length ? `<p class="kbd-note" style="text-align:center;margin-top:24px">Przesuń w lewo, żeby usunąć</p>` : ''}`;
  $$('[data-f]', v).forEach((b) => (b.onclick = () => { taskFilter = b.dataset.f; haptic(); render(); }));
  $('[data-add]', v) && ($('[data-add]', v).onclick = () => reminderSheet());
  bindRems(v);
}
function reminderSheet(existing, preset = {}) {
  const r = existing ? { ...existing } : { id: uid(), title: '', type: 'test', subjectId: null, due: '', remind: 'eve', note: '', done: false, created: Date.now(), ...preset };
  if (!r.due) { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); r.due = `${ymd(d)}T08:00`; }
  const quickDates = [['Jutro', 1], ['Pojutrze', 2], ['Za tydzień', 7]];
  openSheet(`<h3>${existing ? 'Edytuj' : 'Nowa przypominajka'}</h3>
    <div class="field"><input class="inp big" id="r-title" placeholder="Np. Sprawdzian z fotosyntezy" value="${esc(r.title)}" maxlength="80"></div>
    <div class="field"><label>Typ</label><div class="opts" id="r-type">${TYPES.map((t) => `<button class="opt ${r.type === t.id ? 'on' : ''}" data-v="${t.id}">${t.emoji} ${t.name}</button>`).join('')}</div></div>
    <div class="field"><label>Przedmiot</label><div class="chips" id="r-subj" style="margin-bottom:0"><button class="chip ${!r.subjectId ? 'on' : ''}" data-v="">Brak</button>${subjOrder().map((s) => `<button class="chip ${r.subjectId === s.id ? 'on' : ''}" data-v="${s.id}">${s.emoji} ${esc(s.name)}</button>`).join('')}</div></div>
    <div class="field"><label>Kiedy</label><div class="opts" id="r-qd" style="margin-bottom:10px">${quickDates.map(([n, k]) => `<button class="opt" data-k="${k}">${n}</button>`).join('')}</div>
      <div class="row2"><input class="inp" type="date" id="r-date" value="${r.due.slice(0, 10)}"><input class="inp" type="time" id="r-time" value="${r.due.slice(11, 16)}"></div></div>
    <div class="field"><label>Przypomnij</label><div class="opts" id="r-rem">${REMIND.map((x) => `<button class="opt ${r.remind === x.id ? 'on' : ''}" data-v="${x.id}">${x.name}</button>`).join('')}</div></div>
    <div class="field"><label>Notatka</label><textarea class="inp" id="r-note" placeholder="Zakres materiału, strony, co przynieść…">${esc(r.note)}</textarea></div>
    <button class="btn" id="r-save">${ic('check')} ${existing ? 'Zapisz' : 'Dodaj'}</button>
    ${existing ? `<button class="btn danger" id="r-del" style="margin-top:10px">${ic('trash')} Usuń</button>` : ''}`,
  (sh, close) => {
    const pick = (cont, key) => $$('[data-v]', $(cont, sh)).forEach((b) => (b.onclick = () => { $$('[data-v]', $(cont, sh)).forEach((x) => x.classList.remove('on')); b.classList.add('on'); r[key] = b.dataset.v || null; haptic(); }));
    pick('#r-type', 'type'); pick('#r-subj', 'subjectId'); pick('#r-rem', 'remind');
    $$('#r-qd [data-k]', sh).forEach((b) => (b.onclick = () => { const d = new Date(); d.setDate(d.getDate() + +b.dataset.k); $('#r-date', sh).value = ymd(d); haptic(); }));
    if (!existing) setTimeout(() => $('#r-title', sh).focus(), 400);
    $('#r-save', sh).onclick = () => {
      r.title = $('#r-title', sh).value.trim();
      if (!r.title) { $('#r-title', sh).animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 300 }); haptic('warn'); return; }
      r.due = `${$('#r-date', sh).value || ymd()}T${$('#r-time', sh).value || '08:00'}`;
      r.note = $('#r-note', sh).value.trim();
      if (existing) Object.assign(existing, r); else S.reminders.push(r);
      save(); scheduleReminder(existing || r); scheduleDigest(); close(); refreshAll();
      haptic('success'); toast(existing ? 'Zapisano ✓' : 'Dodano — przypomnę Ci 🔔');
    };
    existing && ($('#r-del', sh).onclick = () => { close(); deleteReminder(existing, true); });
  });
}

/* ======================= NOTES ======================= */
const thumbCache = {};
function noteCardHTML(n) {
  const s = subj(n.subjectId);
  return `<button class="note-card ${n.status === 'pending' ? 'pending' : ''}" data-note="${n.id}">
    <div class="img" style="background-image:url(${n.thumb || ''})"><div class="emo">${n.ai?.emoji || s?.emoji || '📝'}</div></div>
    <div class="b"><div class="t">${esc(n.title || 'Notatka')}</div><div class="d">${s ? `<span style="color:${s.color}">●</span> ${esc(s.name)} · ` : ''}${new Date(n.created).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}</div></div>
  </button>`;
}
let noteQ = '', noteSubj = '';
function viewNotes(v) {
  const q = noteQ.toLowerCase();
  const list = S.notes.filter((n) => (!noteSubj || n.subjectId === noteSubj) && (!q || (n.title + ' ' + (n.ai?.summary || '') + ' ' + (n.ai?.text || '') + ' ' + (n.userText || '')).toLowerCase().includes(q)));
  const subs = S.subjects.filter((s) => S.notes.some((n) => n.subjectId === s.id));
  v.innerHTML = `
  <div class="title-row"><div><h1 class="serif">Notatki</h1><div class="sub">${S.notes.length} ${plural(S.notes.length, 'notatka', 'notatki', 'notatek')} · zdjęcie → AI → konkrety</div></div></div>
  ${S.notes.length ? `<div class="searchbar">${ic('search')}<input id="nq" placeholder="Szukaj w notatkach…" value="${esc(noteQ)}"></div>
  ${subs.length > 1 ? `<div class="chips"><button class="chip ${!noteSubj ? 'on' : ''}" data-ns="">Wszystkie</button>${subs.map((s) => `<button class="chip ${noteSubj === s.id ? 'on' : ''}" data-ns="${s.id}">${s.emoji} ${esc(s.name)}</button>`).join('')}</div>` : ''}` : ''}
  ${!S.notes.length ? `<div class="empty"><div class="blob">📸</div><h4>Zrób zdjęcie zeszytu</h4><p>AI przeczyta Twoje notatki i zrobi z nich krótkie streszczenie, fiszki i quiz.</p><button class="btn small" style="margin:20px auto 0;width:auto" data-addn>${ic('camera')} Dodaj notatkę</button></div>` : ''}
  <div class="notes-grid stagger" id="ngrid">${list.map(noteCardHTML).join('')}</div>
  ${S.notes.length && !list.length ? `<div class="empty"><p>Nic nie znaleziono 🤷</p></div>` : ''}`;
  const nq = $('#nq', v);
  if (nq) nq.oninput = () => { noteQ = nq.value; const p = nq.selectionStart; viewNotes(v); const n2 = $('#nq', v); n2.focus(); n2.setSelectionRange(p, p); moveInd(); };
  $$('[data-ns]', v).forEach((b) => (b.onclick = () => { noteSubj = b.dataset.ns; haptic(); render(); }));
  $('[data-addn]', v) && ($('[data-addn]', v).onclick = newNoteSheet);
  bindCommon(v);
}

async function compress(file, max, q) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  } finally { URL.revokeObjectURL(url); }
}

function newNoteSheet() {
  let picked = []; let subjectId = null;
  openSheet(`<h3>Nowa notatka</h3>
    <div class="row2" style="margin-bottom:14px">
      <label class="btn ghost" style="height:96px;flex-direction:column;gap:6px">${ic('camera')}<span style="font-size:14px">Zrób zdjęcie</span><input type="file" accept="image/*" capture="environment" hidden id="n-cam"></label>
      <label class="btn ghost" style="height:96px;flex-direction:column;gap:6px">${ic('image')}<span style="font-size:14px">Z galerii</span><input type="file" accept="image/*" multiple hidden id="n-gal"></label>
    </div>
    <div class="photos" id="n-prev" style="grid-template-columns:repeat(4,1fr);margin-bottom:14px"></div>
    <div class="field"><label>Przedmiot (opcjonalnie — AI zgadnie)</label><div class="chips" id="n-subj" style="margin-bottom:0"><button class="chip on" data-v="">Auto ✨</button>${subjOrder().map((s) => `<button class="chip" data-v="${s.id}">${s.emoji} ${esc(s.name)}</button>`).join('')}</div></div>
    <div class="field"><label>Wskazówka dla AI (opcjonalnie)</label><input class="inp" id="n-hint" placeholder="Np. skup się na datach"></div>
    <button class="btn" id="n-go" disabled>${ic('sparkle')} ${hasAI() ? 'Opracuj z AI' : 'Zapisz notatkę'}</button>
    ${!hasAI() ? `<p class="kbd-note">Żeby AI robiło streszczenia, fiszki i quizy, dodaj darmowy klucz Gemini w <b>Więcej → Ustawienia</b>. Bez niego notatka zapisze się jako zdjęcie.</p>` : ''}`,
  (sh, close) => {
    const add = async (files) => {
      for (const f of files) {
        if (picked.length >= 8) { toast('Max 8 zdjęć na notatkę'); break; }
        try { picked.push({ full: await compress(f, 1568, 0.82), thumb: await compress(f, 520, 0.72) }); } catch { toast('Nie udało się wczytać zdjęcia'); }
      }
      $('#n-prev', sh).innerHTML = picked.map((p, i) => `<div style="position:relative;animation:pop .4s var(--spring) both"><img src="${p.thumb}" style="aspect-ratio:1;object-fit:cover"><button data-rm="${i}" style="position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;display:grid;place-items:center">${ic('x', 'style="width:12px;height:12px"')}</button></div>`).join('');
      $$('[data-rm]', sh).forEach((b) => (b.onclick = () => { picked.splice(+b.dataset.rm, 1); add([]); }));
      $('#n-go', sh).disabled = !picked.length;
      haptic();
    };
    $('#n-cam', sh).onchange = (e) => add([...e.target.files]);
    $('#n-gal', sh).onchange = (e) => add([...e.target.files]);
    $$('#n-subj [data-v]', sh).forEach((b) => (b.onclick = () => { $$('#n-subj [data-v]', sh).forEach((x) => x.classList.remove('on')); b.classList.add('on'); subjectId = b.dataset.v || null; }));
    $('#n-go', sh).onclick = async () => {
      const hint = $('#n-hint', sh).value.trim();
      close();
      const n = { id: uid(), title: 'Nowa notatka', subjectId, created: Date.now(), photos: [], thumb: picked[0].thumb, ai: null, status: hasAI() ? 'pending' : 'raw', userText: '', hint };
      for (const p of picked) { const pid = uid(); await photoSet(pid, p.full); n.photos.push(pid); }
      S.notes.unshift(n); save();
      if (hasAI()) processNote(n, picked.map((p) => p.full), true);
      else { refreshAll(); pageNote(n.id); }
    };
  });
}

async function processNote(n, images, showPage) {
  n.status = 'pending'; save(); refreshAll();
  let pg = null, stepT;
  if (showPage) {
    pg = openPage('Analizuję notatkę', (c) => {
      c.innerHTML = `<div class="scanning" style="background-image:url(${n.thumb})"></div>
      <div class="ai-steps">${['Czytam pismo', 'Wyłapuję najważniejsze', 'Robię streszczenie', 'Tworzę fiszki i quiz'].map((s, i) => `<div data-st="${i}"><i></i>${s}</div>`).join('')}</div>
      <p class="kbd-note">Możesz wyjść — skończę w tle i notatka pojawi się na liście.</p>`;
    });
    let k = 0;
    const tick = () => { $$('[data-st]', pg.el).forEach((d, i) => { d.classList.toggle('ok', i < k); d.classList.toggle('on', i === k); }); if (k < 3) k++; };
    tick(); stepT = setInterval(tick, 2600);
  }
  try {
    if (!images) images = await Promise.all(n.photos.map(photoGet));
    const subjNames = S.subjects.map((s) => s.name);
    const res = await summarizeNotes(aiCfg(), images.filter(Boolean), subjNames, n.hint);
    n.ai = {
      summary: res.summary || '', points: res.points || [], terms: res.terms || [], flashcards: (res.flashcards || []).filter((f) => f.q && f.a),
      quiz: (res.quiz || []).filter((q) => q.options?.length >= 2 && q.correct != null), text: res.text || '', emoji: res.emoji || '📝',
    };
    n.title = res.title || n.title;
    if (!n.subjectId && res.subject) {
      let s = S.subjects.find((x) => x.name.toLowerCase() === res.subject.toLowerCase());
      if (!s) { s = { id: uid(), name: res.subject, emoji: res.emoji || '📘', color: COLORS[S.subjects.length % COLORS.length] }; S.subjects.push(s); }
      n.subjectId = s.id;
    }
    n.status = 'ready'; markActive(); save();
    clearInterval(stepT);
    haptic('success');
    if (pg && pages.includes(pg)) {
      $$('[data-st]', pg.el).forEach((d) => { d.classList.remove('on'); d.classList.add('ok'); });
      setTimeout(() => { closePage(); setTimeout(() => { pageNote(n.id); confetti(innerWidth / 2, innerHeight / 3); }, 300); }, 500);
    } else { toast(`✨ Gotowe: ${n.title}`, 'Otwórz', () => pageNote(n.id)); refreshAll(); }
  } catch (e) {
    clearInterval(stepT);
    n.status = 'error'; n.error = e.message; save();
    haptic('warn');
    if (pg && pages.includes(pg)) closePage();
    toast(e.message || 'Coś poszło nie tak');
    refreshAll();
  }
}

let noteTab = 'sum';
function pageNote(id) {
  const n = S.notes.find((x) => x.id === id); if (!n) return;
  noteTab = 'sum';
  const pg = openPage('', (c, o) => {
    const s = subj(n.subjectId), a = n.ai;
    o.title = s ? `${s.emoji} ${s.name}` : 'Notatka';
    $('.page-bar h2', o.el).textContent = o.title;
    const tabs = a ? [['sum', 'Streszczenie'], ['terms', `Pojęcia ${a.terms.length}`], ['cards', `Fiszki ${a.flashcards.length}`], ['quiz', 'Quiz'], ['ask', 'Zapytaj AI'], ['text', 'Tekst'], ['pics', 'Zdjęcia']] : [['pics', 'Zdjęcia'], ['own', 'Moje dopiski']];
    if (!tabs.some((t) => t[0] === noteTab)) noteTab = tabs[0][0];
    c.innerHTML = `
      <div class="nd-hero" style="background-image:url(${n.thumb})" data-pics><span class="count">${n.photos.length} ${plural(n.photos.length, 'zdjęcie', 'zdjęcia', 'zdjęć')}</span></div>
      <div class="nd-title" id="nd-t">${esc(n.title)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${a ? `<span class="ai-badge">${ic('sparkle')} opracowane przez AI</span>` : ''}
        <span class="tag">${new Date(n.created).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })}</span>
        <button class="tag" data-edit>${ic('edit', 'style="width:12px;height:12px"')} edytuj</button>
      </div>
      ${n.status === 'error' || n.status === 'raw' ? `<div class="card" style="margin-top:16px">${n.status === 'error' ? `<div style="font-weight:650;margin-bottom:6px">Nie udało się opracować 😕</div><div class="muted" style="font-size:13px;margin-bottom:12px">${esc(n.error || '')}</div>` : `<div class="muted" style="font-size:14px;margin-bottom:12px">Ta notatka nie została jeszcze opracowana przez AI.</div>`}<button class="btn small" data-retry>${ic('sparkle')} Opracuj z AI</button></div>` : ''}
      ${n.status === 'pending' ? `<div class="card" style="margin-top:16px"><div class="ai-steps" style="margin:0"><div class="on"><i></i>AI właśnie to czyta…</div></div></div>` : ''}
      <div class="tabs">${tabs.map(([k, l]) => `<button class="${noteTab === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
      <div class="tabpane" id="pane"></div>`;
    const pane = $('#pane', c);
    const drawPane = () => {
      if (noteTab === 'sum') pane.innerHTML = `<div class="card"><div class="summary">${esc(a.summary)}</div></div><div class="section-h"><h3>Najważniejsze</h3></div><div class="card" style="padding:4px 18px"><ol class="points">${a.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div>`;
      if (noteTab === 'terms') pane.innerHTML = a.terms.length ? `<div class="card" style="padding:4px 18px">${a.terms.map((t) => `<div class="term"><b>${esc(t.term)}</b><span>${esc(t.def)}</span></div>`).join('')}</div>` : '<p class="muted">Brak pojęć.</p>';
      if (noteTab === 'cards') pane.innerHTML = `<button class="btn" data-learn>${ic('cards')} Ucz się fiszek</button><div class="card" style="padding:4px 18px;margin-top:12px">${a.flashcards.map((f) => `<div class="term"><b>${esc(f.q)}</b><span>${esc(f.a)}</span></div>`).join('')}</div>`;
      if (noteTab === 'quiz') pane.innerHTML = `<div class="card" style="text-align:center;padding:30px 20px"><div style="font-size:44px">🧠</div><div class="serif" style="font-size:28px;margin:8px 0">${a.quiz.length} ${plural(a.quiz.length, 'pytanie', 'pytania', 'pytań')}</div><div class="muted" style="font-size:14px;margin-bottom:18px">Sprawdź, ile zapamiętałeś z tej notatki</div><button class="btn" data-quiz>${ic('play')} Start</button></div>`;
      if (noteTab === 'text') pane.innerHTML = `<div class="card"><div style="white-space:pre-wrap;line-height:1.6;font-size:15px;user-select:text">${esc(a.text || 'Brak tekstu.')}</div></div><button class="btn ghost" data-copy style="margin-top:12px">Kopiuj tekst</button>`;
      if (noteTab === 'ask') pane.innerHTML = `<div class="card"><div class="muted" style="font-size:14px">Nie rozumiesz czegoś? Zapytaj — odpowiem na podstawie tej notatki.</div>
        <div class="opts" style="margin-top:12px">${['Wyjaśnij prościej', 'Daj przykład', 'Jak to zapamiętać?', 'Co może być na sprawdzianie?'].map((x) => `<button class="opt" data-sug="${x}">${x}</button>`).join('')}</div>
        <div class="ask"><input id="askq" placeholder="Twoje pytanie…"><button class="iconbtn" data-ask style="background:var(--accent);color:#fff">${ic('send')}</button></div><div class="answer" id="ans"></div></div>`;
      if (noteTab === 'pics') { pane.innerHTML = `<div class="photos" id="pics"></div>`; loadPics(); }
      if (noteTab === 'own') pane.innerHTML = `<textarea class="inp" id="own" style="min-height:200px" placeholder="Dopisz coś do tej notatki…">${esc(n.userText || '')}</textarea>`;
      bindPane();
    };
    const loadPics = async () => {
      const box = $('#pics', pane); if (!box) return;
      for (const pid of n.photos) { const d = await photoGet(pid); if (d) { const im = new Image(); im.src = d; im.style.animation = 'rise .4s var(--ease) both'; im.onclick = () => viewer(d); box.append(im); } }
    };
    const bindPane = () => {
      $('[data-learn]', pane) && ($('[data-learn]', pane).onclick = () => pageFlashcards(n.id));
      $('[data-quiz]', pane) && ($('[data-quiz]', pane).onclick = () => pageQuiz(n.id));
      $('[data-copy]', pane) && ($('[data-copy]', pane).onclick = async () => { try { await navigator.clipboard.writeText(a.text); toast('Skopiowano'); } catch { toast('Nie udało się skopiować'); } });
      const own = $('#own', pane); if (own) own.oninput = () => { n.userText = own.value; save(); };
      const doAsk = async (q) => {
        if (!q) return; if (!hasAI()) return toast('Dodaj klucz AI w Ustawieniach');
        const ans = $('#ans', pane); ans.innerHTML = '<span class="muted">Myślę…</span>';
        try { ans.textContent = await askAboutNote(aiCfg(), n, q); } catch (e) { ans.textContent = e.message; }
      };
      $$('[data-sug]', pane).forEach((b) => (b.onclick = () => { $('#askq', pane).value = b.dataset.sug; doAsk(b.dataset.sug); }));
      $('[data-ask]', pane) && ($('[data-ask]', pane).onclick = () => doAsk($('#askq', pane).value.trim()));
      $('#askq', pane) && ($('#askq', pane).onkeydown = (e) => e.key === 'Enter' && doAsk(e.target.value.trim()));
    };
    $$('[data-t]', c).forEach((b) => (b.onclick = () => { noteTab = b.dataset.t; $$('[data-t]', c).forEach((x) => x.classList.toggle('on', x === b)); pane.style.animation = 'none'; void pane.offsetWidth; pane.style.animation = ''; drawPane(); haptic(); b.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' }); }));
    $('[data-pics]', c).onclick = async () => { const d = await photoGet(n.photos[0]); d && viewer(d); };
    $('[data-retry]', c) && ($('[data-retry]', c).onclick = () => { if (!hasAI()) return toast('Najpierw dodaj klucz AI w Ustawieniach'); processNote(n, null, true); });
    $('[data-edit]', c).onclick = () => editNoteSheet(n);
    drawPane();
  });
  pg.onClose = () => render();
}
function viewer(src) {
  const v = document.createElement('div');
  v.style.cssText = 'position:fixed;inset:0;z-index:80;background:rgba(0,0,0,.92);display:grid;place-items:center;opacity:0;transition:opacity .3s;overflow:auto';
  v.innerHTML = `<img src="${src}" style="max-width:100%;max-height:100%;transform:scale(.9);transition:transform .4s var(--spring)">`;
  document.body.append(v);
  requestAnimationFrame(() => { v.style.opacity = 1; v.firstChild.style.transform = 'none'; });
  const close = () => { v.style.opacity = 0; setTimeout(() => v.remove(), 300); sheetStack = sheetStack.filter((x) => x !== close); };
  v.onclick = close; sheetStack.push(close);
}
function editNoteSheet(n) {
  let sid = n.subjectId;
  openSheet(`<h3>Edytuj notatkę</h3>
    <div class="field"><label>Tytuł</label><input class="inp" id="e-t" value="${esc(n.title)}"></div>
    <div class="field"><label>Przedmiot</label><div class="chips" id="e-s" style="margin-bottom:0">${subjOrder().map((s) => `<button class="chip ${sid === s.id ? 'on' : ''}" data-v="${s.id}">${s.emoji} ${esc(s.name)}</button>`).join('')}</div></div>
    <button class="btn" id="e-save">${ic('check')} Zapisz</button>
    ${n.ai && hasAI() ? `<button class="btn ghost" id="e-redo" style="margin-top:10px">${ic('sparkle')} Opracuj ponownie</button>` : ''}
    <button class="btn danger" id="e-del" style="margin-top:10px">${ic('trash')} Usuń notatkę</button>`,
  (sh, close) => {
    $$('#e-s [data-v]', sh).forEach((b) => (b.onclick = () => { $$('#e-s [data-v]', sh).forEach((x) => x.classList.remove('on')); b.classList.add('on'); sid = b.dataset.v; }));
    $('#e-save', sh).onclick = () => { n.title = $('#e-t', sh).value.trim() || n.title; n.subjectId = sid; save(); close(); refreshAll(); };
    $('#e-redo', sh) && ($('#e-redo', sh).onclick = () => { close(); closePage(); processNote(n, null, true); });
    let armed = false;
    $('#e-del', sh).onclick = (e) => {
      if (!armed) { armed = true; e.currentTarget.innerHTML = `${ic('trash')} Na pewno? Kliknij jeszcze raz`; haptic('warn'); return; }
      S.notes = S.notes.filter((x) => x !== n); n.photos.forEach((p) => photoDel(p)); save(); close(); closePage(); toast('Notatka usunięta');
    };
  });
}

/* ======================= STUDY ======================= */
function allCards(noteId) {
  const out = [];
  S.notes.forEach((n) => { if (noteId && n.id !== noteId) return; (n.ai?.flashcards || []).forEach((f, i) => out.push({ key: n.id + ':' + i, ...f, note: n })); });
  return out;
}
const dueCards = (noteId) => allCards(noteId).filter((c) => !S.cards[c.key] || S.cards[c.key].due <= ymd());
function weekFocus() {
  const out = []; const d = new Date(); d.setDate(d.getDate() - 6);
  for (let i = 0; i < 7; i++) { out.push({ d: new Date(d), m: S.focus[ymd(d)] || 0 }); d.setDate(d.getDate() + 1); }
  return out;
}
function viewStudy(v) {
  const due = dueCards().length, total = allCards().length;
  const quizN = S.notes.reduce((a, n) => a + (n.ai?.quiz?.length || 0), 0);
  const wk = weekFocus(), mx = Math.max(30, ...wk.map((x) => x.m)), sum = wk.reduce((a, b) => a + b.m, 0);
  v.innerHTML = `
  <div class="title-row"><div><h1 class="serif">Nauka</h1><div class="sub">Powtórki, quizy i skupienie</div></div></div>
  <div class="tiles stagger">
    <button class="tile" data-s="focus" style="--c:#ec7f52"><div class="ic">${ic('timer')}</div><div><b>Fokus</b><span>${S.focusCfg.work} min skupienia</span></div></button>
    <button class="tile" data-s="cards" style="--c:var(--accent)"><div class="ic">${ic('cards')}</div><div><b>Fiszki</b><span>${total ? `${due} do powtórki` : 'z Twoich notatek'}</span></div></button>
    <button class="tile" data-s="quiz" style="--c:#3384c4"><div class="ic">${ic('quiz')}</div><div><b>Quiz mix</b><span>${quizN} ${plural(quizN, 'pytanie', 'pytania', 'pytań')}</span></div></button>
    <button class="tile" data-s="grades" style="--c:#4f9a76"><div class="ic">${ic('chart')}</div><div><b>Oceny</b><span>średnia ${overallAvg()?.toFixed(2).replace('.', ',') || '–'}</span></div></button>
    <button class="tile wide" data-s="calc" style="--c:#de5f95"><div class="ic">${ic('calc')}</div><div><b>Ile mi brakuje?</b><span>Policz, jaką ocenę musisz dostać</span></div></button>
  </div>
  <div class="section-h"><h3>Skupienie w tym tygodniu</h3><span class="muted" style="font-size:13px;font-weight:600">${Math.floor(sum / 60)} h ${sum % 60} min</span></div>
  <div class="card"><div class="week">${wk.map((x, i) => `<div class="d ${i === 6 ? 'today' : ''}"><small>${x.m || ''}</small><i style="height:0%" data-h="${(x.m / mx) * 100}"></i><span>${DAYS[x.d.getDay()]}</span></div>`).join('')}</div></div>
  <div class="section-h"><h3>Seria</h3></div>
  <div class="card countdown"><div class="num">${streak()}</div><div class="txt"><b>${plural(streak(), 'dzień', 'dni', 'dni')} z rzędu 🔥</b>Ucz się, rób zadania albo fokus codziennie, żeby utrzymać serię.</div></div>`;
  requestAnimationFrame(() => setTimeout(() => $$('[data-h]', v).forEach((i) => (i.style.height = i.dataset.h + '%')), 80));
  $$('[data-s]', v).forEach((b) => (b.onclick = () => ({ focus: pageFocus, cards: () => pageFlashcards(), quiz: () => pageQuiz(), grades: pageGrades, calc: () => calcSheet() })[b.dataset.s]()));
}

function pageFlashcards(noteId) {
  let deck = dueCards(noteId);
  let all = false;
  if (!deck.length) { deck = allCards(noteId); all = true; }
  if (!deck.length) { toast('Brak fiszek — dodaj notatkę i opracuj ją z AI 📸'); return; }
  deck = deck.sort(() => Math.random() - 0.5).slice(0, 25);
  let i = 0, known = 0;
  openPage(noteId ? 'Fiszki' : 'Wszystkie fiszki', (c) => {
    const draw = (first) => {
      if (i >= deck.length) {
        markActive(); confetti(innerWidth / 2, innerHeight / 3); haptic('success');
        c.innerHTML = `<div class="empty"><div class="blob">🎉</div><h4>Koniec sesji!</h4><p>Umiesz ${known} z ${deck.length}. ${known === deck.length ? 'Perfekcyjnie!' : 'Te, których nie umiesz, wrócą szybciej.'}</p><button class="btn small" style="margin:20px auto 0;width:auto" data-again>${ic('reset')} Jeszcze raz</button></div>`;
        $('[data-again]', c).onclick = () => { i = 0; known = 0; deck.sort(() => Math.random() - 0.5); draw(true); };
        return;
      }
      const f = deck[i], s = subj(f.note.subjectId);
      c.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:650;color:var(--muted);margin-bottom:8px"><span>${i + 1} / ${deck.length}${all ? ' · powtórka' : ''}</span><span>${s ? s.emoji + ' ' + esc(s.name) : ''}</span></div>
        <div class="progress"><i style="width:${(i / deck.length) * 100}%"></i></div>
        <div class="fc-stage"><div class="fc appear" id="fc">
          <div class="side"><span class="k">Pytanie</span><div class="q">${esc(f.q)}</div><span class="hint">Dotknij, żeby odwrócić</span></div>
          <div class="side back"><span class="k">Odpowiedź</span><div class="a">${esc(f.a)}</div></div>
        </div></div>
        <div class="fc-btns"><button class="btn ghost" data-a="0">🔁 Powtórz</button><button class="btn" data-a="1">✓ Umiem</button></div>`;
      const fc = $('#fc', c);
      fc.onclick = () => { fc.classList.remove('appear'); fc.classList.toggle('flip'); haptic(); };
      $$('[data-a]', c).forEach((b) => (b.onclick = () => {
        const ok = b.dataset.a === '1';
        const st = S.cards[f.key] || { box: 0 };
        st.box = ok ? Math.min(5, st.box + 1) : 0;
        const d = new Date(); d.setDate(d.getDate() + (ok ? [1, 2, 4, 8, 16, 30][st.box] : 0)); st.due = ymd(d);
        S.cards[f.key] = st; save();
        if (ok) known++;
        haptic(ok ? 'success' : 'light');
        fc.classList.remove('appear'); fc.classList.add(ok ? 'fly-r' : 'fly-l');
        setTimeout(() => { i++; draw(false); }, 380);
      }));
    };
    draw(true);
  });
}

function pageQuiz(noteId) {
  let qs = [];
  S.notes.forEach((n) => { if (noteId && n.id !== noteId) return; (n.ai?.quiz || []).forEach((q) => qs.push({ ...q, note: n })); });
  if (!qs.length) { toast('Brak pytań — dodaj i opracuj notatkę 📸'); return; }
  qs = qs.sort(() => Math.random() - 0.5).slice(0, 10);
  let i = 0, score = 0;
  openPage('Quiz', (c) => {
    const draw = () => {
      if (i >= qs.length) {
        const p = score / qs.length; markActive();
        if (p >= 0.7) confetti(innerWidth / 2, innerHeight / 3);
        const R = 80, L = 2 * Math.PI * R;
        c.innerHTML = `<div class="result-ring"><svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="${R}" stroke="var(--surface-2)" stroke-width="12" fill="none"/><circle id="rr" cx="90" cy="90" r="${R}" stroke="var(--accent)" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${L}" stroke-dashoffset="${L}" style="transition:stroke-dashoffset 1.4s var(--ease)"/></svg><div class="c"><div><b id="sc">0</b><span class="muted" style="font-size:13px;font-weight:600">z ${qs.length}</span></div></div></div>
          <div style="text-align:center"><div class="serif" style="font-size:30px">${p === 1 ? 'Perfekcyjnie! 🏆' : p >= 0.7 ? 'Świetnie! 🎉' : p >= 0.4 ? 'Nieźle 👍' : 'Do powtórki 📚'}</div><p class="muted">${p >= 0.7 ? 'Jesteś gotowy na sprawdzian.' : 'Przejrzyj fiszki i spróbuj jeszcze raz.'}</p></div>
          <button class="btn" data-again style="margin-top:20px">${ic('reset')} Jeszcze raz</button>`;
        requestAnimationFrame(() => setTimeout(() => { $('#rr', c).style.strokeDashoffset = L * (1 - p); countUp($('#sc', c), score); }, 100));
        $('[data-again]', c).onclick = () => { i = 0; score = 0; qs.sort(() => Math.random() - 0.5); draw(); };
        return;
      }
      const q = qs[i];
      c.innerHTML = `<div style="display:flex;justify-content:space-between;font-size:13px;font-weight:650;color:var(--muted);margin-bottom:8px"><span>Pytanie ${i + 1} / ${qs.length}</span><span>${score} pkt</span></div>
        <div class="progress"><i style="width:${(i / qs.length) * 100}%"></i></div>
        <div class="qz-q">${esc(q.q)}</div>
        ${q.options.map((o, k) => `<button class="qz-opt" data-k="${k}" style="animation-delay:${0.05 + k * 0.06}s"><span class="l">${'ABCD'[k]}</span>${esc(o)}</button>`).join('')}`;
      let done = false;
      $$('[data-k]', c).forEach((b) => (b.onclick = () => {
        if (done) return; done = true;
        const k = +b.dataset.k, ok = k === +q.correct;
        if (ok) { score++; b.classList.add('right'); haptic('success'); } else { b.classList.add('wrong'); $(`[data-k="${+q.correct}"]`, c).classList.add('right'); haptic('warn'); }
        setTimeout(() => { i++; draw(); }, ok ? 800 : 1500);
      }));
    };
    draw();
  });
}

/* ---- focus timer (persists while app open; notification when backgrounded) ---- */
const F = { mode: 'work', left: null, running: false, endAt: 0, int: null, session: 0 };
function pageFocus() {
  if (F.left == null) F.left = S.focusCfg.work * 60;
  const pg = openPage('Fokus', (c) => {
    const R = 130, L = 2 * Math.PI * R;
    const presets = [[25, 5], [50, 10], [15, 3], [90, 15]];
    c.innerHTML = `
      <div class="chips" style="justify-content:center">${presets.map(([w, b]) => `<button class="chip ${S.focusCfg.work === w ? 'on' : ''}" data-p="${w},${b}">${w}/${b}</button>`).join('')}</div>
      <div class="focus-ring" id="ring"><svg viewBox="0 0 300 300"><circle class="trk" cx="150" cy="150" r="${R}" stroke-width="10"/><circle class="val" id="val" cx="150" cy="150" r="${R}" stroke-width="10" stroke-dasharray="${L}"/></svg>
        <div class="c"><div><div class="time" id="tm"></div><div class="mode" id="md"></div></div></div></div>
      <div class="focus-ctrl"><button class="iconbtn" data-r>${ic('reset')}</button><button class="play" data-play></button><button class="iconbtn" data-skip>${ic('skip')}</button></div>
      <div class="card" style="margin-top:26px;display:flex;justify-content:space-around;text-align:center">
        <div><div class="serif" style="font-size:30px" id="todayM">${S.focus[ymd()] || 0}</div><div class="muted" style="font-size:12px;font-weight:600">min dziś</div></div>
        <div><div class="serif" style="font-size:30px">${F.session}</div><div class="muted" style="font-size:12px;font-weight:600">sesji teraz</div></div>
      </div>
      <p class="kbd-note" style="text-align:center">Odłóż telefon — dam znać powiadomieniem, kiedy koniec.</p>`;
    const upd = () => {
      if (!$('#tm', c)) return;
      const tot = (F.mode === 'work' ? S.focusCfg.work : S.focusCfg.brk) * 60;
      const left = F.running ? Math.max(0, Math.round((F.endAt - Date.now()) / 1000)) : F.left;
      $('#tm', c).textContent = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
      $('#md', c).textContent = F.mode === 'work' ? 'skupienie' : 'przerwa';
      $('#val', c).style.strokeDashoffset = L * (1 - left / tot);
      $('#ring', c).classList.toggle('run', F.running);
      $('[data-play]', c).innerHTML = F.running ? ic('pause') : ic('play');
      if (F.running && left <= 0) finish();
    };
    const finish = async () => {
      F.running = false; clearInterval(F.int);
      if (F.mode === 'work') { S.focus[ymd()] = (S.focus[ymd()] || 0) + S.focusCfg.work; F.session++; markActive(); save(); confetti(); toast('Sesja zakończona! Czas na przerwę ☕'); }
      else toast('Przerwa koniec — wracamy! 💪');
      haptic('success');
      F.mode = F.mode === 'work' ? 'brk' : 'work'; F.left = (F.mode === 'work' ? S.focusCfg.work : S.focusCfg.brk) * 60;
      pg.refresh();
    };
    const start = async () => {
      F.running = true; F.endAt = Date.now() + F.left * 1000;
      F.int = setInterval(upd, 250);
      if (NATIVE && (await ensureNotif())) LocalNotifications.schedule({ notifications: [{ id: 7, title: F.mode === 'work' ? '⏰ Koniec skupienia' : '☕ Koniec przerwy', body: F.mode === 'work' ? 'Świetna robota! Zrób sobie przerwę.' : 'Wracamy do nauki 💪', schedule: { at: new Date(F.endAt), allowWhileIdle: true }, smallIcon: 'ic_stat_icon', iconColor: S.accent }] }).catch(() => {});
    };
    const stop = () => { F.left = Math.max(0, Math.round((F.endAt - Date.now()) / 1000)); F.running = false; clearInterval(F.int); NATIVE && LocalNotifications.cancel({ notifications: [{ id: 7 }] }).catch(() => {}); };
    $('[data-play]', c).onclick = () => { haptic('medium'); F.running ? stop() : start(); upd(); };
    $('[data-r]', c).onclick = () => { if (F.running) stop(); F.left = (F.mode === 'work' ? S.focusCfg.work : S.focusCfg.brk) * 60; haptic(); upd(); };
    $('[data-skip]', c).onclick = () => { if (F.running) stop(); F.mode = F.mode === 'work' ? 'brk' : 'work'; F.left = (F.mode === 'work' ? S.focusCfg.work : S.focusCfg.brk) * 60; haptic(); upd(); };
    $$('[data-p]', c).forEach((b) => (b.onclick = () => { if (F.running) stop(); const [w, br] = b.dataset.p.split(',').map(Number); S.focusCfg = { work: w, brk: br }; save(); F.mode = 'work'; F.left = w * 60; pg.refresh(); }));
    clearInterval(F.int); if (F.running) F.int = setInterval(upd, 250);
    upd();
  });
  pg.onClose = () => { clearInterval(F.int); if (F.running) F.int = setInterval(() => { if (Date.now() >= F.endAt && F.running) { F.running = false; clearInterval(F.int); if (F.mode === 'work') { S.focus[ymd()] = (S.focus[ymd()] || 0) + S.focusCfg.work; F.session++; markActive(); save(); } F.mode = F.mode === 'work' ? 'brk' : 'work'; F.left = (F.mode === 'work' ? S.focusCfg.work : S.focusCfg.brk) * 60; toast('⏰ Fokus: koniec etapu'); } }, 1000); };
}

/* ======================= GRADES ======================= */
const gradeVal = (g) => g.value;
function gradeLabel(v) { const b = Math.round(v); const d = v - Math.floor(v); return d === 0.5 ? Math.floor(v) + '+' : d === 0.75 ? Math.ceil(v) + '-' : String(b); }
function subjAvg(id) {
  const gs = S.grades.filter((g) => g.subjectId === id); if (!gs.length) return null;
  const w = gs.reduce((a, g) => a + g.weight, 0); return gs.reduce((a, g) => a + gradeVal(g) * g.weight, 0) / w;
}
const avgColor = (a) => (a == null ? 'var(--surface-2)' : a >= 4.75 ? '#3fa672' : a >= 3.75 ? 'var(--accent)' : a >= 2.75 ? '#e9a23b' : '#e5534b');
function pageGrades() {
  openPage('Oceny', (c) => {
    const avg = overallAvg();
    const subs = subjOrder().map((s) => ({ s, a: subjAvg(s.id), gs: S.grades.filter((g) => g.subjectId === s.id) }));
    c.innerHTML = `<div class="big-avg"><b id="ga">${avg == null ? '–' : '0'}</b><span>średnia ogólna</span></div>
      <p class="kbd-note" style="text-align:center;margin-bottom:18px">Dotknij przedmiotu, żeby dodać ocenę</p>
      ${(() => { const used = subs.filter((x) => x.gs.length), rest = subs.filter((x) => !x.gs.length); const row = ({ s, a, gs }) => `<button class="row" data-sg="${s.id}"><div class="ic" style="background:${s.color}22">${s.emoji}</div><div class="main"><b>${esc(s.name)}</b><div class="grades-line">${gs.length ? gs.slice(-8).map((g) => `<span class="g" style="height:22px;min-width:22px;font-size:11px">${gradeLabel(g.value)}</span>`).join('') : '<span>brak ocen</span>'}</div></div><div class="avg-pill" style="background:${a == null ? 'var(--surface-2)' : avgColor(a)};color:${a == null ? 'var(--muted)' : '#fff'}">${a == null ? '–' : a.toFixed(2).replace('.', ',')}</div></button>`;
        return `${used.length ? `<div class="list stagger">${used.map(row).join('')}</div>` : ''}<div class="group-h" style="margin-top:22px"><span>${used.length ? 'Pozostałe przedmioty' : 'Przedmioty'}</span><span>${rest.length}</span></div><div class="list">${rest.map(row).join('')}</div>`; })()}`;
    if (avg != null) countUp($('#ga', c), avg, 2);
    $$('[data-sg]', c).forEach((b) => (b.onclick = () => pageSubjectGrades(b.dataset.sg)));
  });
}
function pageSubjectGrades(id) {
  const s = subj(id);
  openPage(`${s.emoji} ${s.name}`, (c, o) => {
    const gs = S.grades.filter((g) => g.subjectId === id).sort((a, b) => a.date - b.date), a = subjAvg(id);
    c.innerHTML = `<div class="big-avg"><b style="color:${avgColor(a)}">${a == null ? '–' : a.toFixed(2).replace('.', ',')}</b><span>średnia ważona · ${gs.length} ${plural(gs.length, 'ocena', 'oceny', 'ocen')}</span></div>
      <div class="card" style="margin-top:18px">${gs.length ? `<div class="grades-line" style="gap:8px">${gs.map((g, i) => `<button class="g" data-g="${g.id}" style="min-width:40px;height:40px;font-size:16px;animation-delay:${i * 0.03}s;background:${avgColor(g.value)}22">${gradeLabel(g.value)}<sup>${g.weight}</sup></button>`).join('')}</div>` : '<div class="muted" style="text-align:center;padding:10px">Jeszcze nic. Dodaj pierwszą ocenę!</div>'}</div>
      <button class="btn" data-add style="margin-top:14px">${ic('plus')} Dodaj ocenę</button>
      <button class="btn ghost" data-calc style="margin-top:10px">${ic('calc')} Ile muszę dostać?</button>
      ${gs.length ? `<div class="section-h"><h3>Historia</h3></div><div class="list">${[...gs].reverse().map((g) => `<button class="row" data-g="${g.id}"><div class="ic" style="font-weight:800;font-size:15px">${gradeLabel(g.value)}</div><div class="main"><b>${esc(g.desc || 'Ocena')}</b><span>waga ${g.weight} · ${new Date(g.date).toLocaleDateString('pl-PL')}</span></div></button>`).join('')}</div>` : ''}`;
    $('[data-add]', c).onclick = () => gradeSheet(id);
    $('[data-calc]', c).onclick = () => calcSheet(id);
    $$('[data-g]', c).forEach((b) => (b.onclick = () => gradeSheet(id, S.grades.find((g) => g.id === b.dataset.g))));
  });
}
function gradeSheet(subjectId, existing) {
  const g = existing ? { ...existing } : { id: uid(), subjectId, value: 5, weight: 1, desc: '', date: Date.now() };
  let base = Math.round(g.value), mod = g.value - Math.floor(g.value) === 0.5 ? '+' : g.value - Math.floor(g.value) === 0.75 ? '-' : '';
  if (mod === '-') base = Math.ceil(g.value);
  if (mod === '+') base = Math.floor(g.value);
  openSheet(`<h3>${existing ? 'Edytuj ocenę' : 'Nowa ocena'}</h3>
    <div class="field"><label>Ocena</label><div class="opts" id="g-v">${[1, 2, 3, 4, 5, 6].map((v) => `<button class="opt ${base === v ? 'on' : ''}" data-v="${v}" style="width:46px;justify-content:center;font-size:17px;font-weight:800">${v}</button>`).join('')}</div>
      <div class="opts" id="g-m" style="margin-top:8px">${[['', 'równo'], ['+', 'plus +'], ['-', 'minus −']].map(([v, l]) => `<button class="opt ${mod === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>
    <div class="field"><label>Waga</label><div class="opts" id="g-w">${[1, 2, 3, 4, 5].map((v) => `<button class="opt ${g.weight === v ? 'on' : ''}" data-v="${v}" style="width:46px;justify-content:center">${v}</button>`).join('')}</div></div>
    <div class="field"><label>Za co</label><input class="inp" id="g-d" placeholder="Np. sprawdzian dział 2" value="${esc(g.desc)}"></div>
    <button class="btn" id="g-s">${ic('check')} Zapisz</button>
    ${existing ? `<button class="btn danger" id="g-x" style="margin-top:10px">${ic('trash')} Usuń</button>` : ''}`,
  (sh, close) => {
    const pick = (sel, fn) => $$(sel + ' [data-v]', sh).forEach((b) => (b.onclick = () => { $$(sel + ' [data-v]', sh).forEach((x) => x.classList.remove('on')); b.classList.add('on'); fn(b.dataset.v); haptic(); }));
    pick('#g-v', (v) => (base = +v)); pick('#g-m', (v) => (mod = v)); pick('#g-w', (v) => (g.weight = +v));
    $('#g-s', sh).onclick = () => {
      g.value = mod === '+' ? Math.min(6, base + 0.5) : mod === '-' ? Math.max(1, base - 0.25) : base;
      g.desc = $('#g-d', sh).value.trim();
      if (existing) Object.assign(existing, g); else S.grades.push(g);
      save(); close(); refreshAll(); haptic('success');
      if (!existing && g.value >= 5) confetti(innerWidth / 2, innerHeight / 3, 60);
    };
    existing && ($('#g-x', sh).onclick = () => { S.grades = S.grades.filter((x) => x !== existing); save(); close(); refreshAll(); });
  });
}
function calcSheet(subjectId) {
  let sid = subjectId || S.subjects.find((s) => S.grades.some((g) => g.subjectId === s.id))?.id || S.subjects[0]?.id;
  let target = 4.5, w = 3;
  openSheet(`<h3>Ile muszę dostać?</h3>
    <div class="field"><label>Przedmiot</label><div class="chips" id="c-s" style="margin-bottom:0">${subjOrder().map((s) => `<button class="chip ${sid === s.id ? 'on' : ''}" data-v="${s.id}">${s.emoji} ${esc(s.name)}</button>`).join('')}</div></div>
    <div class="field"><label>Chcę mieć średnią</label><div class="opts" id="c-t">${[2.5, 3, 3.5, 4, 4.5, 4.75, 5, 5.5].map((v) => `<button class="opt ${target === v ? 'on' : ''}" data-v="${v}">${String(v).replace('.', ',')}</button>`).join('')}</div></div>
    <div class="field"><label>Waga następnej oceny</label><div class="opts" id="c-w">${[1, 2, 3, 4, 5].map((v) => `<button class="opt ${w === v ? 'on' : ''}" data-v="${v}" style="width:46px;justify-content:center">${v}</button>`).join('')}</div></div>
    <div class="card" style="text-align:center"><div class="muted" style="font-size:13px;font-weight:600" id="c-now"></div><div class="serif" style="font-size:56px;line-height:1.1;color:var(--accent)" id="c-r"></div><div style="font-size:14px" id="c-m"></div></div>`,
  (sh) => {
    const calc = () => {
      const gs = S.grades.filter((g) => g.subjectId === sid);
      const W = gs.reduce((a, g) => a + g.weight, 0), Sm = gs.reduce((a, g) => a + g.value * g.weight, 0);
      const need = (target * (W + w) - Sm) / w;
      $('#c-now', sh).textContent = gs.length ? `teraz: ${(Sm / W).toFixed(2).replace('.', ',')} (${gs.length} ${plural(gs.length, 'ocena', 'oceny', 'ocen')})` : 'brak ocen z tego przedmiotu';
      const r = $('#c-r', sh), m = $('#c-m', sh);
      if (need <= 1) { r.textContent = '1 ✓'; m.textContent = 'Spokojnie, już to masz 😎'; }
      else if (need > 6) { r.textContent = '😬'; m.textContent = `Potrzeba ${need.toFixed(2).replace('.', ',')} — jedna ocena nie wystarczy. Spróbuj z większą wagą.`; }
      else { const ok = [1, 1.5, 1.75, 2, 2.5, 2.75, 3, 3.5, 3.75, 4, 4.5, 4.75, 5, 5.5, 5.75, 6].find((x) => x >= need - 1e-9); r.textContent = gradeLabel(ok); m.textContent = `minimum ${need.toFixed(2).replace('.', ',')} z wagą ${w}`; }
      r.animate([{ transform: 'scale(.8)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 400, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    };
    const pick = (sel, fn) => $$(sel + ' [data-v]', sh).forEach((b) => (b.onclick = () => { $$(sel + ' [data-v]', sh).forEach((x) => x.classList.remove('on')); b.classList.add('on'); fn(b.dataset.v); haptic(); calc(); }));
    pick('#c-s', (v) => (sid = v)); pick('#c-t', (v) => (target = +v)); pick('#c-w', (v) => (w = +v));
    calc();
  });
}

/* ======================= TIMETABLE ======================= */
let ttDay = Math.min(5, Math.max(1, new Date().getDay() || 1));
function pageTimetable() {
  openPage('Plan lekcji', (c) => {
    const ls = [...(S.timetable[ttDay] || [])].sort((a, b) => toMin(a.start) - toMin(b.start));
    const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
    c.innerHTML = `<div class="days">${[1, 2, 3, 4, 5].map((d) => `<button class="${d === ttDay ? 'on' : ''}" data-d="${d}">${DAYS[d]}</button>`).join('')}</div>
      <div class="stagger" id="ls">${ls.map((l, i) => { const s = subj(l.subjectId) || { name: '?', emoji: '📘', color: '#888' }; const isNow = ttDay === now.getDay() && toMin(l.start) <= m && m < toMin(l.end); return `<div class="lesson ${isNow ? 'now' : ''}"><div class="tm">${l.start}<small>${l.end}</small></div><button class="box" data-l="${l.id}" style="--c:${s.color}"><span class="emo">${s.emoji}</span><div><b>${i + 1}. ${esc(s.name)}</b><span>${l.room ? 'sala ' + esc(l.room) : '&nbsp;'}</span></div></button></div>`; }).join('')}</div>
      ${!ls.length ? `<div class="empty"><div class="blob">🗓️</div><h4>Wolne?</h4><p>Dodaj lekcje na ${DAYS_FULL[ttDay]}. Godziny podpowiem automatycznie.</p></div>` : ''}
      <button class="btn" data-add style="margin-top:18px">${ic('plus')} Dodaj lekcję</button>
      ${ls.length ? `<button class="btn ghost" data-copy style="margin-top:10px">Skopiuj godziny na inne dni</button>` : ''}`;
    $$('[data-d]', c).forEach((b) => (b.onclick = () => { ttDay = +b.dataset.d; haptic(); pages.at(-1).refresh(); }));
    $('[data-add]', c).onclick = () => lessonSheet(ttDay);
    $$('[data-l]', c).forEach((b) => (b.onclick = () => lessonSheet(ttDay, S.timetable[ttDay].find((l) => l.id === b.dataset.l))));
    $('[data-copy]', c) && ($('[data-copy]', c).onclick = () => {
      const times = ls.map((l) => [l.start, l.end]);
      [1, 2, 3, 4, 5].forEach((d) => { if (d === ttDay) return; [...S.timetable[d]].sort((a, b) => toMin(a.start) - toMin(b.start)).forEach((l, i) => { if (times[i]) [l.start, l.end] = times[i]; }); });
      save(); toast('Godziny skopiowane na pozostałe dni ✓');
    });
  });
}
function lessonSheet(day, existing) {
  const ls = [...S.timetable[day]].sort((a, b) => toMin(a.start) - toMin(b.start));
  const last = ls.at(-1);
  const st = last ? fromMin(toMin(last.end) + 10) : '08:00';
  const l = existing ? { ...existing } : { id: uid(), subjectId: S.subjects[0]?.id, start: st, end: fromMin(toMin(st) + 45), room: '' };
  openSheet(`<h3>${existing ? 'Edytuj lekcję' : 'Nowa lekcja'} · ${DAYS[day]}</h3>
    <div class="field"><label>Przedmiot</label><div class="opts" id="l-s">${subjOrder().map((s) => `<button class="opt ${l.subjectId === s.id ? 'on' : ''}" data-v="${s.id}">${s.emoji} ${esc(s.name)}</button>`).join('')}</div></div>
    <div class="field"><label>Godziny</label><div class="row2"><input class="inp" type="time" id="l-a" value="${l.start}"><input class="inp" type="time" id="l-b" value="${l.end}"></div></div>
    <div class="field"><label>Sala</label><input class="inp" id="l-r" value="${esc(l.room)}" placeholder="Np. 104"></div>
    <button class="btn" id="l-save">${ic('check')} Zapisz</button>
    ${existing ? `<button class="btn danger" id="l-del" style="margin-top:10px">${ic('trash')} Usuń</button>` : ''}`,
  (sh, close) => {
    $$('#l-s [data-v]', sh).forEach((b) => (b.onclick = () => { $$('#l-s [data-v]', sh).forEach((x) => x.classList.remove('on')); b.classList.add('on'); l.subjectId = b.dataset.v; haptic(); }));
    $('#l-a', sh).onchange = (e) => { $('#l-b', sh).value = fromMin(toMin(e.target.value) + 45); };
    $('#l-save', sh).onclick = () => {
      l.start = $('#l-a', sh).value; l.end = $('#l-b', sh).value; l.room = $('#l-r', sh).value.trim();
      if (existing) Object.assign(existing, l); else S.timetable[day].push(l);
      save(); close(); refreshAll(); haptic('success');
    };
    existing && ($('#l-del', sh).onclick = () => { S.timetable[day] = S.timetable[day].filter((x) => x !== existing); save(); close(); refreshAll(); });
  });
}

/* ======================= SUBJECTS ======================= */
function pageSubjects() {
  openPage('Przedmioty', (c) => {
    c.innerHTML = `<div class="list stagger">${S.subjects.map((s) => `<button class="row" data-s="${s.id}"><div class="ic" style="background:${s.color}22">${s.emoji}</div><div class="main"><b>${esc(s.name)}</b><span><span style="color:${s.color}">●</span> ${S.notes.filter((n) => n.subjectId === s.id).length} notatek · ${S.grades.filter((g) => g.subjectId === s.id).length} ocen</span></div><div class="end">${ic('chev')}</div></button>`).join('')}</div>
      <button class="btn" data-add style="margin-top:16px">${ic('plus')} Dodaj przedmiot</button>`;
    $$('[data-s]', c).forEach((b) => (b.onclick = () => subjectSheet(subj(b.dataset.s))));
    $('[data-add]', c).onclick = () => subjectSheet();
  });
}
function subjectSheet(existing) {
  const s = existing ? { ...existing } : { id: uid(), name: '', emoji: '📘', color: COLORS[S.subjects.length % COLORS.length] };
  openSheet(`<h3>${existing ? 'Edytuj przedmiot' : 'Nowy przedmiot'}</h3>
    <div class="field"><input class="inp big" id="s-n" placeholder="Nazwa" value="${esc(s.name)}"></div>
    <div class="field"><label>Ikona</label><div class="emojis" id="s-e">${EMOJIS.map((e) => `<button class="${s.emoji === e ? 'on' : ''}" data-v="${e}">${e}</button>`).join('')}</div></div>
    <div class="field"><label>Kolor</label><div class="colors" id="s-c">${COLORS.map((cl) => `<button class="${s.color === cl ? 'on' : ''}" data-v="${cl}" style="--c:${cl}"></button>`).join('')}</div></div>
    <button class="btn" id="s-save">${ic('check')} Zapisz</button>
    ${existing ? `<button class="btn danger" id="s-del" style="margin-top:10px">${ic('trash')} Usuń przedmiot</button>` : ''}`,
  (sh, close) => {
    const pick = (sel, key) => $$(sel + ' [data-v]', sh).forEach((b) => (b.onclick = () => { $$(sel + ' [data-v]', sh).forEach((x) => x.classList.remove('on')); b.classList.add('on'); s[key] = b.dataset.v; haptic(); }));
    pick('#s-e', 'emoji'); pick('#s-c', 'color');
    $('#s-save', sh).onclick = () => {
      s.name = $('#s-n', sh).value.trim(); if (!s.name) return haptic('warn');
      if (existing) Object.assign(existing, s); else S.subjects.push(s);
      save(); close(); refreshAll();
    };
    let armed = false;
    existing && ($('#s-del', sh).onclick = (e) => {
      if (!armed) { armed = true; e.currentTarget.innerHTML = 'Usunie też oceny i lekcje. Kliknij ponownie'; haptic('warn'); return; }
      S.subjects = S.subjects.filter((x) => x !== existing); S.grades = S.grades.filter((g) => g.subjectId !== existing.id);
      Object.keys(S.timetable).forEach((d) => (S.timetable[d] = S.timetable[d].filter((l) => l.subjectId !== existing.id)));
      save(); close(); refreshAll();
    });
  });
}

/* ======================= MORE / SETTINGS ======================= */
function viewMore(v) {
  const today = (S.timetable[new Date().getDay()] || []).length;
  v.innerHTML = `
  <div class="title-row"><div><h1 class="serif">Więcej</h1><div class="sub">Plan, oceny i ustawienia</div></div></div>
  <div class="list stagger">
    <button class="row" data-go="timetable"><div class="ic">${ic('calendar')}</div><div class="main"><b>Plan lekcji</b><span>${today ? `dziś ${today} ${plural(today, 'lekcja', 'lekcje', 'lekcji')}` : 'tygodniowy rozkład'}</span></div><div class="end">${ic('chev')}</div></button>
    <button class="row" data-go="grades"><div class="ic">${ic('chart')}</div><div class="main"><b>Oceny</b><span>średnia ${overallAvg()?.toFixed(2).replace('.', ',') || '–'}</span></div><div class="end">${ic('chev')}</div></button>
    <button class="row" data-go="subjects"><div class="ic">${ic('book')}</div><div class="main"><b>Przedmioty</b><span>${S.subjects.length} przedmiotów</span></div><div class="end">${ic('chev')}</div></button>
    <button class="row" data-go="focus"><div class="ic">${ic('timer')}</div><div class="main"><b>Fokus</b><span>timer Pomodoro</span></div><div class="end">${ic('chev')}</div></button>
  </div>
  <div class="section-h"><h3>Aplikacja</h3></div>
  <div class="list stagger">
    <button class="row" data-go="settings"><div class="ic">${ic('gear')}</div><div class="main"><b>Ustawienia</b><span>wygląd, AI, powiadomienia</span></div><div class="end">${ic('chev')}</div></button>
    <button class="row" data-theme><div class="ic">${ic(document.documentElement.classList.contains('dark') ? 'sun' : 'moon')}</div><div class="main"><b>Tryb ${document.documentElement.classList.contains('dark') ? 'jasny' : 'ciemny'}</b><span>przełącz szybko</span></div></button>
  </div>
  <p class="kbd-note" style="text-align:center;margin-top:30px">Zeszyt · v1.1</p>`;
  bindCommon(v);
  $('[data-theme]', v).onclick = () => { S.theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark'; save(); applyTheme(); haptic(); render(); };
}
function bindCommon(root) {
  $$('[data-go]', root).forEach((b) => (b.onclick = () => ({ timetable: pageTimetable, grades: pageGrades, subjects: pageSubjects, settings: pageSettings, focus: pageFocus })[b.dataset.go]()));
  $$('[data-tabgo]', root).forEach((b) => (b.onclick = () => go(b.dataset.tabgo)));
  $$('[data-note]', root).forEach((b) => (b.onclick = () => pageNote(b.dataset.note)));
  bindRems(root);
}
function pageSettings() {
  openPage('Ustawienia', (c) => {
    c.innerHTML = `
      <div class="field"><label>Twoje imię</label><input class="inp" id="st-n" value="${esc(S.name)}" placeholder="Jak mam się do Ciebie zwracać?"></div>
      <div class="field"><label>Motyw</label><div class="seg" id="st-th">${[['light', 'Jasny'], ['dark', 'Ciemny'], ['auto', 'Auto']].map(([k, l]) => `<button class="${S.theme === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}<span class="pill"></span></div></div>
      <div class="field"><label>Kolor akcentu</label><div class="colors" id="st-ac">${ACCENTS.map(([n, cl]) => `<button class="${S.accent === cl ? 'on' : ''}" data-v="${cl}" style="--c:${cl}" aria-label="${n}"></button>`).join('')}</div></div>
      <div class="section-h"><h3>✨ AI do notatek</h3></div>
      <div class="card" id="aicard"></div>
      <div class="section-h"><h3>Powiadomienia</h3></div>
      <div class="list">
        <button class="row" id="st-dg"><div class="ic">🌙</div><div class="main"><b>Wieczorny przegląd</b><span>o 19:00: co masz jutro</span></div><span class="switch ${S.digest ? 'on' : ''}"></span></button>
        <button class="row" id="st-np"><div class="ic">🔔</div><div class="main"><b>Zezwól na powiadomienia</b><span>potrzebne do przypominajek</span></div><div class="end">${ic('chev')}</div></button>
        <button class="row" id="st-ex"><div class="ic">⏱️</div><div class="main"><b>Dokładne alarmy</b><span>przypomnienia co do minuty (Android 12+)</span></div><div class="end">${ic('chev')}</div></button>
        <button class="row" id="st-tn"><div class="ic">🧪</div><div class="main"><b>Testowe powiadomienie</b><span>za 5 sekund</span></div></button>
      </div>
      <div class="section-h"><h3>Rok szkolny</h3></div>
      <div class="field"><label>Koniec roku (wakacje)</label><input class="inp" type="date" id="st-v" value="${S.vacation}"></div>
      <div class="section-h"><h3>Kopia zapasowa</h3></div>
      <div class="row2"><button class="btn ghost" id="st-exp">${ic('upload')} Eksport</button><button class="btn ghost" id="st-imp">${ic('download')} Import</button></div>
      <p class="kbd-note">Eksport kopiuje dane (bez zdjęć) do schowka — wklej je np. do notatek albo maila.</p>
      <button class="btn danger" id="st-wipe" style="margin-top:22px">${ic('trash')} Wyczyść wszystkie dane</button>`;
    const seg = $('#st-th', c), pill = $('.pill', seg);
    const movePill = () => { const b = $('.on', seg); pill.style.left = b.offsetLeft + 'px'; pill.style.width = b.offsetWidth + 'px'; };
    requestAnimationFrame(movePill);
    $$('[data-v]', seg).forEach((b) => (b.onclick = () => { $$('[data-v]', seg).forEach((x) => x.classList.toggle('on', x === b)); S.theme = b.dataset.v; save(); applyTheme(); movePill(); haptic(); }));
    $$('#st-ac [data-v]', c).forEach((b) => (b.onclick = () => { $$('#st-ac [data-v]', c).forEach((x) => x.classList.toggle('on', x === b)); S.accent = b.dataset.v; save(); applyTheme(); haptic(); }));
    const drawAI = () => {
      const g = S.aiProvider !== 'claude', box = $('#aicard', c);
      const models = g ? [['gemini-flash-lite-latest', 'Lite · najwięcej darmowych'], ['gemini-flash-latest', 'Flash · dokładniejszy']] : [['claude-haiku-5-5', 'Szybki · najtańszy'], ['claude-sonnet-5-5', 'Dokładny'], ['claude-opus-5-5', 'Najmocniejszy']];
      box.innerHTML = `<div class="seg" id="st-pv"><button class="${g ? 'on' : ''}" data-v="gemini">Gemini · za darmo</button><button class="${!g ? 'on' : ''}" data-v="claude">Claude · płatny</button><span class="pill"></span></div>
        <div class="field"><label>${g ? 'Klucz Gemini API' : 'Klucz API Anthropic'}</label><input class="inp" id="st-k" type="password" value="${esc(g ? S.geminiKey : S.apiKey)}" placeholder="${g ? 'AIza…' : 'sk-ant-…'}" autocomplete="off"></div>
        <div class="field" style="margin-bottom:12px"><label>Model</label><div class="opts" id="st-m">${models.map(([k, l]) => `<button class="opt ${(g ? S.geminiModel : S.model) === k ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div></div>
        <button class="btn small" id="st-test">Sprawdź klucz</button>
        <p class="kbd-note">${g
          ? `Darmowy klucz bez karty: wejdź na <a class="link" href="https://aistudio.google.com/apikey">aistudio.google.com/apikey</a>, zaloguj się kontem Google i kliknij „Create API key”. Darmowy plan ma dzienny limit zapytań — jak się skończy, apka sama przełączy się na model Lite, a limit odnawia się codziennie. Uwaga: w darmowym planie Google może używać wysłanych treści do ulepszania swoich modeli.`
          : `Klucz z <a class="link" href="https://console.anthropic.com/settings/keys">console.anthropic.com</a> — płatne za użycie, ale model „Szybki” to ułamek grosza za notatkę.`} Klucz zostaje tylko na Twoim telefonie.</p>`;
      const seg = $('#st-pv', box), pill = $('.pill', seg);
      requestAnimationFrame(() => { const b = $('.on', seg); pill.style.left = b.offsetLeft + 'px'; pill.style.width = b.offsetWidth + 'px'; });
      $$('[data-v]', seg).forEach((b) => (b.onclick = () => { S.aiProvider = b.dataset.v; save(); haptic(); drawAI(); }));
      $$('#st-m [data-v]', box).forEach((b) => (b.onclick = () => { $$('#st-m [data-v]', box).forEach((x) => x.classList.toggle('on', x === b)); g ? (S.geminiModel = b.dataset.v) : (S.model = b.dataset.v); save(); haptic(); }));
      $('#st-k', box).oninput = (e) => { g ? (S.geminiKey = e.target.value.trim()) : (S.apiKey = e.target.value.trim()); save(); };
      $('#st-test', box).onclick = async (e) => {
        const b = e.currentTarget; if (!hasAI()) return toast('Wklej najpierw klucz');
        b.textContent = 'Sprawdzam…';
        try { await testKey(aiCfg()); b.textContent = 'Działa ✓'; haptic('success'); confetti(innerWidth / 2, b.getBoundingClientRect().y, 40); } catch (er) { b.textContent = 'Sprawdź klucz'; toast(er.message); haptic('warn'); }
      };
    };
    drawAI();
    $('#st-n', c).oninput = (e) => { S.name = e.target.value.trim(); save(); };
    $('#st-v', c).onchange = (e) => { S.vacation = e.target.value || S.vacation; save(); };
    $('#st-dg', c).onclick = async (e) => { S.digest = !S.digest; $('.switch', e.currentTarget).classList.toggle('on', S.digest); save(); if (S.digest) await ensureNotif(); scheduleDigest(); haptic(); };
    $('#st-np', c).onclick = async () => { notifOk = null; const ok = await ensureNotif(); toast(ok ? 'Powiadomienia włączone ✓' : NATIVE ? 'Włącz je w ustawieniach telefonu' : 'Dostępne w aplikacji na Androidzie'); if (ok) { S.reminders.forEach(scheduleReminder); scheduleDigest(); } };
    $('#st-ex', c).onclick = async () => { if (!NATIVE) return; try { const r = await LocalNotifications.checkExactNotificationSetting(); if (r.exact_alarm === 'granted') toast('Już włączone ✓'); else await LocalNotifications.changeExactNotificationSetting(); } catch { toast('Niedostępne na tym telefonie'); } };
    $('#st-tn', c).onclick = async () => { if (!(await ensureNotif())) return toast('Brak zgody na powiadomienia'); await LocalNotifications.schedule({ notifications: [{ id: 3, title: '👋 Działa!', body: 'Tak będą wyglądać Twoje przypominajki.', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, smallIcon: 'ic_stat_icon', iconColor: S.accent }] }); toast('Za 5 sekund… zablokuj ekran 😉'); };
    $('#st-exp', c).onclick = async () => { const { apiKey, geminiKey, ...rest } = S; try { await navigator.clipboard.writeText(JSON.stringify(rest)); toast('Skopiowano kopię do schowka ✓'); } catch { toast('Nie udało się skopiować'); } };
    $('#st-imp', c).onclick = () => openSheet(`<h3>Import</h3><textarea class="inp" id="im" style="min-height:160px" placeholder="Wklej tu skopiowaną kopię…"></textarea><button class="btn" id="im-go" style="margin-top:12px">Wczytaj</button>`, (sh, close) => {
      $('#im-go', sh).onclick = () => { try { const d = JSON.parse($('#im', sh).value); if (!d.subjects) throw 0; S = { ...blank(), ...d, apiKey: S.apiKey, geminiKey: S.geminiKey, onboarded: true }; save(); applyTheme(); close(); closePage(); toast('Wczytano ✓'); S.reminders.forEach(scheduleReminder); } catch { toast('To nie wygląda na kopię z Zeszytu'); haptic('warn'); } };
    });
    let armed = 0;
    $('#st-wipe', c).onclick = async (e) => {
      if (++armed < 2) { e.currentTarget.innerHTML = 'Na pewno? To usunie WSZYSTKO. Kliknij ponownie'; haptic('warn'); return; }
      for (const n of S.notes) for (const p of n.photos) await photoDel(p);
      S.reminders.forEach(cancelReminder); S = blank(); S.onboarded = true; save(); applyTheme(); closePage(); toast('Wyczyszczono');
    };
  });
}

/* ======================= ONBOARDING ======================= */
function onboarding() {
  const o = document.createElement('div'); o.className = 'onb';
  o.innerHTML = `<div class="art"><div class="logo">${ic('note')}</div></div>
    <h1>Zeszyt.</h1>
    <p>Przypominajki o sprawdzianach, notatki ze zdjęć streszczane przez AI, fiszki, quizy, plan lekcji i oceny — w jednym miejscu.</p>
    <input class="inp" id="ob-n" placeholder="Jak masz na imię?" style="margin-bottom:12px">
    <button class="btn" id="ob-go">Zaczynamy →</button>`;
  document.body.append(o);
  $('#ob-go', o).onclick = async () => {
    S.name = $('#ob-n', o).value.trim(); S.onboarded = true; save(); haptic('success');
    o.style.transition = 'opacity .5s, transform .6s var(--ease)'; o.style.opacity = 0; o.style.transform = 'scale(1.06)';
    setTimeout(() => { o.remove(); render(true); }, 500);
    confetti(innerWidth / 2, innerHeight * 0.4);
    ensureNotif();
  };
}

/* ======================= BOOT ======================= */
async function boot() {
  try { S = await kvGet('state'); } catch {}
  S = { ...blank(), ...(S || {}) };
  if ((S.subjVer || 1) < 2) { SUBJECT_LIST.forEach(([name, emoji], i) => { if (!S.subjects.some((x) => x.name.toLowerCase() === name.toLowerCase())) S.subjects.push({ id: uid(), name, emoji, color: COLORS[i % COLORS.length] }); }); S.subjVer = 2; save(); }
  if (['#7c6cf0', '#de5f95', '#4f9a76', '#ec7f52', '#3384c4', '#3a3a40'].includes(S.accent)) S.accent = '#2f6bff';
  applyTheme();
  buildShell();
  render(true);
  if (!S.onboarded) onboarding();
  if (NATIVE) {
    CapApp.addListener('backButton', () => {
      if (sheetStack.length) return sheetStack.at(-1)();
      if (pages.length) return closePage();
      if (tab !== 'home') return go('home');
      CapApp.minimizeApp();
    });
    CapApp.addListener('resume', () => { refreshAll(); scheduleDigest(); });
    LocalNotifications.addListener('localNotificationActionPerformed', (a) => { const rid = a.notification?.extra?.rid; if (rid) { const r = S.reminders.find((x) => x.id === rid); r && reminderSheet(r); } });
    scheduleDigest();
  }
  // resume pending AI jobs that were interrupted
  S.notes.filter((n) => n.status === 'pending').forEach((n) => { n.status = 'error'; n.error = 'Przerwano — spróbuj ponownie.'; });
  setInterval(() => { if (!pages.length && !sheetStack.length && tab === 'home') render(); }, 60000);
  window.addEventListener('resize', () => moveInd());
}
boot();
