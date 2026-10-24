/* Rishe 1.6.2 – English ↔ Persian dictionary and local-first vocabulary learning. */
(() => {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const main = $('#main');
const APP_VERSION = '1.6.2';
const SUPPORT_URL_FALLBACK = 'https://www.coffeebede.com/mosep29';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bi = (en, fa, cls = 'bi-stack') => `<span class="${cls}"><span class="bi-en" lang="en" dir="ltr">${esc(en)}</span><span class="fa bi-fa" lang="fa" dir="rtl">${esc(fa)}</span></span>`;
const REMINDER_KEY = 'rishe.notifications';
function reminderSettings() {
  const raw = store.get(REMINDER_KEY, {});
  return {
    enabled: raw?.enabled === true,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw?.time || '')) ? raw.time : '19:00',
    lastSentDay: /^\d{4}-\d{2}-\d{2}$/.test(String(raw?.lastSentDay || '')) ? raw.lastSentDay : ''
  };
}
function saveReminderSettings(next) { store.set(REMINDER_KEY, { ...reminderSettings(), ...next }); }
function currentLocalDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const POS = {
  v: ['verb', 'فعل'], n: ['noun', 'اسم'], adj: ['adjective', 'صفت'], adv: ['adverb', 'قید'],
  prep: ['preposition', 'حرف اضافه'], conj: ['conjunction', 'حرف ربط'], pron: ['pronoun', 'ضمیر']
};
const POS_ORDER = ['v', 'n', 'adj', 'adv'];
const posParts = p => String(p || '').toLowerCase().split(/[\/,;]|\s+or\s+/).map(s => s.trim()).filter(Boolean);
const posLabel = p => posParts(p).map(x => (POS[x] ? POS[x][0] : x)).join(' / ');
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
let D, famById = new Map(), wordMap = new Map(), allForms = [], prefixes = [], suffixes = [];
let learningStore = null, wordIdMap = new Map(), wordIndexById = new Map(), allWordIds = [];
let importRecoveryNotice = '';
const IMPORT_TRANSACTION_KEY = 'rishe.import.transaction';
const IMPORT_SNAPSHOT_KEYS = ['rishe.learning', 'rishe.favs', 'rishe.box', 'rishe.theme', 'rishe.src', 'rishe.notifications'];
function recoverInterruptedImport(storage) {
  if (!storage) return;
  try {
    const raw = storage.getItem(IMPORT_TRANSACTION_KEY);
    if (!raw) return;
    const backup = JSON.parse(raw);
    if (backup?.schemaVersion !== 1 || !backup.keys || typeof backup.keys !== 'object') throw new Error('The import recovery marker is invalid.');
    for (const key of IMPORT_SNAPSHOT_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(backup.keys, key)) continue;
      const value = backup.keys[key];
      if (value == null) storage.removeItem(key); else storage.setItem(key, value);
    }
    storage.removeItem(IMPORT_TRANSACTION_KEY);
    importRecoveryNotice = 'An interrupted data import was rolled back; the previous local data was restored.';
  } catch (error) {
    importRecoveryNotice = `Import recovery needs attention: ${error.message}. Do not clear local storage until the backup is recovered.`;
  }
}
const wordIdFor = w => RisheLearning.wordId(w, famById.get(w?.f)?.base || '');
const wordFromId = id => { const i = wordIndexById.get(String(id)); return i == null ? null : D.words[i]; };

/* ---------- data ---------- */
async function load() {
  const res = await fetch('data.json');
  if (!res.ok) throw new Error(`Dictionary request failed (${res.status})`);
  D = await res.json();
  if (!D || !Array.isArray(D.families) || !Array.isArray(D.words) || !Array.isArray(D.affixes)) {
    throw new Error('Dictionary data has an unexpected structure');
  }
  D.families.forEach(f => famById.set(f.id, f));
  D.words.forEach((w, i) => {
    const k = w.w.toLowerCase();
    if (!wordMap.has(k)) wordMap.set(k, []);
    wordMap.get(k).push(i);
    const id = wordIdFor(w);
    if (id && !wordIndexById.has(id)) { wordIndexById.set(id, i); wordIdMap.set(i, id); allWordIds.push(id); }
  });
  allForms = [...wordMap.keys()].sort();
  let browserStorage = null;
  try { browserStorage = window.localStorage; } catch { /* createStore will explain that persistence is unavailable. */ }
  recoverInterruptedImport(browserStorage);
  learningStore = RisheLearning.createStore(browserStorage);
  D.affixes.forEach((a, gi) => a.variants.forEach(v => {
    const s = v.replace(/-/g, '').trim();
    (a.type === 'Prefix' ? prefixes : suffixes).push({ s, v, gi });
  }));
  prefixes.sort((a, b) => b.s.length - a.s.length);
  const nf = D.families.filter(f => !f.solo).length;
  const standaloneRecords = D.families.filter(f => f.solo);
  const ns = standaloneRecords.length;
  const singleTokenCount = standaloneRecords.filter(f => !/\s/.test(String(f.base || '').trim())).length;
  const multiwordCount = ns - singleTokenCount;
  const uniqueForms = new Set(D.words.map(w => String(w.w || '').trim().toLocaleLowerCase())).size;
  const draftWords = D.words.filter(w => w.review_status === 'draft' || famById.get(w.f)?.draft).length;
  const reviewedWords = D.words.filter(w => w.review_status === 'reviewed').length;
  const sourceCuratedWords = D.words.filter(w => w.review_status === 'source-curated').length;
  const stats = $('#footer-stats');
  if (stats) stats.textContent = `${nf.toLocaleString()} family candidates · ${ns.toLocaleString()} standalone entries (${singleTokenCount.toLocaleString()} single-token, ${multiwordCount.toLocaleString()} multiword) · ${uniqueForms.toLocaleString()} unique forms · ${draftWords.toLocaleString()} Draft word records · ${sourceCuratedWords.toLocaleString()} source-curated but unverified word records · ${reviewedWords.toLocaleString()} explicitly reviewed word records. Offline-ready after first load.`;
  suffixes.sort((a, b) => b.s.length - a.s.length);
}

/* ---------- lookup engine ---------- */
const IRREGULAR = { knew: 'know', known: 'know', thought: 'think', felt: 'feel', wrote: 'write', written: 'write' };

function normalizeFa(s) {
  return s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌ً-ٟ]/g, ' ').replace(/\s+/g, ' ').trim();
}
const isPersian = s => /[؀-ۿ]/.test(s);

// A source-curated record is not the same as an independently reviewed record.
function reviewBadge(record) {
  const status = record?.review_status || (record?.draft ? 'draft' : 'needs-review');
  if (status === 'reviewed') return '<span class="tag reviewed" title="Explicitly marked as independently editorially reviewed">Reviewed</span>';
  if (status === 'source-curated') return '<span class="tag source-curated" title="From the starter workbook; not independently verified">Source-curated</span>';
  if (status === 'needs-review') return '<span class="tag draft" title="Editorial review status is unspecified; verify before relying on this content">Needs review</span>';
  return '<span class="tag draft" title="Draft content; not independently editorially reviewed">Draft</span>';
}

function undouble(s) { return s.length > 2 && s.at(-1) === s.at(-2) ? s.slice(0, -1) : null; }

function inflectionStems(w) {
  const out = [];
  const add = (stem, label, fa) => { if (stem.length > 1) out.push({ stem, label, fa }); };
  if (IRREGULAR[w]) add(IRREGULAR[w], 'irregular form', 'شکل بی‌قاعده');
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y', 'plural / 3rd person “-s”', 'جمع یا سوم‌شخص مفرد');
  if (w.endsWith('es')) add(w.slice(0, -2), 'plural / 3rd person “-s”', 'جمع یا سوم‌شخص مفرد');
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1), 'plural / 3rd person “-s”', 'جمع یا سوم‌شخص مفرد');
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y', 'past tense “-ed”', 'گذشته');
  if (w.endsWith('ed')) { const b = w.slice(0, -2); add(b, 'past tense “-ed”', 'گذشته'); add(b + 'e', 'past tense “-ed”', 'گذشته'); const u = undouble(b); if (u) add(u, 'past tense “-ed”', 'گذشته'); }
  if (w.endsWith('ing')) { const b = w.slice(0, -3); add(b, '“-ing” form', 'شکل ing‌دار'); add(b + 'e', '“-ing” form', 'شکل ing‌دار'); const u = undouble(b); if (u) add(u, '“-ing” form', 'شکل ing‌دار'); }
  return out;
}

function stemCandidates(r) {  // spelling repairs after removing a suffix
  const c = [r, r + 'e'];
  if (r.endsWith('i')) c.push(r.slice(0, -1) + 'y');
  const u = undouble(r); if (u) c.push(u);
  return c;
}

function guessByAffixes(w) {
  const best = [];
  const tryStem = (stem, pre, suf) => {
    for (const cand of stemCandidates(stem)) {
      if (cand.length >= 3 && wordMap.has(cand) && cand !== w) best.push({ stem: cand, pre, suf, score: (pre ? 1 : 0) + (suf ? 1 : 0) });
    }
  };
  const preOpts = [null, ...prefixes.filter(p => w.startsWith(p.s) && w.length - p.s.length >= 3)];
  const sufOpts = [null, ...suffixes.filter(s => w.endsWith(s.s) && w.length - s.s.length >= 3)];
  for (const p of preOpts) for (const s of sufOpts) {
    if (!p && !s) continue;
    let core = w;
    if (p) core = core.slice(p.s.length);
    if (s) core = core.slice(0, -s.s.length);
    if (core.length >= 2) tryStem(core, p, s);
  }
  best.sort((a, b) => a.score - b.score || b.stem.length - a.stem.length);
  return best[0] || null;
}

function lev(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let min = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < min) min = cur[j];
    }
    if (min > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function similar(q, n = 6) {
  const out = [];
  for (const f of allForms) {
    let d = lev(q, f, q.length > 5 ? 2 : 1);
    if (f.startsWith(q) || q.startsWith(f)) d = Math.min(d, 1);
    if (d <= (q.length > 5 ? 2 : 1)) out.push([d, f]);
  }
  return out.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length).slice(0, n).map(x => x[1]);
}

function searchPersian(q) {
  const nq = normalizeFa(q);
  const hits = [];
  D.words.forEach((w, i) => {
    const segs = normalizeFa(w.fa || '').split(/[؛;\/،]/).map(s => s.trim()).filter(Boolean);
    let score = 0;
    for (const s of segs) { if (s === nq) score = Math.max(score, 3); else if (s.startsWith(nq)) score = Math.max(score, 2); else if (nq.length > 1 && s.includes(nq)) score = Math.max(score, 1); }
    if (score) hits.push({ i, score });
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, 25).map(h => h.i);
}

function lookup(raw) {
  const q = raw.trim();
  if (!q) return { kind: 'empty' };
  if (isPersian(q)) { const r = searchPersian(q); return r.length ? { kind: 'persian', q, results: r } : { kind: 'none', q, similar: [] }; }
  const w = q.toLowerCase().replace(/[^a-z\-' ]/g, '').replace(/['’]s$/, '').trim().replace(/\s+/g, ' ');
  if (!w) return { kind: 'none', q, similar: [] };
  if (wordMap.has(w)) return { kind: 'exact', q: w, idx: wordMap.get(w) };
  for (const s of inflectionStems(w)) if (wordMap.has(s.stem)) return { kind: 'inflected', q: w, idx: wordMap.get(s.stem), via: s };
  const g = guessByAffixes(w);
  if (g) return { kind: 'guess', q: w, idx: wordMap.get(g.stem), guess: g };
  return { kind: 'none', q: w, similar: similar(w) };
}

/* ---------- helpers for rendering ---------- */
const wordLink = w => `#/w/${encodeURIComponent(w.toLowerCase())}`;
const speak = text => {
  if (!('speechSynthesis' in window)) return toast('Speech is not supported on this device');
  const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = .9;
  speechSynthesis.cancel(); speechSynthesis.speak(u);
};
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }

function stemOf(w) {
  let s = w.w.toLowerCase();
  if (w.pre) s = s.slice(w.pre[1].replace(/-/g, '').length);
  if (w.suf) s = s.slice(0, s.length - w.suf[1].replace(/-/g, '').length);
  return s;
}
const aff = gi => D.affixes[gi];
const segHtml = (cls, s, e, f) => `<div class="seg ${cls}"><div class="s">${esc(s)}</div>${e ? `<div class="e">${esc(e)}</div>` : ''}${f ? `<div class="f" lang="fa" dir="rtl">${esc(f)}</div>` : ''}</div>`;

function recents() { return store.get('rishe.recent', []); }
function pushRecent(w) { store.set('rishe.recent', [w, ...recents().filter(x => x !== w)].slice(0, 8)); }

/* ---------- views ---------- */
function searchBox(value = '') {
  return `<form class="search" id="sform" role="search" autocomplete="off">
    <div class="field ${value ? 'has' : ''}" id="field">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>
      <input id="q" type="text" inputmode="search" enterkeyhint="search" role="combobox" aria-expanded="false" aria-controls="sugg" aria-autocomplete="list"
        placeholder="Type an English word… (or Persian)" value="${esc(value)}" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Search a word">
      <button class="clear" type="button" aria-label="Clear">×</button>
      <button class="go" type="submit">Find</button>
    </div>
    <ul class="sugg" id="sugg" role="listbox" hidden></ul>
  </form>`;
}

function viewHome() {
  const rec = recents();
  main.innerHTML = `
    <section class="hero enter">
      <h1>Every word has a <em>root</em>.</h1>
      <p>Type any English word to find its root, its meaning in Persian and the whole family it belongs to.
        <span class="fa" lang="fa">هر واژه‌ای را بنویسید تا ریشه، معنی فارسی و خانوادهٔ آن را ببینید.</span></p>
    </section>
    ${searchBox()}
    ${wotdHtml()}
    ${rec.length ? `<div class="label">Recent <span class="fa" lang="fa">اخیر</span></div><div class="chips">${rec.map(w => `<a class="chip" href="${wordLink(w)}">${esc(w)}</a>`).join('')}</div>` : ''}
    <div class="label">Try these <span class="fa" lang="fa">امتحان کنید</span></div>
    <div class="chips">${['inactivity', 'reaction', 'invisible', 'transportation', 'misinformation', 'creativity', 'rewriting', 'developed'].map(w => `<a class="chip" href="${wordLink(w)}">${w}</a>`).join('')}</div>
    <div class="label">Browse by level <span class="fa" lang="fa">بر اساس سطح</span></div>
    <div class="chips">${LEVELS.filter(l => D.families.some(f => f.cefr === l && !f.solo)).map(l => `<a class="chip" href="#/families/${l}">${l} · ${D.families.filter(f => f.cefr === l && !f.solo).length} families</a>`).join('')}<a class="chip" href="#/singles">Standalone entries · ${D.families.filter(f => f.solo).length}</a></div>`;
  bindSearch();
}

function entryCard(wi, ctx) {
  const w = D.words[wi], f = famById.get(w.f);
  const tags = [...posParts(w.pos).map(p => `<span class="tag">${bi(POS[p]?.[0] || p, POS[p]?.[1] || p)}</span>`), w.cefr ? `<span class="tag cefr">${esc(w.cefr)}</span>` : '', reviewBadge(w)].join('');
  const inflectionFa = ({ '3rd person singular': 'سوم‌شخص مفرد', 'past tense': 'گذشتهٔ ساده', gerund: 'صورت ing / اسم مصدر', 'plural noun': 'جمع اسم' })[w.form_type] || 'صورت صرفی';
  const inflectionNote = w.form_type ? `<p class="sub inflection-note">${bi(`Generated ${w.form_type} of ${w.form_of || ''} · draft`, `${inflectionFa} تولیدشده از ${w.form_of || ''} · پیش‌نویس`)}</p>` : '';
  return `<section class="card entry enter">
    <div class="row"><h1 class="word" lang="en">${esc(w.w)}</h1><button class="say" data-say="${esc(w.w)}" aria-label="Pronounce ${esc(w.w)}"><svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16.500 9a4 4 0 010 6M19 6.500a8 8 0 010 11"/></svg></button>
      <div class="actions"><button class="say fav" data-fav="${esc(w.w)}" aria-pressed="${isFav(w.w)}" aria-label="Save word"><svg viewBox="0 0 24 24"><path d="M6 4h12v17l-6-4-6 4z"/></svg></button>
      <button class="say" data-add-collection="${esc(wordIdFor(w))}" aria-label="Add word to a collection" title="Add to collection">+</button>
      <button class="say share" data-share="${esc(w.w)}" aria-label="Share"><svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/></svg></button></div></div>
    <div class="tags">${tags}</div>
    <p class="meaning" lang="fa" dir="rtl"><small>Persian meaning · معنی فارسی</small>${esc(w.fa)}</p>${inflectionNote}
  </section>`;
}

function rootCard(wi) {
  const w = D.words[wi], f = famById.get(w.f);
  const isBase = w.w.toLowerCase() === f.base.toLowerCase() || f.base.toLowerCase().split(/\s*\/\s*/).includes(w.w.toLowerCase());
  const baseIdx = f.words.find(i => D.words[i].w.toLowerCase() === f.base.toLowerCase());
  const baseTxt = baseIdx != null ? `<a class="root-word" href="${wordLink(f.base)}">${esc(f.base)}</a>` : `<span class="root-word">${esc(f.base)}</span>`;
  return `<section class="card enter"><h2>Root word <span class="fa" lang="fa">ریشهٔ واژه</span></h2>
    <div class="root">
      <div class="root-main">${baseTxt}<span class="root-fa" lang="fa" dir="rtl">${esc(f.fa)}</span></div>
      <div class="etym">${esc(f.root)}</div>
      <div class="kv"><span>Family: <b>${esc(f.base)}</b></span>${f.topic ? `<span>Topic: <b>${esc(f.topic)}</b></span>` : ''}${f.pattern ? `<span>Pattern: <b>${esc(f.pattern)}</b></span>` : ''}</div>
      ${f.draft ? `<div class="kv"><span>⚠ Draft entry: Persian wording is AI-written and not yet reviewed.</span></div>` : ''}
      ${isBase ? `<div class="kv"><span>✓ “${esc(w.w)}” is itself the base of this family.</span></div>` : ''}
    </div></section>`;
}

function buildCard(wi) {
  const w = D.words[wi];
  const f = famById.get(w.f);
  if (w.w.toLowerCase() === f.base.toLowerCase()) return '';
  if (!w.pre && !w.suf) return `<section class="card enter"><h2>How it is built <span class="fa" lang="fa">ساختار واژه</span></h2><p class="sub" style="margin:0">A compound or irregular formation – see the family below for related forms.</p></section>`;
  const parts = [];
  if (w.pre) { const a = aff(w.pre[0]); parts.push(segHtml('pre', w.pre[1], `${a.en}`, a.fa)); }
  const st = stemOf(w), bs = f.base.toLowerCase().split(/\s*\/\s*/)[0];
  const shown = (st && (bs.startsWith(st) || st.startsWith(bs.slice(0, -1)))) ? bs : (st || bs);
  parts.push(segHtml('stem', shown, 'root', ''));
  if (w.suf) { const a = aff(w.suf[0]); parts.push(segHtml('suf', w.suf[1], `${a.en}`, a.fa)); }
  return `<section class="card enter"><h2>How it is built <span class="fa" lang="fa">ساختار واژه</span></h2>
    <div class="build">${parts.join('<span class="plus">+</span>')}</div></section>`;
}

function familyCard(fid, currentWi) {
  const f = famById.get(fid);
  const groups = {};
  f.words.forEach(i => { const p = posParts(D.words[i].pos)[0] || 'other'; (groups[p] ||= []).push(i); });
  const keys = [...POS_ORDER.filter(k => groups[k]), ...Object.keys(groups).filter(k => !POS_ORDER.includes(k))];
  return `<section class="card enter"><h2>Word family · ${f.words.length} words <span class="fa" lang="fa">خانوادهٔ واژه</span></h2>
    ${keys.map(k => `<div class="fam-group"><h3>${esc(POS[k]?.[0] || k)} <span class="fa" lang="fa">${esc(POS[k]?.[1] || '')}</span></h3><ul class="members">
      ${groups[k].map(i => { const m = D.words[i]; const base = m.w.toLowerCase() === f.base.toLowerCase();
        return `<li><a class="member ${base ? 'base' : ''}" href="${wordLink(m.w)}" ${i === currentWi ? 'aria-current="true"' : ''}><span class="w">${esc(m.w)}</span><span class="m" lang="fa" dir="rtl">${esc(m.fa)}</span></a></li>`; }).join('')}
    </ul></div>`).join('')}</section>`;
}

function wordExamplePattern(word) {
  // Match compound terms such as "en-route" in either hyphenated or spaced text.
  return String(word).split('-').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[-\\s]+');
}
function wordOccursInExample(word, example) {
  if (!word || !example) return false;
  const escaped = wordExamplePattern(word);
  try { return new RegExp(`(^|[^A-Za-z])${escaped}(?=$|[^A-Za-z])`, 'i').test(example); }
  catch { return false; }
}
function exampleForWord(wi) {
  const w = D.words[wi], f = famById.get(w.f);
  // Even an attached example must show the entry itself (not merely a related form).
  // Family-level examples are eligible only when the exact headword also appears.
  if (w.ex && wordOccursInExample(w.w, w.ex)) return { en: w.ex, fa: w.exFa || '', status: w.example_status || '' };
  if (f?.ex && wordOccursInExample(w.w, f.ex)) return { en: f.ex, fa: f.exFa || '', status: 'family-example-exact' };
  return null;
}
function exampleCard(wi) {
  const w = D.words[wi], example = exampleForWord(wi);
  if (!example) return '';
  const escaped = wordExamplePattern(w.w);
  const re = new RegExp(`(^|[^A-Za-z])(${escaped})(?=$|[^A-Za-z])`, 'i');
  const hl = esc(example.en).replace(re, '$1<mark>$2</mark>');
  const note = example.status === 'generated-draft'
    ? `<p class="src">${bi('Template example · draft, please review', 'مثال الگویی · پیش‌نویس، نیازمند بازبینی')}</p>` : '';
  return `<section class="card enter"><h2>${bi('Word-specific example', 'مثال اختصاصی واژه')}</h2>
    <p class="example" lang="en" dir="ltr">${hl}</p>${example.fa ? `<p class="example-fa" lang="fa" dir="rtl">${esc(example.fa)}</p>` : ''}${note}</section>`;
}

function wordView(res) {
  const idx = res.idx;
  let sel = 0;
  const sw = idx.length > 1 ? `<div class="switch" role="tablist" aria-label="Families containing this word">${idx.map((i, n) => `<button class="chip ${n === sel ? 'on' : ''}" data-sel="${n}" role="tab">in family: ${esc(famById.get(D.words[i].f).base)}</button>`).join('')}</div>` : '';
  const notice = noticeHtml(res);
  const paint = (n, target) => {
    const wi = idx[n];
    target.innerHTML = (idx.length > 1 ? `<div class="notice"><span>🔀</span><div><b>${esc(D.words[wi].w)}</b> belongs to ${idx.length} families — pick one above.</div></div>` : '') +
      (famById.get(D.words[wi].f).solo ? entryCard(wi) + soloCard(wi) + exampleCard(wi) : entryCard(wi) + rootCard(wi) + buildCard(wi) + familyCard(D.words[wi].f, wi) + exampleCard(wi));
    bindEntry(target);
  };
  return { sw, notice, paint };
}

function noticeHtml(res) {
  if (res.kind === 'inflected') return `<div class="notice"><span>↳</span><div><b>${esc(res.q)}</b> is an inflected form (${esc(res.via.label)}) of <b>${esc(D.words[res.idx[0]].w)}</b>.<span class="fa" lang="fa" dir="rtl">«${esc(res.q)}» ${esc(res.via.fa)} واژهٔ «${esc(D.words[res.idx[0]].w)}» است.</span></div></div>`;
  if (res.kind === 'guess') {
    const g = res.guess, st = D.words[res.idx[0]];
    const bits = [g.pre && `${g.pre.v} (${aff(g.pre.gi).en})`, g.suf && `${g.suf.v} (${aff(g.suf.gi).en})`].filter(Boolean).join(' + ');
    const fa = [g.pre && aff(g.pre.gi).fa, g.suf && aff(g.suf.gi).fa].filter(Boolean).join(' ، ');
    return `<div class="notice warn"><span>⚠️</span><div><b>“${esc(res.q)}” isn’t in the database yet.</b> From its shape it looks built from <b>${esc(st.w)}</b> + ${esc(bits)}. This is an estimate — showing the related word below.<span class="fa" lang="fa" dir="rtl">این واژه هنوز در پایگاه داده نیست؛ حدس ما بر پایهٔ ساختارش: «${esc(st.w)}» + ${esc(fa)}</span></div></div>`;
  }
  return '';
}

function viewWord(raw) {
  const res = lookup(raw);
  main.innerHTML = searchBox(raw) + '<div id="result"></div>';
  bindSearch();
  const out = $('#result');
  if (res.kind === 'persian') {
    out.innerHTML = `<div class="label">Persian search · ${res.results.length} match${res.results.length > 1 ? 'es' : ''} <span class="fa" lang="fa">نتایج جستجوی فارسی</span></div>` +
      res.results.map(i => { const w = D.words[i]; return `<a class="result-row" href="${wordLink(w.w)}"><span class="w">${esc(w.w)} <small style="color:var(--muted);font:600 .7rem var(--sans);text-transform:uppercase">${esc(posLabel(w.pos))}</small></span><span class="m" lang="fa" dir="rtl">${esc(w.fa)}</span></a>`; }).join('');
    return;
  }
  if (res.kind === 'none') {
    out.innerHTML = `<section class="card empty enter"><h2>No match for “${esc(res.q)}”</h2>
      <p>This dictionary has ${D.words.length.toLocaleString()} words so far.<br><span class="fa" lang="fa">این واژه هنوز در پایگاه داده نیست.</span></p>
      ${res.similar.length ? `<p>Did you mean:</p><div class="chips" style="justify-content:center">${res.similar.map(s => `<a class="chip" href="${wordLink(s)}">${esc(s)}</a>`).join('')}</div>` : ''}</section>`;
    return;
  }
  if (res.kind === 'empty') return;
  pushRecent(res.idx.length ? D.words[res.idx[0]].w.toLowerCase() : res.q);
  const v = wordView(res);
  out.innerHTML = v.notice + v.sw + '<div id="resbody"></div>';
  const body = $('#resbody');
  const paintInto = n => v.paint(n, body);
  paintInto(0);
  out.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', () => {
    out.querySelectorAll('[data-sel]').forEach(x => x.classList.toggle('on', x === b));
    paintInto(+b.dataset.sel);
  }));
}

function viewFamilies(level) {
  const list = D.families.filter(f => !f.solo && (!level || f.cefr === level));
  main.innerHTML = `<h1 class="page-title">Word families <span class="fa" lang="fa" style="font-size:1.1rem;color:var(--muted)">خانوادهٔ واژه‌ها</span></h1>
    <p class="sub">Words that grow from one root. Tap a family to explore it.</p>
    <div class="chips"><a class="chip on" href="#/families">Families</a><a class="chip" href="#/singles">Standalone entries</a></div>
    <div class="chips"><a class="chip ${!level ? 'on' : ''}" href="#/families">All levels</a>${LEVELS.filter(l => D.families.some(f => f.cefr === l)).map(l => `<a class="chip ${level === l ? 'on' : ''}" href="#/families/${l}">${l}</a>`).join('')}</div>
    <div class="grid">${list.map(f => `<a class="fcard enter" href="#/f/${f.id}"><div class="top2"><span class="b">${esc(f.base)}</span><span class="lv">${esc(f.cefr || '')}${f.review_status === 'reviewed' ? ' · reviewed' : f.review_status === 'source-curated' ? ' · source-curated' : ' · draft'}</span></div><span class="fa" lang="fa" dir="rtl">${esc(f.fa)}</span><span class="n">${f.words.length} words · ${esc(f.topic || '')}</span></a>`).join('')}</div>`;
}

function viewFamily(id) {
  const f = famById.get(+id);
  if (!f) return viewFamilies();
  if (f.solo) return viewWord(f.base);
  const bi = f.words.find(i => D.words[i].w.toLowerCase() === f.base.toLowerCase());
  const first = bi ?? f.words[0];
  main.innerHTML = `<a class="back" href="#/families">← All families</a>
    <section class="card entry enter"><div class="row"><h1 class="word">${esc(f.base)}</h1></div>
      <div class="tags">${f.cefr ? `<span class="tag cefr">${esc(f.cefr)}</span>` : ''}${reviewBadge(f)}${f.topic ? `<span class="tag">${esc(f.topic)}</span>` : ''}</div>
      <p class="meaning" lang="fa" dir="rtl"><small>Persian meaning · معنی فارسی</small>${esc(f.fa)}</p></section>
    <section class="card enter"><h2>Origin <span class="fa" lang="fa">ریشه‌شناسی</span></h2><div class="etym">${esc(f.root)}</div>${f.pattern ? `<div class="kv" style="margin-top:8px"><span>Pattern: <b>${esc(f.pattern)}</b></span></div>` : ''}</section>
    ${treeCard(f)}${exampleCard(first)}`;
}

function viewAffixes() {
  const draw = (term = '', type = '') => {
    const t = term.toLowerCase();
    const list = D.affixes.map((a, gi) => ({ ...a, gi })).filter(a => (!type || a.type === type) && (!t || (a.key + a.en + a.ex + a.fa).toLowerCase().includes(t)));
    $('#alist').innerHTML = list.map(a => `<div class="acard enter"><div><span class="a">${esc(a.key)}</span><span class="t">${esc(a.type)}</span></div>
      <div class="e">${esc(a.en)}</div><div class="f" lang="fa" dir="rtl">${esc(a.fa)}</div>
      <div class="ex">${(a.ex || '').split(/,\s*/).filter(Boolean).map(e => { const k = e.replace(/\s*\(.*\)/, '').toLowerCase(); return `<a href="${wordLink(k)}">${esc(e)}</a>`; }).join('')}</div>${affCount(a.gi) ? `<a class="more" href="#/affix/${a.gi}">See ${affCount(a.gi)} words →</a>` : ''}</div>`).join('') || '<p class="sub">No affix found.</p>';
  };
  let type = '';
  main.innerHTML = `<h1 class="page-title">Prefixes &amp; suffixes <span class="fa" lang="fa" style="font-size:1.1rem;color:var(--muted)">پیشوند و پسوند</span></h1>
    <p class="sub">The building blocks that change a word’s meaning or grammar.</p>
    <input class="filter" id="afilter" type="search" placeholder="Filter: un-, ness, “not”…" aria-label="Filter affixes">
    <div class="chips" id="atype"><button class="chip on" data-t="">All</button><button class="chip" data-t="Prefix">Prefixes</button><button class="chip" data-t="Suffix">Suffixes</button></div>
    <div class="grid" id="alist"></div>`;
  draw();
  $('#afilter').addEventListener('input', e => draw(e.target.value, type));
  $('#atype').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; type = b.dataset.t; $('#atype').querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b)); draw($('#afilter').value, type); });
}

/* ---------- search box behaviour ---------- */
function suggestions(q) {
  q = q.trim();
  if (!q) return [];
  if (isPersian(q)) return searchPersian(q).slice(0, 7);
  const l = q.toLowerCase();
  const starts = [], inc = [];
  D.words.forEach((w, i) => { const k = w.w.toLowerCase(); if (k.startsWith(l)) starts.push(i); else if (k.includes(l)) inc.push(i); });
  const seen = new Set();
  return [...starts, ...inc].filter(i => { const k = D.words[i].w.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 7);
}

function bindSearch() {
  const form = $('#sform'), input = $('#q'), box = $('#sugg'), field = $('#field');
  let items = [], active = -1;
  const close = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const go = v => { close(); input.blur(); location.hash = `#/w/${encodeURIComponent(v.trim())}`; };
  const render = () => {
    items = suggestions(input.value);
    field.classList.toggle('has', !!input.value);
    if (!items.length) return close();
    const l = input.value.trim().toLowerCase();
    box.innerHTML = items.map((i, n) => { const w = D.words[i]; const k = w.w;
      const nm = !isPersian(l) && k.toLowerCase().startsWith(l) ? `<mark>${esc(k.slice(0, l.length))}</mark>${esc(k.slice(l.length))}` : esc(k);
      return `<li role="option" id="o${n}" data-w="${esc(k)}"><span class="w">${nm}</span><span class="p">${esc(posLabel(w.pos))}</span><span class="m" lang="fa" dir="rtl">${esc(w.fa.split(/[؛\/]/)[0])}</span></li>`; }).join('');
    box.hidden = false; input.setAttribute('aria-expanded', 'true'); active = -1;
  };
  input.addEventListener('input', render);
  input.addEventListener('focus', () => { if (input.value) render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (box.hidden) return; e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      [...box.children].forEach((li, n) => li.setAttribute('aria-selected', n === active));
      input.setAttribute('aria-activedescendant', 'o' + active);
    } else if (e.key === 'Escape') close();
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); go(box.children[active].dataset.w); }
  });
  box.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); go(li.dataset.w); } });
  box.addEventListener('touchstart', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); go(li.dataset.w); } }, { passive: false });
  input.addEventListener('blur', () => setTimeout(close, 120));
  form.addEventListener('submit', e => { e.preventDefault(); if (input.value.trim()) go(input.value); });
  $('.clear', form).addEventListener('click', () => { input.value = ''; field.classList.remove('has'); close(); input.focus(); });
}


/* ---------- v2: saved words, practice, word of the day, affix explorer, tree ---------- */
const favs = () => store.get('rishe.favs', []);
const isFav = w => favs().includes(String(w).toLowerCase());
function toggleFav(w) {
  w = w.toLowerCase(); const f = favs(), i = f.indexOf(w);
  if (i >= 0) { f.splice(i, 1); toast('Removed from Saved'); } else { f.unshift(w); toast('Saved'); }
  store.set('rishe.favs', f); return i < 0;
}
async function shareWord(w) {
  const wi = wordMap.get(w.toLowerCase())?.[0]; const fa = wi != null ? D.words[wi].fa : '';
  const data = { title: `${w} – Rishe`, text: `${w} — ${fa}`, url: location.href.split('#')[0] + wordLink(w) };
  try { if (navigator.share) return await navigator.share(data); await navigator.clipboard.writeText(`${data.text}\n${data.url}`); toast('Copied to clipboard'); } catch {}
}
function bindEntry(root) {
  root.querySelector('[data-say]')?.addEventListener('click', e => speak(e.currentTarget.dataset.say));
  root.querySelector('[data-fav]')?.addEventListener('click', e => e.currentTarget.setAttribute('aria-pressed', toggleFav(e.currentTarget.dataset.fav)));
  root.querySelector('[data-share]')?.addEventListener('click', e => shareWord(e.currentTarget.dataset.share));
  root.querySelector('[data-add-collection]')?.addEventListener('click', e => toggleCollectionChooser(e.currentTarget, e.currentTarget.dataset.addCollection));
}

const affIdx = [];
function affCount(gi) {
  if (!affIdx.length) { D.affixes.forEach(() => affIdx.push([])); D.words.forEach((w, i) => { [w.pre, w.suf].forEach(a => { if (a && !affIdx[a[0]].includes(i)) affIdx[a[0]].push(i); }); }); }
  return affIdx[gi].length;
}
function viewAffix(gi) {
  const a = D.affixes[gi]; if (!a) return viewAffixes();
  affCount(gi);
  main.innerHTML = `<a class="back" href="#/affixes">← All affixes</a>
    <section class="card entry enter"><div class="row"><h1 class="word">${esc(a.key)}</h1></div>
      <div class="tags"><span class="tag">${esc(a.type)}</span>${a.prod ? `<span class="tag cefr">${esc(a.prod)}</span>` : ''}</div>
      <p class="meaning" lang="fa" dir="rtl"><small>${esc(a.en)}</small>${esc(a.fa)}</p></section>
    ${a.note ? `<div class="notice"><span>💡</span><div>${esc(a.note)}</div></div>` : ''}
    <div class="label">${affIdx[gi].length} words in the dictionary <span class="fa" lang="fa">واژه‌ها</span></div>
    ${affIdx[gi].map(i => rowHtml(i)).join('')}`;
}
const rowHtml = i => { const w = D.words[i]; return `<a class="result-row" href="${wordLink(w.w)}"><span class="w">${esc(w.w)} <small style="color:var(--muted);font:600 .7rem var(--sans);text-transform:uppercase">${esc(posLabel(w.pos))}</small></span><span class="m" lang="fa" dir="rtl">${esc(w.fa)}</span></a>`; };

function treeCard(f) {
  const groups = {};
  f.words.forEach(i => { const p = posParts(D.words[i].pos)[0] || 'other'; (groups[p] ||= []).push(i); });
  const keys = [...POS_ORDER.filter(k => groups[k]), ...Object.keys(groups).filter(k => !POS_ORDER.includes(k))];
  return `<section class="card tree enter"><h2>Family tree · ${f.words.length} words <span class="fa" lang="fa">درخت خانواده</span></h2>
    <div class="tr-root"><b>${esc(f.base)}</b><span lang="fa" dir="rtl">${esc(f.fa)}</span><small>${esc(f.root)}</small></div>
    <div class="tr-branches">${keys.map(k => `<div class="tr-branch"><div class="tr-label">${esc(POS[k]?.[0] || k)}<span class="fa" lang="fa">${esc(POS[k]?.[1] || '')}</span></div><div class="tr-leaves">
      ${groups[k].map(i => { const m = D.words[i]; return `<a class="leaf" href="${wordLink(m.w)}"><b>${esc(m.w)}</b><span lang="fa" dir="rtl">${esc(m.fa)}</span></a>`; }).join('')}</div></div>`).join('')}</div></section>`;
}

function wotdHtml() {
  const d = new Date(), seed = d.getFullYear() * 400 + d.getMonth() * 32 + d.getDate();
  const i = Math.imul(seed, 2654435761) >>> 0, w = D.words[i % D.words.length], f = famById.get(w.f);
  return `<a class="wotd enter" href="${wordLink(w.w)}"><div><div class="k">Word of the day · واژهٔ امروز</div><div class="w">${esc(w.w)}</div><div class="r">${f.solo ? esc(f.topic || 'single word') : 'root: ' + esc(f.base)}</div></div><div class="m" lang="fa" dir="rtl">${esc(w.fa.split('؛')[0])}</div></a>`;
}

function viewSaved() {
  const list = favs().filter(w => wordMap.has(w));
  main.innerHTML = `<h1 class="page-title">Saved words <span class="fa" lang="fa" style="font-size:1.1rem;color:var(--muted)">واژه‌های ذخیره‌شده</span></h1>` +
    (list.length ? `<p class="sub">${list.length} word${list.length > 1 ? 's' : ''} · stored on this device.</p>
      <div class="btnrow"><a class="btn" href="#/practice/cards/saved">Flashcards</a><a class="btn alt" href="#/practice/quiz/saved">Quiz</a></div>
      ${list.map(w => `<div class="rowflex">${rowHtml(wordMap.get(w)[0])}<button class="rm" data-rm="${esc(w)}" aria-label="Remove ${esc(w)}">×</button></div>`).join('')}`
    : `<section class="card empty enter"><h2>Nothing saved yet</h2><p>Open any word and tap the bookmark to keep it here for practice.</p><p class="fa" lang="fa">روی نشان‌گذار هر واژه بزنید تا اینجا ذخیره شود.</p><div class="btnrow"><a class="btn" href="#/">Search a word</a></div></section>`);
  main.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { toggleFav(b.dataset.rm); viewSaved(); }));
}

/* ----- practice ----- */
const boxes = () => store.get('rishe.box', {});
function grade(w, ok) { const b = boxes(), k = w.toLowerCase(); b[k] = { b: ok ? Math.min((b[k]?.b || 1) + 1, 5) : 1, t: Date.now() }; store.set('rishe.box', b); const wi = wordMap.get(k)?.[0]; if (learningStore && wi != null) learningStore.recordLegacyPractice(wordIdFor(D.words[wi]), ok); }
function pool(src) {
  let idx = src === 'saved' ? favs().flatMap(w => (wordMap.get(w) || []).slice(0, 1)) : D.words.map((_, i) => i).filter(i => src === 'all' || D.words[i].cefr === src);
  const seen = new Set(); return idx.filter(i => { const k = D.words[i].w.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
function pick(idx, n) { const b = boxes(); return idx.map(i => ({ i, r: Math.random() + (b[D.words[i].w.toLowerCase()]?.b || 1) * .6 })).sort((a, c) => a.r - c.r).slice(0, n).map(x => x.i); }
const srcName = s => s === 'saved' ? 'Saved words' : s === 'all' ? 'All words' : 'Level ' + s;

function viewPractice(mode, src) {
  if (mode === 'cards') return viewCards(src || 'all');
  if (mode === 'quiz') return viewQuiz(src || 'all');
  const b = boxes(), learned = Object.values(b).filter(x => x.b >= 4).length, seenN = Object.keys(b).length;
  const sel = store.get('rishe.src', 'all');
  const opts = [['all', 'All'], ...LEVELS.filter(l => D.words.some(w => w.cefr === l)).map(l => [l, l]), ['saved', `Saved (${favs().length})`]];
  main.innerHTML = `<h1 class="page-title">Practice <span class="fa" lang="fa" style="font-size:1.1rem;color:var(--muted)">تمرین</span></h1>
    <p class="sub">Short 10-word rounds. Words you miss come back more often.</p>
    <div class="stat"><span><b>${seenN}</b>practised</span><span><b>${learned}</b>well known</span></div>
    <div class="label">Words from</div><div class="chips" id="srcs">${opts.map(([v, l]) => `<button class="chip ${v === sel ? 'on' : ''}" data-s="${v}">${l}</button>`).join('')}</div>
    <div class="modes"><a class="mode" id="m-cards" href="#/practice/cards/${sel}"><b>Flashcards</b><span>Flip and self-check</span><span class="fa" lang="fa">فلش‌کارت</span></a>
      <a class="mode" id="m-quiz" href="#/practice/quiz/${sel}"><b>Quiz</b><span>Multiple choice</span><span class="fa" lang="fa">آزمون</span></a></div>`;
  $('#srcs').addEventListener('click', e => { const c = e.target.closest('[data-s]'); if (!c) return; store.set('rishe.src', c.dataset.s);
    $('#srcs').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c)); $('#m-cards').href = `#/practice/cards/${c.dataset.s}`; $('#m-quiz').href = `#/practice/quiz/${c.dataset.s}`; });
}

function practiceEmpty(src) {
  main.innerHTML = `<a class="back" href="#/practice">← Practice</a><section class="card empty enter"><h2>No words to practise</h2><p>${src === 'saved' ? 'Save some words first with the bookmark button.' : 'Nothing in this selection.'}</p><div class="btnrow"><a class="btn" href="#/">Search words</a></div></section>`;
}
function summary(title, got, total, missed, src, mode) {
  if (learningStore && total > 0) learningStore.recordSessionCompleted({ mode: `legacy-${mode}`, reviewCards: total, successfulReviews: got, failedReviews: total - got });
  main.innerHTML = `<a class="back" href="#/practice">← Practice</a><section class="card empty enter"><h2>${esc(title)}</h2><div class="score">${got}/${total}</div>
    <p>${got === total ? 'Perfect round!' : 'Missed words will show up more often.'}</p>
    ${missed.length ? `<div class="chips" style="justify-content:center">${missed.map(w => `<a class="chip" href="${wordLink(w)}">${esc(w)}</a>`).join('')}</div>` : ''}
    <div class="btnrow"><button class="btn" id="again">Another round</button><a class="btn alt" href="#/practice">Done</a></div></section>`;
  $('#again').addEventListener('click', () => (mode === 'cards' ? viewCards(src) : viewQuiz(src)));
}

function viewCards(src) {
  const deck = pick(pool(src), 10); if (!deck.length) return practiceEmpty(src);
  let n = 0, got = 0; const missed = [];
  const draw = (flipped = false) => {
    if (n >= deck.length) return summary('Flashcards done', got, deck.length, missed, src, 'cards');
    const w = D.words[deck[n]], f = famById.get(w.f), ex = w.ex || f.ex;
    main.innerHTML = `<a class="back" href="#/practice">← ${esc(srcName(src))}</a>
      <div class="stat"><span>Card ${n + 1} of ${deck.length}</span></div><div class="progress"><i style="width:${n / deck.length * 100}%"></i></div>
      <div class="flash">${flipped ? `<div class="face back" id="face"><div class="word fa-big" lang="fa" dir="rtl">${esc(w.fa)}</div><div class="small">${esc(w.w)} · ${esc(posLabel(w.pos))}</div><div class="small">root: <b>${esc(f.base)}</b></div>${ex ? `<div class="small" style="font-style:italic;max-width:34ch">${esc(ex)}</div>` : ''}</div>`
        : `<div class="face front" id="face"><div class="w">${esc(w.w)}</div><span class="tag" style="background:var(--teal-soft);border-color:var(--line);color:var(--teal-d)">${esc(posLabel(w.pos))}</span><button class="iconbtn" id="spk" aria-label="Pronounce">🔊</button><div class="hint">Tap to reveal the meaning</div></div>`}</div>
      ${flipped ? `<div class="btnrow"><button class="btn no" id="no">Still learning</button><button class="btn ok" id="ok">Got it</button></div>` : `<div class="btnrow"><button class="btn alt" id="show">Show answer</button></div>`}`;
    if (!flipped) { $('#face').addEventListener('click', e => { if (e.target.closest('#spk')) return; draw(true); }); $('#show').addEventListener('click', () => draw(true)); $('#spk').addEventListener('click', e => { e.stopPropagation(); speak(w.w); }); }
    else { $('#ok').addEventListener('click', () => { grade(w.w, true); got++; n++; draw(); }); $('#no').addEventListener('click', () => { grade(w.w, false); missed.push(w.w); n++; draw(); }); }
  };
  draw();
}

function viewQuiz(src) {
  const all = pool('all'), deck = pick(pool(src), 10); if (!deck.length) return practiceEmpty(src);
  if (all.length < 4) return practiceEmpty(src);
  let n = 0, got = 0; const missed = [];
  const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
  const draw = () => {
    if (n >= deck.length) return summary('Quiz complete', got, deck.length, missed, src, 'quiz');
    const w = D.words[deck[n]], toFa = n % 2 === 0, p0 = posParts(w.pos)[0];
    const label = i => toFa ? D.words[i].fa.split('؛')[0] : D.words[i].w;
    const used = new Set([label(deck[n])]);
    const cands = shuffle(all.filter(i => i !== deck[n] && D.words[i].fa !== w.fa)).sort((a, b) => (posParts(D.words[b].pos)[0] === p0) - (posParts(D.words[a].pos)[0] === p0) || 0);
    const distract = []; for (const i of cands) { const l = label(i); if (!used.has(l)) { used.add(l); distract.push(i); } if (distract.length === 3) break; }
    const options = shuffle([deck[n], ...distract]);
    main.innerHTML = `<a class="back" href="#/practice">← ${esc(srcName(src))}</a><div class="stat"><span>Question ${n + 1} of ${deck.length}</span><span>Score ${got}</span></div><div class="progress"><i style="width:${n / deck.length * 100}%"></i></div>
      <div class="label" style="justify-content:center">${toFa ? 'What does it mean in Persian?' : 'Which English word is this?'}</div>
      <div class="q ${toFa ? '' : 'fa'}" ${toFa ? '' : 'lang="fa" dir="rtl"'}>${esc(toFa ? w.w : w.fa.split('؛')[0])}</div>
      <div class="opts">${options.map(i => `<button class="opt ${toFa ? 'fa' : ''}" data-i="${i}" ${toFa ? 'lang="fa" dir="rtl"' : ''}>${esc(label(i))}</button>`).join('')}</div><div id="next"></div>`;
    main.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
      const ok = +b.dataset.i === deck[n];
      main.querySelectorAll('.opt').forEach(x => { x.disabled = true; if (+x.dataset.i === deck[n]) x.classList.add('right'); });
      if (!ok) b.classList.add('wrong');
      grade(w.w, ok); if (ok) got++; else missed.push(w.w);
      $('#next').innerHTML = `<div class="notice ${ok ? '' : 'warn'}"><span>${ok ? '✓' : '✗'}</span><div><b>${esc(w.w)}</b> = <span lang="fa" dir="rtl">${esc(w.fa)}</span></div></div><div class="btnrow"><button class="btn" id="nx">${n + 1 >= deck.length ? 'See score' : 'Next'}</button></div>`;
      $('#nx').addEventListener('click', () => { n++; draw(); }); $('#nx').focus();
    }));
  };
  draw();
}

/* ---------- theme ---------- */
const THEMES = ['auto', 'light', 'dark'];
function applyTheme(t) {
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  const b = $('#theme'); b.innerHTML = { auto: '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4a8 8 0 010 16z" fill="currentColor"/></svg>', light: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.500 1.500M17.500 17.500L19 19M5 19l1.500-1.500M17.500 6.500L19 5"/></svg>', dark: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M20 14.500A8 8 0 019.500 4 8 8 0 1020 14.500z"/></svg>' }[t]; b.title = 'Theme: ' + t;
}
applyTheme(store.get('rishe.theme', 'auto'));
$('#theme').addEventListener('click', () => { const t = THEMES[(THEMES.indexOf(store.get('rishe.theme', 'auto')) + 1) % 3]; store.set('rishe.theme', t); applyTheme(t); toast('Theme: ' + t); });


/* ---------- single words (no word family) ---------- */
function soloCard(wi) {
  const w = D.words[wi], f = famById.get(w.f);
  const related = (f.words || []).filter(i => i !== wi && D.words[i]).slice(0, 30);
  return `<section class="card enter"><h2>${bi('Standalone entry and related forms', 'مدخل مستقل و صورت‌های مرتبط')}</h2>
    <p class="sub" style="margin:0">${bi(related.length ? `“${w.w}” is stored as a standalone entry with generated or linked forms below.` : `“${w.w}” currently has no related forms in the database.`, related.length ? `«${w.w}» به‌عنوان مدخل مستقل ثبت شده و صورت‌های تولیدشده یا مرتبط در زیر آمده‌اند.` : `در حال حاضر صورت مرتبطی برای «${w.w}» در پایگاه واژگان ثبت نشده است.`)}${f.topic ? ` ${bi(`Topic: ${f.topic}`, `موضوع: ${f.topic}`)}` : ''}</p>
    ${related.length ? `<ul class="members">${related.map(i => { const m = D.words[i]; return `<li><a class="member" href="${wordLink(m.w)}"><span class="w">${esc(m.w)}</span><span class="m" lang="fa" dir="rtl">${esc(m.fa)}</span></a></li>`; }).join('')}</ul>` : ''}</section>`;
}
function viewSingles(level) {
  const list = D.families.filter(f => f.solo && (!level || f.cefr === level)).sort((a, b) => a.base.localeCompare(b.base));
  main.innerHTML = `<h1 class="page-title">Standalone vocabulary <span class="fa" lang="fa" style="font-size:1.1rem;color:var(--muted)">واژه‌ها و اصطلاحات مستقل</span></h1>
    <p class="sub">Words and established multiword terms without family members. ${list.length} shown.</p>
    <div class="chips"><a class="chip" href="#/families">Families</a><a class="chip on" href="#/singles">Single words</a></div>
    <div class="chips"><a class="chip ${!level ? 'on' : ''}" href="#/singles">All levels</a>${LEVELS.filter(l => D.families.some(f => f.solo && f.cefr === l)).map(l => `<a class="chip ${level === l ? 'on' : ''}" href="#/singles/${l}">${l}</a>`).join('')}</div>
    <input class="filter" id="sfilter" type="search" placeholder="Filter vocabulary…" aria-label="Filter standalone vocabulary">
    <div id="slist"></div>`;
  const draw = t => { const q = t.toLowerCase().trim(); const rows = list.filter(f => !q || f.base.toLowerCase().includes(q) || f.fa.includes(q)).slice(0, 300);
    $('#slist').innerHTML = rows.map(f => rowHtml(f.words[0])).join('') || '<p class="sub">No match.</p>'; };
  draw(''); $('#sfilter').addEventListener('input', e => draw(e.target.value));
}
/* ---------- project information + financial support ---------- */
function configuredSupportUrl() {
  const raw = window.RISHE_CONFIG?.SUPPORT_URL || SUPPORT_URL_FALLBACK;
  try {
    const parsed = new URL(raw, location.href);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.href;
  } catch {}
  return SUPPORT_URL_FALLBACK;
}

function viewSupport() {
  const url = configuredSupportUrl();
  main.innerHTML = `
    <a class="back" href="#/">${bi('← Back to search', '← بازگشت به جست‌وجو')}</a>
    <section class="card support-card enter">
      <p class="eyebrow">RISHE · VERSION ${APP_VERSION}</p>
      <h1 class="page-title">${bi('Support Rishe Development', 'حمایت از توسعهٔ ریشه')}</h1>
      <p>${bi('Rishe is an English–Persian vocabulary tool that helps learners understand words, roots, and word families.', 'ریشه ابزاری انگلیسی‌ـ‌فارسی برای یادگیری واژگان، ریشه‌ها و خانواده‌های واژگانی است.')}</p>
      <p>${bi('If Rishe has been useful to you, you can make an optional contribution to help expand vocabulary coverage, improve educational content, and develop new features.', 'اگر ریشه برایتان مفید بوده است، می‌توانید داوطلبانه از توسعهٔ پوشش واژگان، بهبود محتوای آموزشی و ساخت قابلیت‌های جدید حمایت مالی کنید.')}</p>
      <p>${bi('Support is entirely voluntary. It does not unlock features, change dictionary access, or affect your saved words.', 'حمایت کاملاً اختیاری است؛ هیچ قابلیتی را فعال یا قفل نمی‌کند و دسترسی به واژه‌نامه یا واژگان ذخیره‌شده را تغییر نمی‌دهد.')}</p>
      <div class="btnrow"><a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${bi('Open CoffeeBede', 'باز کردن کافه‌بده')}</a><a class="btn alt" href="#/">${bi('Return to Rishe', 'بازگشت به ریشه')}</a></div>
      <p class="sub support-note">${bi('Contributions are processed on CoffeeBede, not inside Rishe. Rishe does not collect or verify donations.', 'پرداخت‌ها در کافه‌بده انجام می‌شوند، نه داخل ریشه. ریشه پرداختی دریافت یا تأیید نمی‌کند.')}</p>
    </section>`;
}

function viewAbout() {
  const families = D.families.filter(f => !f.solo).length;
  const standalone = D.families.filter(f => f.solo).length;
  const unique = new Set(D.words.map(w => String(w.w || '').trim().toLocaleLowerCase())).size;
  const drafts = D.words.filter(w => w.review_status === 'draft' || famById.get(w.f)?.draft).length;
  const reviewed = D.words.filter(w => w.review_status === 'reviewed').length;
  const sourceCurated = D.words.filter(w => w.review_status === 'source-curated').length;
  const generatedForms = D.words.filter(w => w.form_type).length;
  const singleTokenCount = D.families.filter(f => f.solo && !/\s/.test(String(f.base || '').trim())).length;
  const multiwordCount = standalone - singleTokenCount;
  main.innerHTML = `
    <a class="back" href="#/">${bi('← Back to search', '← بازگشت به جست‌وجو')}</a>
    <section class="card enter">
      <p class="eyebrow">RISHE · VERSION ${APP_VERSION}</p>
      <h1 class="page-title">${bi('About Rishe', 'دربارهٔ ریشه')}</h1>
      <p>${bi('Rishe is an English–Persian vocabulary tool that connects related forms and highlights prefixes, suffixes, and word-building patterns.', 'ریشه ابزار واژگان انگلیسی‌ـ‌فارسی است که شکل‌های مرتبط را به هم پیوند می‌دهد و پیشوندها، پسوندها و الگوهای واژه‌سازی را نشان می‌دهد.')}</p>
      <h2>${bi('Learn through relationships', 'یادگیری از راه ارتباط واژه‌ها')}</h2>
      <p>${bi('A word family groups words with a defensible shared base, such as a verb, noun, adjective, and useful derivatives. Similar spelling alone does not prove a shared root.', 'خانوادهٔ واژگانی، واژه‌هایی را با پایهٔ مشترک و قابل دفاع—مانند فعل، اسم، صفت و مشتق‌های کاربردی—گروه‌بندی می‌کند. شباهت نوشتاری به‌تنهایی ریشهٔ مشترک را ثابت نمی‌کند.')}</p>
      <h2>${bi('Use it offline', 'استفاده به‌صورت آفلاین')}</h2>
      <p>${bi('After the app shell and dictionary load, Rishe can work offline through its Service Worker. Install it from a supported browser for app-like access. New releases update cached files when the app is opened online.', 'پس از بارگیری پوستهٔ برنامه و واژه‌نامه، ریشه با کمک Service Worker می‌تواند آفلاین کار کند. برای تجربه‌ای شبیه اپلیکیشن، آن را از مرورگر پشتیبانی‌شده نصب کنید. نسخه‌های جدید هنگام بازشدن برنامه در حالت آنلاین، فایل‌های کش‌شده را به‌روزرسانی می‌کنند.')}</p>
      <h2>${bi('Database snapshot', 'نمای کلی پایگاه واژگان')}</h2>
      <div class="stat-grid">
        <div class="stat-card"><b>${families.toLocaleString()}</b>${bi('Word-family records', 'رکورد خانواده‌های واژگانی')}</div>
        <div class="stat-card"><b>${standalone.toLocaleString()}</b>${bi('Standalone entries', 'مدخل‌های مستقل')}</div>
        <div class="stat-card"><b>${singleTokenCount.toLocaleString()}</b>${bi('Single-token entries', 'مدخل‌های تک‌واژه‌ای')}</div>
        <div class="stat-card"><b>${multiwordCount.toLocaleString()}</b>${bi('Multiword terms', 'اصطلاح‌های چندواژه‌ای')}</div>
        <div class="stat-card"><b>${unique.toLocaleString()}</b>${bi('Unique word forms', 'صورت‌های واژگانی یکتا')}</div>
        <div class="stat-card"><b>${generatedForms.toLocaleString()}</b>${bi('Generated inflections · draft', 'صورت‌های صرفی تولیدشده · پیش‌نویس')}</div>
        <div class="stat-card"><b>${drafts.toLocaleString()}</b>${bi('Draft word records', 'رکوردهای پیش‌نویس')}</div>
        <div class="stat-card"><b>${sourceCurated.toLocaleString()}</b>${bi('Source-curated, not independently verified', 'برگرفته از منبع؛ بدون بازبینی مستقل')}</div>
        <div class="stat-card"><b>${reviewed.toLocaleString()}</b>${bi('Explicitly reviewed records', 'رکوردهای صریحاً بازبینی‌شده')}</div>
      </div>
      <p class="sub">${bi('Generated inflections and template examples are drafts and need editorial review. Structural validation does not establish translation, etymology, or CEFR accuracy.', 'صورت‌های صرفی و مثال‌های الگویی تولیدشده، پیش‌نویس‌اند و به بازبینی محتوایی نیاز دارند. اعتبارسنجی ساختاری، درستی ترجمه، ریشه‌شناسی یا سطح CEFR را اثبات نمی‌کند.')}</p>
      <div class="btnrow"><a class="btn" href="#/support">${bi('Support development', 'حمایت از توسعه')}</a><a class="btn alt" href="#/">${bi('Search vocabulary', 'جست‌وجوی واژگان')}</a></div>
    </section>`;
}

/* ---------- Rishe 1.6: daily learning, spaced repetition, collections, progress ---------- */
function learningPlan(at = Date.now()) {
  return RisheLearning.calculatePlan(D.words, learningStore, w => famById.get(w.f)?.base || '', at);
}
function learningStats(at = Date.now()) {
  return RisheLearning.statistics(D.words, learningStore, w => famById.get(w.f)?.base || '', at);
}
function storageNotice() {
  const message = [learningStore?.warning, importRecoveryNotice].filter(Boolean).join(' ');
  return message ? `<div class="notice warn" role="status"><span aria-hidden="true">!</span><div><b>${bi('Storage notice', 'هشدار ذخیره‌سازی')}</b><p>${esc(message)}</p><p class="fa" lang="fa" dir="rtl">ذخیره‌سازی محلی با مشکل روبه‌رو شده است. برای جلوگیری از ازدست‌رفتن پیشرفت، از داده‌های یادگیری خروجی بگیرید و پیش از پاک‌کردن داده‌های مرورگر، پیام انگلیسی بالا را بررسی کنید.</p></div></div>` : '';
}
function stateLabel(state) {
  return ({ new: 'New', learning: 'Learning', review: 'Established review', relearning: 'Relearning' })[state] || 'Learning';
}
function stateLabelFa(state) {
  return ({ new: 'جدید', learning: 'در حال یادگیری', review: 'مرور تثبیت‌شده', relearning: 'یادگیری دوباره' })[state] || 'در حال یادگیری';
}
function reminderAvailability() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext;
}
async function toggleDailyReminder() {
  const current = reminderSettings();
  if (current.enabled) {
    saveReminderSettings({ enabled: false });
    toast('Daily reminder disabled · یادآور روزانه خاموش شد');
    viewLearnHome();
    return;
  }
  if (!reminderAvailability()) {
    toast('Notifications require a supported browser on HTTPS or localhost · اعلان‌ها به مرورگر پشتیبانی‌شده و HTTPS یا localhost نیاز دارند');
    return;
  }
  try {
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') {
      toast('Notification permission was not granted · اجازهٔ اعلان داده نشد');
      return;
    }
    saveReminderSettings({ enabled: true });
    toast('Daily reminder enabled · یادآور روزانه فعال شد');
    viewLearnHome();
  } catch {
    toast('Could not enable notifications · فعال‌سازی اعلان‌ها ناموفق بود');
  }
}
async function checkDailyReminder() {
  const settings = reminderSettings();
  if (!settings.enabled || !reminderAvailability() || Notification.permission !== 'granted') return;
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = currentLocalDay();
  // If the browser throttles a background tab or the app opens after the target time,
  // send the reminder at the next check rather than silently missing the whole day.
  if (time < settings.time || settings.lastSentDay === today) return;
  const plan = learningPlan(now.getTime());
  if (!plan.dueCount && !plan.newGoalPlanned) {
    saveReminderSettings({ lastSentDay: today });
    return;
  }
  const body = `${plan.dueCount} reviews due · ${plan.newGoalPlanned} new words ready.\n${plan.dueCount} مرور آماده · ${plan.newGoalPlanned} واژهٔ جدید آمادهٔ یادگیری`;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Rishe · Daily learning / ریشه · یادگیری روزانه', {
      body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'rishe-daily-reminder',
      renotify: false, data: { url: `${registration.scope}#/learn` }
    });
    saveReminderSettings({ lastSentDay: today });
  } catch (error) {
    // Avoid repeated failures every 30 seconds; the next local day can retry.
    saveReminderSettings({ lastSentDay: today });
    console.warn('Rishe daily reminder could not be shown:', error);
  }
}
let reminderTimer = null;
function startReminderChecks() {
  if (reminderTimer) clearInterval(reminderTimer);
  checkDailyReminder();
  reminderTimer = setInterval(checkDailyReminder, 30_000);
}
function viewLearnHome() {
  const plan = learningPlan(), stats = learningStats(), state = learningStore.state;
  const goal = state.settings.dailyGoal || 10;
  const progress = Math.min(100, Math.round(plan.newIntroducedToday / goal * 100));
  const duePhraseEn = plan.dueCount ? `${plan.dueCount} review${plan.dueCount === 1 ? '' : 's'} waiting` : 'No reviews due';
  const duePhraseFa = plan.dueCount ? `${plan.dueCount} مرور در انتظار` : 'مروری سررسید نشده است';
  const reminder = reminderSettings();
  const reminderNote = typeof Notification !== 'undefined' && Notification.permission === 'denied'
    ? bi('Notifications are blocked by browser settings. Allow them for this site in your browser settings, then reload Rishe.', 'اعلان‌ها در تنظیمات مرورگر مسدود شده‌اند. در تنظیمات مرورگر، اجازهٔ اعلان این سایت را فعال کنید و سپس ریشه را دوباره بارگیری کنید.')
    : !reminderAvailability()
      ? bi('This browser or connection does not support web notifications. Use HTTPS or localhost.', 'این مرورگر یا اتصال از اعلان وب پشتیبانی نمی‌کند. از HTTPS یا localhost استفاده کنید.')
      : bi('The reminder is checked while Rishe is open. Without a push server, notifications cannot be guaranteed after the app/browser is closed.', 'یادآور زمانی بررسی می‌شود که ریشه باز باشد. بدون سرور Push، نمایش اعلان پس از بسته‌شدن برنامه یا مرورگر تضمین‌شدنی نیست.');
  main.innerHTML = `<section class="learn-hero">
      <p class="eyebrow">Rishe Learning · ریشه</p><h1 class="page-title">${bi('Your daily plan', 'برنامهٔ یادگیری امروز')}</h1>
      <p class="sub">${bi('Review first. Add new words at a manageable pace. Your progress stays on this device.', 'ابتدا مرور کنید و سپس با سرعتی قابل‌مدیریت واژهٔ جدید بیاموزید. پیشرفت شما روی همین دستگاه می‌ماند.')}</p>
      <div class="stat-grid learning-kpis">
        <div class="stat-card"><b>${plan.dueCount.toLocaleString()}</b>${bi('Reviews due now', 'مرورهای سررسیدشده')}</div>
        <div class="stat-card"><b>${plan.newGoalPlanned.toLocaleString()}</b>${bi('New words available today', 'واژه‌های جدید قابل‌یادگیری امروز')}</div>
        <div class="stat-card"><b>${plan.newIntroducedToday.toLocaleString()} / ${goal.toLocaleString()}</b>${bi('New words introduced today', 'واژه‌های جدید معرفی‌شده امروز')}</div>
      </div>
      <div class="goal-progress" role="progressbar" aria-label="Daily new-word goal · هدف روزانهٔ واژهٔ جدید" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="${Math.min(goal, plan.newIntroducedToday)}"><div><span>${bi('Daily new-word goal', 'هدف روزانهٔ واژهٔ جدید')}</span><b>${progress}%</b></div><div class="progress"><i style="width:${progress}%"></i></div></div>
      ${plan.deferralReason ? `<p class="sub">${bi(plan.deferralReason, plan.deferralReason.includes('heavy') ? 'به‌دلیل تعداد زیاد مرورها، مرورها امروز در اولویت هستند.' : 'تا زمان رسیدگی به مرورهای در انتظار، هدف واژه‌های جدید کاهش یافته است.')}</p>` : ''}
      ${storageNotice()}
      <div class="learning-actions">
        <a class="mode" href="#/study/review"><b>${bi('Review due words', 'مرور واژه‌های سررسیدشده')}</b><span>${bi(duePhraseEn, duePhraseFa)}</span></a>
        <a class="mode" href="#/study/new"><b>${bi('Learn new words', 'یادگیری واژه‌های جدید')}</b><span>${bi(`${plan.newGoalPlanned} planned · up to your daily target`, `${plan.newGoalPlanned} واژه برنامه‌ریزی‌شده · متناسب با هدف روزانه`)}</span></a>
        <a class="mode" href="#/study/mixed"><b>${bi('Mixed session', 'جلسهٔ ترکیبی')}</b><span>${bi('Due reviews first, then new words', 'ابتدا مرورهای سررسیدشده، سپس واژه‌های جدید')}</span></a>
      </div>
    </section>
    <section class="card"><div class="section-heading"><h2>${bi('Learning at a glance', 'نمای کلی یادگیری')}</h2><a href="#/progress">${bi('Full progress →', 'گزارش کامل پیشرفت ←')}</a></div>
      <div class="stat-grid"><div class="stat-card"><b>${stats.introduced.toLocaleString()}</b>${bi('Introduced words', 'واژه‌های معرفی‌شده')}</div><div class="stat-card"><b>${stats.established.toLocaleString()}</b>${bi('Established', 'تثبیت‌شده')}</div><div class="stat-card"><b>${stats.learning.toLocaleString()}</b>${bi('Learning', 'در حال یادگیری')}</div><div class="stat-card"><b>${stats.relearning.toLocaleString()}</b>${bi('Relearning', 'یادگیری دوباره')}</div></div>
      <p class="sub">${bi('An introduced word is not necessarily mastered. “Established” means its current scheduler state is spaced review.', 'معرفی‌شدن یک واژه به‌معنای تسلط بر آن نیست. «تثبیت‌شده» یعنی وضعیت فعلی آن در زمان‌بند، مرور فاصله‌دار است.')}</p>
    </section>
    <section class="card"><div class="section-heading"><h2>${bi('Personal collections', 'مجموعه‌های شخصی')}</h2><a href="#/collections">${bi('Manage collections →', 'مدیریت مجموعه‌ها ←')}</a></div>
      ${state.collections.length ? `<div class="collection-shortcuts">${state.collections.slice(0, 4).map(c => `<a class="collection-shortcut" href="#/collection/${encodeURIComponent(c.id)}"><b>${esc(c.name)}</b><span>${bi(`${c.wordIds.length} word${c.wordIds.length === 1 ? '' : 's'}`, `${c.wordIds.length} واژه`)}</span></a>`).join('')}</div>` : `<p class="sub">${bi('Group words for aviation, exams, work, or any topic you are studying.', 'واژه‌ها را برای هوانوردی، آزمون‌ها، کار یا هر موضوع دیگری دسته‌بندی کنید.')}</p>`}
      <div class="btnrow"><a class="btn alt" href="#/collections">${bi('Open collections', 'بازکردن مجموعه‌ها')}</a><a class="btn alt" href="#/saved">${bi('Saved words', 'واژه‌های ذخیره‌شده')}</a></div>
    </section>
    <section class="card"><h2>${bi('Daily target', 'هدف روزانه')}</h2><p class="sub">${bi('Choose a realistic number of new words. Reviews are counted separately.', 'تعداد واقع‌بینانه‌ای از واژه‌های جدید انتخاب کنید. مرورها جداگانه محاسبه می‌شوند.')}</p>
      <form id="goal-form" class="goal-form"><label for="daily-goal">${bi('New words per day', 'تعداد واژهٔ جدید در روز')}</label><select id="daily-goal" name="dailyGoal">${[5, 10, 15, 20].map(n => `<option value="${n}" ${goal === n ? 'selected' : ''}>${n} words · ${n} واژه</option>`).join('')}<option value="custom" ${![5, 10, 15, 20].includes(goal) ? 'selected' : ''}>Custom (${goal}) · دلخواه</option></select><input id="custom-goal" aria-label="Custom daily new-word target · هدف دلخواه روزانه" type="number" min="1" max="100" value="${goal}"/><button class="btn" type="submit">${bi('Save target', 'ذخیرهٔ هدف')}</button></form>
    </section>
    <section class="card reminder-card"><h2>${bi('Daily reminder', 'یادآور روزانه')}</h2><p class="sub">${reminderNote}</p><div class="reminder-controls"><label for="reminder-time">${bi('Reminder time', 'ساعت یادآور')}</label><input id="reminder-time" type="time" value="${esc(reminder.time)}" aria-label="Reminder time · ساعت یادآور"/><button class="btn ${reminder.enabled ? 'alt' : ''}" id="reminder-toggle" type="button">${bi(reminder.enabled ? 'Disable reminder' : 'Enable reminder', reminder.enabled ? 'خاموش‌کردن یادآور' : 'فعال‌کردن یادآور')}</button><span class="reminder-status">${bi(reminder.enabled ? 'Enabled' : 'Disabled', reminder.enabled ? 'فعال' : 'خاموش')}</span></div></section>
    <section class="card"><h2>${bi('Local backup', 'پشتیبان‌گیری محلی')}</h2><p class="sub">${bi('Export includes learning records, review history, collections, saved words, and settings. It does not include the public dictionary or cloud sync.', 'خروجی شامل رکوردهای یادگیری، تاریخچهٔ مرور، مجموعه‌ها، واژه‌های ذخیره‌شده و تنظیمات است. واژه‌نامهٔ عمومی یا همگام‌سازی ابری را شامل نمی‌شود.')}</p>
      <div class="btnrow"><button class="btn" id="export-learning" type="button">${bi('Export my data', 'خروجی‌گرفتن از داده‌ها')}</button><label class="btn alt file-btn" for="import-learning-file">${bi('Import data', 'واردکردن داده')}</label><input id="import-learning-file" class="visually-hidden" type="file" accept="application/json,.json"/><select id="import-mode" aria-label="Import behavior · روش واردکردن"><option value="merge">Merge data · ادغام داده‌ها</option><option value="replace">Replace learning data · جایگزینی داده‌های یادگیری</option></select></div>
      <p class="sub">${bi('Keep an exported file somewhere safe if you reinstall the app or change devices.', 'اگر برنامه را دوباره نصب می‌کنید یا دستگاهتان را عوض می‌کنید، فایل خروجی را در محل امنی نگه دارید.')}</p>
    </section>`;
  $('#goal-form').addEventListener('submit', e => {
    e.preventDefault(); const sel = $('#daily-goal').value; const raw = sel === 'custom' ? $('#custom-goal').value : sel;
    const n = Number(raw); if (!Number.isFinite(n) || n < 1 || n > 100) { toast('Choose between 1 and 100 new words · عددی بین ۱ تا ۱۰۰ انتخاب کنید'); return; }
    learningStore.setDailyGoal(n); toast('Daily target saved · هدف روزانه ذخیره شد'); viewLearnHome();
  });
  $('#daily-goal').addEventListener('change', () => { if ($('#daily-goal').value !== 'custom') $('#custom-goal').value = $('#daily-goal').value; });
  $('#export-learning').addEventListener('click', exportLearningData);
  $('#import-learning-file').addEventListener('change', importLearningData);
  $('#reminder-toggle').addEventListener('click', toggleDailyReminder);
  $('#reminder-time').addEventListener('change', e => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value)) return;
    saveReminderSettings({ time: e.target.value });
    toast('Reminder time saved · زمان یادآور ذخیره شد');
  });
}

function exportLearningData() {
  try {
    const payload = learningStore.exportData({
      savedWords: favs(),
      theme: store.get('rishe.theme', 'auto'),
      practiceSource: store.get('rishe.src', 'all'),
      legacyBoxes: boxes(),
      notifications: reminderSettings()
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `rishe-learning-${RisheLearning.localDay()}.json`; document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast('Learning data exported');
  } catch (error) { toast(`Could not export data: ${error.message}`); }
}
async function importLearningData(event) {
  const input = event.currentTarget, file = input.files?.[0]; if (!file) return;
  let storage = null, snapshot = null, transactionStarted = false;
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error('The import file is larger than 10 MB.');
    const payload = JSON.parse(await file.text());
    if (!payload || payload.app !== 'Rishe' || Number(payload.exportSchemaVersion) !== 1 || !payload.learning) throw new Error('This file is not a supported Rishe learning export.');
    const mode = $('#import-mode').value;
    const verb = mode === 'replace' ? 'replace current learning records and collections' : 'merge with the current learning records and collections';
    if (!confirm(`Import this file and ${verb}? Make a backup first if the current data matters.`)) { input.value = ''; return; }
    if (!learningStore.writable) throw new Error('Import requires writable browser storage. Resolve the storage warning and export any in-memory changes before importing.');
    storage = window.localStorage;
    snapshot = Object.fromEntries(IMPORT_SNAPSHOT_KEYS.map(key => [key, storage.getItem(key)]));
    // A small transaction marker lets the next load restore all touched keys if the page
    // closes during a multi-key import. Existing data is preserved until commit completes.
    storage.setItem(IMPORT_TRANSACTION_KEY, JSON.stringify({ schemaVersion: 1, keys: snapshot }));
    transactionStarted = true;

    const result = learningStore.importData(payload, mode, new Set(allWordIds));
    if (!result.saved) throw new Error('Learning records could not be written to browser storage.');

    if (Array.isArray(payload.savedWords)) {
      const imported = payload.savedWords.map(x => String(x).toLowerCase()).filter(x => wordMap.has(x));
      const saved = mode === 'replace' ? [...new Set(imported)] : [...new Set([...favs(), ...imported])];
      storage.setItem('rishe.favs', JSON.stringify(saved));
    }
    if (payload.legacyBoxes && typeof payload.legacyBoxes === 'object' && !Array.isArray(payload.legacyBoxes)) {
      const currentBoxes = mode === 'replace' ? {} : boxes();
      for (const [k, v] of Object.entries(payload.legacyBoxes)) if (wordMap.has(k.toLowerCase()) && v && typeof v === 'object') {
        const key = k.toLowerCase(), importedBox = { b: Math.min(5, Math.max(1, Number(v.b) || 1)), t: Number(v.t) || 0 };
        if (mode === 'replace' || !currentBoxes[key]) currentBoxes[key] = importedBox;
      }
      storage.setItem('rishe.box', JSON.stringify(currentBoxes));
    }
    if (['auto', 'light', 'dark'].includes(payload.theme) && (mode === 'replace' || !store.get('rishe.theme', null))) {
      storage.setItem('rishe.theme', JSON.stringify(payload.theme));
    }
    if (['all', 'saved', ...LEVELS].includes(payload.practiceSource) && mode === 'replace') {
      storage.setItem('rishe.src', JSON.stringify(payload.practiceSource));
    }
    if (payload.notifications && typeof payload.notifications === 'object') {
      const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(payload.notifications.time || '')) ? payload.notifications.time : '19:00';
      const canNotify = typeof Notification !== 'undefined' && Notification.permission === 'granted';
      storage.setItem(REMINDER_KEY, JSON.stringify({ enabled: canNotify && payload.notifications.enabled === true, time, lastSentDay: '' }));
    }
    storage.removeItem(IMPORT_TRANSACTION_KEY);
    transactionStarted = false;
    if (['auto', 'light', 'dark'].includes(payload.theme) && (mode === 'replace' || !snapshot['rishe.theme'])) applyTheme(payload.theme);
    toast(result.saved ? `Import complete · ${result.records} records${result.warnings.length ? ` · ${result.warnings.join('; ')}` : ''}` : 'Imported in memory only; check the storage warning');
    input.value = ''; viewLearnHome();
  } catch (error) {
    if (transactionStarted && storage && snapshot) {
      try {
        for (const key of IMPORT_SNAPSHOT_KEYS) {
          const value = snapshot[key];
          if (value == null) storage.removeItem(key); else storage.setItem(key, value);
        }
        storage.removeItem(IMPORT_TRANSACTION_KEY);
        learningStore = RisheLearning.createStore(storage);
        applyTheme(store.get('rishe.theme', 'auto'));
      } catch (rollbackError) {
        importRecoveryNotice = `Import failed (${error.message}); automatic rollback also reported a problem (${rollbackError.message}). Do not clear local storage; reload once to retry recovery.`;
      }
    }
    toast(`Import failed: ${error.message}`); input.value = ''; viewLearnHome();
  }
}

function viewProgress() {
  const s = learningStats(), state = learningStore.state;
  const maxBar = Math.max(1, ...s.activity.map(d => d.newWords + d.reviews));
  const chart = s.activity.map(d => {
    const date = new Date(`${d.day}T12:00:00`);
    const labelEn = date.toLocaleDateString('en', { weekday: 'short' });
    const labelFa = date.toLocaleDateString('fa-IR', { day: 'numeric', month: 'numeric' });
    const total = d.newWords + d.reviews;
    const overall = total ? Math.max(3, Math.round(total / maxBar * 100)) : 0;
    const reviewsHeight = total ? Math.round(d.reviews / total * 100) : 0;
    const newHeight = total ? Math.round(d.newWords / total * 100) : 0;
    return `<div class="chart-column" title="${esc(`${d.day}: ${d.newWords} new, ${d.reviews} reviews`)}"><div class="chart-value">${total || ''}</div><div class="chart-plot"><div class="chart-stack" style="height:${overall}%"><i class="chart-reviews" style="height:${reviewsHeight}%"></i><i class="chart-new" style="height:${newHeight}%"></i></div></div><span class="chart-label">${esc(labelEn)}</span><span class="fa chart-label-fa" lang="fa" dir="rtl">${esc(labelFa)}</span></div>`;
  }).join('');
  const activityHtml = s.activity.map(d => {
    const date = new Date(`${d.day}T12:00:00`);
    const label = date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
    const total = d.newWords + d.reviews;
    const width = Math.max(0, Math.round(total / maxBar * 100));
    return `<div class="activity-row"><div class="activity-day"><b>${esc(label)}</b><span>${bi(`${d.newWords} new · ${d.reviews} reviews`, `${d.newWords} جدید · ${d.reviews} مرور`)}</span></div><div class="activity-track" role="img" aria-label="${esc(label)}: ${total} completed learning actions"><i style="width:${width}%"></i></div></div>`;
  }).join('');
  main.innerHTML = `<a class="back" href="#/learn">${bi('← Daily plan', '← برنامهٔ روزانه')}</a><h1 class="page-title">${bi('Learning progress', 'پیشرفت یادگیری')}</h1><p class="sub">${bi('Every metric comes from locally stored study and review events.', 'تمام آمار از رویدادهای مطالعه و مرور ذخیره‌شده روی دستگاه محاسبه می‌شود.')}</p>${storageNotice()}
    <section class="card"><h2>${bi('Vocabulary status', 'وضعیت واژگان')}</h2><div class="stat-grid">
      <div class="stat-card"><b>${s.introduced.toLocaleString()}</b>${bi('Introduced words', 'واژه‌های معرفی‌شده')}</div><div class="stat-card"><b>${s.reviewsCompleted.toLocaleString()}</b>${bi('Recall checks recorded', 'دفعات ثبت‌شدهٔ بازیابی')}</div><div class="stat-card"><b>${s.reviewsDue.toLocaleString()}</b>${bi('Reviews due now', 'مرورهای سررسیدشده')}</div><div class="stat-card"><b>${s.reviewSessionsCompleted.toLocaleString()}</b>${bi('Completed review sessions', 'جلسه‌های مرور تکمیل‌شده')}</div>
      <div class="stat-card"><b>${s.learning.toLocaleString()}</b>${bi('Learning', 'در حال یادگیری')}</div><div class="stat-card"><b>${s.established.toLocaleString()}</b>${bi('Established review', 'مرور تثبیت‌شده')}</div><div class="stat-card"><b>${s.relearning.toLocaleString()}</b>${bi('Relearning', 'یادگیری دوباره')}</div><div class="stat-card"><b>${s.newToday.toLocaleString()}</b>${bi('New words introduced today', 'واژه‌های جدید معرفی‌شده امروز')}</div></div>
      <p class="sub">${bi('Introduction is not mastery. “Established” means the scheduler currently assigns a word to spaced review.', 'معرفی‌شدن به‌معنای تسلط نیست. «تثبیت‌شده» یعنی زمان‌بند فعلاً واژه را در وضعیت مرور فاصله‌دار قرار داده است.')}</p>
    </section>
    <section class="card"><h2>${bi('Recall accuracy · last 7 days', 'دقت بازیابی · ۷ روز گذشته')}</h2><div class="score">${s.successRate7d == null ? '—' : `${s.successRate7d}%`}</div><p class="sub" style="text-align:center">${bi(`${s.reviews7d} scheduled reviews recorded in the last 7 × 24 hours. Again is unsuccessful; Hard, Good, and Easy count as successful.`, `${s.reviews7d} مرور زمان‌بندی‌شده در ۷×۲۴ ساعت گذشته ثبت شده است. Again ناموفق و Hard، Good و Easy موفق محسوب می‌شوند.`)}</p></section>
    <section class="card"><h2>${bi('Daily activity chart · last 7 days', 'نمودار فعالیت روزانه · ۷ روز گذشته')}</h2><div class="chart-legend"><span><i class="legend-new"></i>${bi('New words', 'واژه‌های جدید')}</span><span><i class="legend-reviews"></i>${bi('Reviews', 'مرورها')}</span></div><div class="learning-chart" role="img" aria-label="Daily learning activity over the last seven local calendar days · فعالیت یادگیری در هفت روز تقویمی اخیر">${chart}</div><p class="chart-axis-note">${bi('Bar height = total recorded actions. Teal = new words; amber = reviews.', 'ارتفاع ستون = مجموع فعالیت‌های ثبت‌شده. فیروزه‌ای = واژهٔ جدید؛ کهربایی = مرور.')}</p></section>
    <section class="card"><h2>${bi('Recent activity · local calendar days', 'فعالیت اخیر · روزهای تقویمی محلی')}</h2>${s.activity.every(d => d.newWords === 0 && d.reviews === 0) ? `<p class="sub">${bi('No recorded study activity in the last seven calendar days. Start with a short session today.', 'در هفت روز تقویمی گذشته فعالیتی ثبت نشده است. امروز با یک جلسهٔ کوتاه شروع کنید.')}</p>` : `<div class="activity-list">${activityHtml}</div>`}</section>
    <section class="card"><h2>${bi('Collections', 'مجموعه‌ها')}</h2><p>${bi(`${state.collections.length} personal collections · ${state.collections.reduce((n, c) => n + c.wordIds.length, 0)} word memberships.`, `${state.collections.length} مجموعهٔ شخصی · ${state.collections.reduce((n, c) => n + c.wordIds.length, 0)} عضویت واژگانی.`)}</p><div class="btnrow"><a class="btn alt" href="#/collections">${bi('Manage collections', 'مدیریت مجموعه‌ها')}</a><a class="btn" href="#/study/mixed">${bi('Study now', 'مطالعهٔ اکنون')}</a></div></section>`;
}

function viewCollections() {
  const collections = learningStore.state.collections;
  main.innerHTML = `<a class="back" href="#/learn">${bi('← Daily plan', '← برنامهٔ روزانه')}</a><h1 class="page-title">${bi('Personal collections', 'مجموعه‌های شخصی')}</h1><p class="sub">${bi('Build lists for aviation, exams, difficult words, work, or any topic. Collections reference dictionary words and do not duplicate definitions.', 'برای هوانوردی، آزمون‌ها، واژه‌های دشوار، کار یا هر موضوعی فهرست بسازید. مجموعه‌ها به مدخل‌های واژه‌نامه ارجاع می‌دهند و تعریف واژه‌ها را کپی نمی‌کنند.')}</p>${storageNotice()}
    <form id="create-collection" class="card collection-create"><h2>${bi('New collection', 'مجموعهٔ جدید')}</h2><label for="collection-name">${bi('Name', 'نام')}</label><input id="collection-name" name="name" maxlength="80" required placeholder="e.g. Aviation English · انگلیسی هوانوردی"/><label for="collection-description">${bi('Description', 'توضیحات')} <span class="sub">${bi('(optional)', '(اختیاری)')}</span></label><textarea id="collection-description" maxlength="300" rows="2" placeholder="What are you studying? · چه چیزی مطالعه می‌کنید؟"></textarea><button class="btn" type="submit">${bi('Create collection', 'ساخت مجموعه')}</button></form>
    ${collections.length ? `<div class="collection-list">${collections.map(c => {
      const resolved = c.wordIds.filter(id => wordIndexById.has(id)).length;
      return `<section class="card collection-card"><div class="section-heading"><div><h2>${esc(c.name)}</h2><p>${esc(c.description || 'Personal word list · فهرست شخصی واژگان')}</p><span class="collection-meta">${bi(`${resolved} word${resolved === 1 ? '' : 's'}`, `${resolved} واژه`)}${resolved !== c.wordIds.length ? ` · ${bi(`${c.wordIds.length - resolved} unavailable reference(s)`, `${c.wordIds.length - resolved} ارجاع در دسترس نیست`)}` : ''}</span></div><a class="btn alt" href="#/collection/${encodeURIComponent(c.id)}">${bi('Open', 'بازکردن')}</a></div>
        <details class="collection-edit"><summary>${bi('Rename or edit details', 'تغییر نام یا ویرایش جزئیات')}</summary><form data-edit-collection="${esc(c.id)}"><label>${bi('Collection name', 'نام مجموعه')}<input name="name" maxlength="80" required value="${esc(c.name)}"/></label><label>${bi('Description', 'توضیحات')}<textarea name="description" rows="2" maxlength="300">${esc(c.description)}</textarea></label><button class="btn alt" type="submit">${bi('Save details', 'ذخیرهٔ جزئیات')}</button></form></details>
        <div class="btnrow"><a class="btn" href="#/study/collection/${encodeURIComponent(c.id)}">${bi('Practice collection', 'تمرین مجموعه')}</a><a class="btn alt" href="#/study/collection-review/${encodeURIComponent(c.id)}">${bi('Scheduled reviews', 'مرورهای زمان‌بندی‌شده')}</a><button class="btn no" type="button" data-delete-collection="${esc(c.id)}">${bi('Delete', 'حذف')}</button></div></section>`;
    }).join('')}</div>` : `<section class="card empty"><h2>${bi('No collections yet', 'هنوز مجموعه‌ای ندارید')}</h2><p>${bi('Create a collection, then add words from its page or from a word detail screen.', 'یک مجموعه بسازید و سپس از صفحهٔ مجموعه یا جزئیات هر واژه، واژه‌ها را به آن اضافه کنید.')}</p></section>`}`;
  $('#create-collection').addEventListener('submit', e => {
    e.preventDefault(); const name = $('#collection-name').value, description = $('#collection-description').value;
    try { const id = learningStore.createCollection(name, description); toast('Collection created · مجموعه ساخته شد'); location.hash = `#/collection/${encodeURIComponent(id)}`; }
    catch (error) { toast(`${error.message} · ایجاد مجموعه ناموفق بود`); }
  });
  main.querySelectorAll('[data-edit-collection]').forEach(form => form.addEventListener('submit', e => {
    e.preventDefault(); const fd = new FormData(form);
    try { learningStore.updateCollection(form.dataset.editCollection, { name: fd.get('name'), description: fd.get('description') }); toast('Collection updated · مجموعه به‌روزرسانی شد'); viewCollections(); }
    catch (error) { toast(`${error.message} · ذخیره ناموفق بود`); }
  }));
  main.querySelectorAll('[data-delete-collection]').forEach(button => button.addEventListener('click', () => {
    const c = learningStore.state.collections.find(x => x.id === button.dataset.deleteCollection);
    if (!c || !confirm(`Delete “${c.name}”? This removes only the collection; learning history and dictionary entries remain.\nمجموعهٔ «${c?.name || ''}» حذف شود؟ فقط خود مجموعه حذف می‌شود و سابقهٔ یادگیری و مدخل‌های واژه‌نامه باقی می‌مانند.`)) return;
    learningStore.deleteCollection(c.id); toast('Collection deleted · مجموعه حذف شد'); viewCollections();
  }));
}

function viewCollection(collectionId) {
  const c = learningStore.state.collections.find(x => x.id === String(collectionId));
  if (!c) { main.innerHTML = `<a class="back" href="#/collections">${bi('← Collections', '← مجموعه‌ها')}</a><section class="card empty"><h2>${bi('Collection not found', 'مجموعه پیدا نشد')}</h2><p>${bi('It may have been deleted or imported from a different dictionary.', 'ممکن است مجموعه حذف شده یا از واژه‌نامهٔ دیگری وارد شده باشد.')}</p></section>`; return; }
  const items = c.wordIds.map(id => ({ id, word: wordFromId(id) })).filter(x => x.word);
  const stale = c.wordIds.length - items.length;
  main.innerHTML = `<a class="back" href="#/collections">${bi('← All collections', '← همهٔ مجموعه‌ها')}</a><h1 class="page-title">${esc(c.name)}</h1><p class="sub">${esc(c.description || 'Personal word list · فهرست شخصی واژگان')} · ${bi(`${items.length} available words`, `${items.length} واژهٔ در دسترس`)}</p>${storageNotice()}
    <div class="btnrow"><a class="btn" href="#/study/collection/${encodeURIComponent(c.id)}">${bi('Practice collection', 'تمرین مجموعه')}</a><a class="btn alt" href="#/study/collection-review/${encodeURIComponent(c.id)}">${bi('Review due words in collection', 'مرور واژه‌های سررسیدشدهٔ مجموعه')}</a></div>
    ${stale ? `<div class="notice warn"><span>!</span><div>${bi(`${stale} word reference(s) are not present in this dictionary and will be skipped. They were not deleted from your stored collection.`, `${stale} ارجاع واژگانی در این واژه‌نامه وجود ندارد و رد می‌شود؛ از مجموعهٔ ذخیره‌شده حذف نشده است.`)}</div></div>` : ''}
    <section class="card"><h2>${bi('Add words', 'افزودن واژه‌ها')}</h2><label for="collection-word-search">${bi('Search dictionary', 'جست‌وجو در واژه‌نامه')}</label><input id="collection-word-search" class="filter" type="search" autocomplete="off" placeholder="Type an English word or Persian meaning · واژهٔ انگلیسی یا معنی فارسی را وارد کنید"/><div id="collection-word-results" class="collection-search-results"><p class="sub">${bi('Search and select a dictionary result to add it.', 'جست‌وجو کنید و یکی از نتایج واژه‌نامه را برای افزودن انتخاب کنید.')}</p></div></section>
    <div class="label">${bi('Words in this collection', 'واژه‌های این مجموعه')}</div>${items.length ? items.map(({id, word}) => `<div class="rowflex">${rowHtml(wordIndexById.get(id))}<button class="rm" type="button" data-remove-collection-word="${esc(id)}" aria-label="Remove ${esc(word.w)} from ${esc(c.name)} · حذف ${esc(word.w)} از ${esc(c.name)}">×</button></div>`).join('') : `<section class="card empty"><h2>${bi('This collection is empty', 'این مجموعه خالی است')}</h2><p>${bi('Use the dictionary search above or add a word from its detail screen.', 'از جست‌وجوی واژه‌نامه در بالا استفاده کنید یا از صفحهٔ جزئیات یک واژه آن را اضافه کنید.')}</p></section>`}`;
  const query = $('#collection-word-search'), results = $('#collection-word-results');
  query.addEventListener('input', () => {
    const q = query.value.trim().toLowerCase();
    if (q.length < 2) { results.innerHTML = `<p class="sub">${bi('Type at least two characters.', 'حداقل دو نویسه وارد کنید.')}</p>`; return; }
    const found = [];
    for (const i of D.words.keys()) {
      const w = D.words[i], id = wordIdFor(w);
      if ((w.w.toLowerCase().includes(q) || normalizeFa(w.fa || '').toLowerCase().includes(normalizeFa(q).toLowerCase())) && !c.wordIds.includes(id)) {
        found.push({ i, id }); if (found.length >= 8) break;
      }
    }
    results.innerHTML = found.length ? found.map(({i,id}) => `<button type="button" class="collection-result" data-add-collection-word="${esc(id)}"><b>${esc(D.words[i].w)}</b><span lang="fa" dir="rtl">${esc(D.words[i].fa)}</span></button>`).join('') : `<p class="sub">${bi('No available matches.', 'نتیجهٔ در دسترسی پیدا نشد.')}</p>`;
    results.querySelectorAll('[data-add-collection-word]').forEach(button => button.addEventListener('click', () => {
      try { const result = learningStore.addToCollection(c.id, button.dataset.addCollectionWord); toast(result.added ? 'Word added · واژه اضافه شد' : 'Already in collection · این واژه از قبل در مجموعه است'); viewCollection(c.id); }
      catch (error) { toast(`${error.message} · افزودن واژه ناموفق بود`); }
    }));
  });
  main.querySelectorAll('[data-remove-collection-word]').forEach(button => button.addEventListener('click', () => {
    try { learningStore.removeFromCollection(c.id, button.dataset.removeCollectionWord); toast('Word removed · واژه حذف شد'); viewCollection(c.id); }
    catch (error) { toast(`${error.message} · حذف واژه ناموفق بود`); }
  }));
}

function toggleCollectionChooser(button, id) {
  document.querySelectorAll('.collection-chooser').forEach(x => x.remove());
  const card = button.closest('.entry');
  if (!card) return;
  const chooser = document.createElement('div'); chooser.className = 'collection-chooser';
  const collections = learningStore.state.collections;
  chooser.innerHTML = collections.length ? `<label for="collection-choice">${bi('Add to collection', 'افزودن به مجموعه')}</label><select id="collection-choice">${collections.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><button type="button" class="btn" id="confirm-collection-add">${bi('Add word', 'افزودن واژه')}</button><a href="#/collections">${bi('Manage collections', 'مدیریت مجموعه‌ها')}</a>` : `<p>${bi('No collections yet.', 'هنوز مجموعه‌ای ندارید.')}</p><a class="btn" href="#/collections">${bi('Create a collection', 'ساخت مجموعه')}</a>`;
  card.append(chooser);
  $('#confirm-collection-add', chooser)?.addEventListener('click', () => {
    try { const result = learningStore.addToCollection($('#collection-choice', chooser).value, id); toast(result.added ? 'Word added to collection · واژه به مجموعه اضافه شد' : 'Word is already in that collection · این واژه از قبل در مجموعه است'); chooser.remove(); }
    catch (error) { toast(`${error.message} · عملیات ناموفق بود`); }
  });
}

function studySummary(mode, stats, total) {
  if (!stats.didWork && !stats.collectionCards) {
    main.innerHTML = `<a class="back" href="#/learn">${bi('← Daily plan', '← برنامهٔ روزانه')}</a><section class="card empty enter"><h2>${bi('Session finished', 'جلسه پایان یافت')}</h2><p>${bi('No cards were completed, so no progress was added. Skipped cards remain available for later.', 'هیچ کارتی تکمیل نشد، بنابراین پیشرفتی ثبت نشد. کارت‌های ردشده بعداً در دسترس خواهند بود.')}</p><div class="btnrow"><a class="btn" href="#/learn">${bi('Back to today’s plan', 'بازگشت به برنامهٔ امروز')}</a></div></section>`;
    return;
  }
  learningStore.recordSessionCompleted({ mode, reviewCards: stats.reviewsCompleted, successfulReviews: stats.successes, failedReviews: stats.failures, newWords: stats.newIntroduced, collectionCards: stats.collectionCards });
  main.innerHTML = `<a class="back" href="#/learn">${bi('← Daily plan', '← برنامهٔ روزانه')}</a><section class="card empty enter"><p class="eyebrow">${bi('Session complete', 'جلسه تکمیل شد')}</p><h1 class="page-title">${bi('Good work', 'آفرین')}</h1><p class="sub">${learningStore.warning ? bi('Activity is available in this session, but storage reported a problem. Export your data before closing this page.', 'فعالیت این جلسه موجود است، اما ذخیره‌سازی با مشکل روبه‌رو شده. پیش از بستن صفحه از داده‌ها خروجی بگیرید.') : bi('Completed activity was saved on this device.', 'فعالیت تکمیل‌شده روی این دستگاه ذخیره شد.')}</p>${storageNotice()}
    <div class="stat-grid"><div class="stat-card"><b>${stats.reviewsCompleted}</b>${bi('Scheduled reviews completed', 'مرورهای زمان‌بندی‌شدهٔ تکمیل‌شده')}</div><div class="stat-card"><b>${stats.successes}</b>${bi('Successful recalls', 'بازیابی‌های موفق')}</div><div class="stat-card"><b>${stats.failures}</b>${bi('Again ratings', 'ارزیابی‌های Again')}</div><div class="stat-card"><b>${stats.newIntroduced}</b>${bi('New words introduced', 'واژه‌های جدید معرفی‌شده')}</div>${mode === 'collection' ? `<div class="stat-card"><b>${stats.collectionCards}</b>${bi('Collection cards practised', 'کارت‌های تمرین‌شدهٔ مجموعه')}</div>` : ''}</div>
    <p>${stats.newIntroduced ? bi(`Daily new-word goal: ${learningPlan().newIntroducedToday} / ${learningStore.state.settings.dailyGoal}.`, `هدف روزانهٔ واژه‌های جدید: ${learningPlan().newIntroducedToday} از ${learningStore.state.settings.dailyGoal}.`) : bi('Your scheduled review history is up to date.', 'تاریخچهٔ مرور زمان‌بندی‌شده به‌روز است.')}</p><div class="btnrow"><a class="btn" href="#/study/mixed">${bi('Continue studying', 'ادامهٔ مطالعه')}</a><a class="btn alt" href="#/progress">${bi('View progress', 'مشاهدهٔ پیشرفت')}</a><a class="btn alt" href="#/learn">${bi('Done', 'پایان')}</a></div></section>`;
}

function viewStudy(mode, collectionId = '') {
  const at = Date.now(), plan = learningPlan(at);
  let queue = [], collection = null, displayMode = mode;
  if (mode === 'review') queue = learningStore.dueRecords(at).map(r => ({ id: r.id, kind: 'review' }));
  else if (mode === 'new') queue = plan.newWords.map(w => ({ id: wordIdFor(w), kind: 'new' }));
  else if (mode === 'mixed') queue = [...learningStore.dueRecords(at).map(r => ({ id: r.id, kind: 'review' })), ...plan.newWords.map(w => ({ id: wordIdFor(w), kind: 'new' }))];
  else if (mode === 'collection' || mode === 'collection-review') {
    collection = learningStore.state.collections.find(c => c.id === String(collectionId));
    if (!collection) { main.innerHTML = `<a class="back" href="#/collections">${bi('← Collections', '← مجموعه‌ها')}</a><section class="card empty"><h2>${bi('Collection not found', 'مجموعه پیدا نشد')}</h2></section>`; return; }
    if (mode === 'collection') queue = collection.wordIds.filter(id => wordIndexById.has(id)).map(id => ({ id, kind: 'collection' }));
    else queue = learningStore.dueRecords(at, collection.wordIds).map(r => ({ id: r.id, kind: 'review' }));
    displayMode = mode;
  }
  if (!queue.length) {
    const newDone = plan.newIntroducedToday >= learningStore.state.settings.dailyGoal;
    const title = mode === 'review' || mode === 'collection-review' ? bi('All caught up', 'همهٔ مرورها انجام شده‌اند') : mode === 'new' && newDone ? bi('Daily new-word target reached', 'هدف روزانهٔ واژه‌های جدید تکمیل شده') : mode === 'collection' ? bi('No words in this collection yet', 'هنوز واژه‌ای در این مجموعه نیست') : bi('Nothing planned right now', 'فعلاً کاری برنامه‌ریزی نشده است');
    const detail = mode === 'review' ? bi('There are no scheduled reviews due at this moment. Newly introduced words enter the review queue after a short interval.', 'در حال حاضر مرور زمان‌بندی‌شده‌ای سررسید نشده است. واژه‌های تازه پس از فاصله‌ای کوتاه وارد صف مرور می‌شوند.') : mode === 'collection-review' ? bi('This collection has no due reviews right now. Collection practice will not change review schedules.', 'در این مجموعه فعلاً مرور سررسیدشده‌ای نیست. تمرین عادی مجموعه برنامهٔ مرور را تغییر نمی‌دهد.') : mode === 'new' ? (newDone ? bi('Your configured new-word goal is already complete for today. Reviews can still be studied.', 'هدف تعیین‌شدهٔ واژه‌های جدید امروز تکمیل شده است؛ همچنان می‌توانید مرور کنید.') : bi('No more eligible words with usable Persian meanings are available in the current dictionary.', 'در واژه‌نامهٔ فعلی واژهٔ واجد شرایط دیگری با معنی فارسی قابل‌استفاده وجود ندارد.')) : mode === 'collection' ? bi('Add words to this collection, then start a practice round.', 'واژه‌هایی به این مجموعه اضافه کنید و سپس تمرین را شروع کنید.') : bi('No reviews or new words are available at the moment.', 'در حال حاضر مرور یا واژهٔ جدیدی در دسترس نیست.');
    main.innerHTML = `<a class="back" href="${mode.startsWith('collection') ? `#/collection/${encodeURIComponent(collectionId)}` : '#/learn'}">${bi('← Back', '← بازگشت')}</a><section class="card empty enter"><h2>${title}</h2><p>${detail}</p><div class="btnrow"><a class="btn" href="#/learn">${bi('Daily plan', 'برنامهٔ روزانه')}</a>${collection ? `<a class="btn alt" href="#/collection/${encodeURIComponent(collection.id)}">${bi('Open collection', 'بازکردن مجموعه')}</a>` : `<a class="btn alt" href="#/study/mixed">${bi('Mixed session', 'جلسهٔ ترکیبی')}</a>`}</div></section>`;
    return;
  }
  const session = { n: 0, reviewsCompleted: 0, successes: 0, failures: 0, newIntroduced: 0, collectionCards: 0, didWork: false, summarySaved: false };
  const total = queue.length;
  const isScheduled = item => item.kind === 'review';
  const draw = (revealed = false) => {
    if (session.n >= total) { if (!session.summarySaved) { session.summarySaved = true; studySummary(displayMode, session, total); } return; }
    const item = queue[session.n], w = wordFromId(item.id);
    if (!w) { session.n++; draw(false); return; }
    const f = famById.get(w.f), exampleRecord = exampleForWord(wordIndexById.get(item.id)), example = exampleRecord?.en || '';
    let answered = false;
    const modeName = item.kind === 'review' ? `${bi('Scheduled review', 'مرور زمان‌بندی‌شده')} · ${bi(stateLabel(learningStore.getRecord(item.id)?.state || 'learning'), stateLabelFa(learningStore.getRecord(item.id)?.state || 'learning'))}` : item.kind === 'new' ? bi('New word', 'واژهٔ جدید') : bi('Collection practice · schedule unchanged', 'تمرین مجموعه · بدون تغییر زمان‌بندی');
    main.innerHTML = `<a class="back" href="${displayMode.startsWith('collection') ? `#/collection/${encodeURIComponent(collectionId)}` : '#/learn'}">${bi('← Exit session', '← خروج از جلسه')}</a>
      <div class="study-progress"><div><span>${modeName}</span><b>${bi(`${session.n + 1} of ${total}`, `${session.n + 1} از ${total}`)}</b></div><div class="progress"><i style="width:${session.n / total * 100}%"></i></div></div>
      <section class="study-card card"><p class="eyebrow">${item.kind === 'new' ? bi('Learn a new word', 'یادگیری واژهٔ جدید') : item.kind === 'collection' ? esc(collection.name) : bi('Recall before revealing', 'پیش از دیدن پاسخ، به یاد بیاورید')}</p><h1 class="study-word" lang="en">${esc(w.w)}</h1>
        <div class="study-meta">${w.cefr ? `<span class="tag cefr">${esc(w.cefr)}</span>` : ''}<span class="tag">${bi(posLabel(w.pos), posParts(w.pos).map(p => POS[p]?.[1] || p).join(' / '))}</span></div>
        ${revealed ? `<div class="study-answer"><div class="study-meaning" lang="fa" dir="rtl">${esc(w.fa)}</div><p class="study-family">${f?.solo ? bi(f.topic || 'Standalone entry', f.topic || 'مدخل مستقل') : bi(`Root / family: ${f?.base || ''}`, `ریشه / خانواده: ${f?.base || ''}`)}</p>${example ? `<p class="study-example" lang="en" dir="ltr">${esc(example)}</p>${exampleRecord?.fa ? `<p class="example-fa" lang="fa" dir="rtl">${esc(exampleRecord.fa)}</p>` : ''}${exampleRecord?.status === 'generated-draft' ? `<p class="src">${bi('Template example · draft, please review', 'مثال الگویی · پیش‌نویس، نیازمند بازبینی')}</p>` : ''}` : ''}<button class="btn alt" id="study-open-word" type="button">${bi('Open dictionary entry', 'بازکردن مدخل واژه‌نامه')}</button></div>` : `<p class="study-prompt">${bi('Try to recall the Persian meaning before revealing the answer.', 'پیش از نمایش پاسخ، معنی فارسی را به خاطر بیاورید.')}</p>`}
        ${!revealed ? `<div class="btnrow"><button class="btn" id="reveal-answer" type="button">${bi('Reveal answer', 'نمایش پاسخ')}</button><button class="btn alt" id="skip-card" type="button">${bi('Skip', 'ردکردن')}</button></div>` : item.kind === 'review' ? `<p class="sub rating-help">${bi('Again: forgot · Hard: difficult · Good: correct · Easy: quick and confident.', 'Again: فراموش کردم · Hard: دشوار · Good: درست · Easy: سریع و مطمئن')}</p><div class="rating-grid"><button class="rating again" data-rating="again" type="button"><b>${bi('Again', 'دوباره')}</b><span>${bi('15 minutes', '۱۵ دقیقه')}</span></button><button class="rating" data-rating="hard" type="button"><b>${bi('Hard', 'سخت')}</b><span>${bi('Short interval', 'فاصلهٔ کوتاه')}</span></button><button class="rating" data-rating="good" type="button"><b>${bi('Good', 'خوب')}</b><span>${bi('Gradual increase', 'افزایش تدریجی')}</span></button><button class="rating easy" data-rating="easy" type="button"><b>${bi('Easy', 'آسان')}</b><span>${bi('Longer interval', 'فاصلهٔ طولانی‌تر')}</span></button></div><button class="btn alt wide" id="skip-card" type="button">${bi('Skip without rating', 'ردکردن بدون ارزیابی')}</button>` : item.kind === 'new' ? `<div class="btnrow"><button class="btn" id="introduce-word" type="button">${bi('Add to learning', 'افزودن به یادگیری')}</button><button class="btn alt" id="skip-card" type="button">${bi('Skip for now', 'فعلاً رد کن')}</button></div>` : `<div class="btnrow"><button class="btn no" id="collection-not-remembered" type="button">${bi('Need more practice', 'نیاز به تمرین بیشتر')}</button><button class="btn ok" id="collection-remembered" type="button">${bi('Remembered', 'به یاد آوردم')}</button><button class="btn alt" id="skip-card" type="button">${bi('Skip', 'ردکردن')}</button></div>`}
      </section>`;
    $('#study-open-word')?.addEventListener('click', () => { location.hash = `#/w/${encodeURIComponent(w.w)}`; });
    $('#reveal-answer')?.addEventListener('click', () => { if (!answered) draw(true); });
    $('#skip-card')?.addEventListener('click', () => { if (answered) return; answered = true; session.n++; draw(false); });
    main.querySelectorAll('[data-rating]').forEach(button => button.addEventListener('click', () => {
      if (answered) return; answered = true; button.disabled = true;
      try {
        learningStore.rate(item.id, button.dataset.rating, { source: 'scheduled-review' });
        session.reviewsCompleted++; if (button.dataset.rating === 'again') session.failures++; else session.successes++;
        session.didWork = true; session.n++; draw(false);
      } catch (error) { answered = false; toast(`Could not save rating: ${error.message}`); }
    }));
    $('#introduce-word')?.addEventListener('click', () => {
      if (answered) return; answered = true;
      try {
        const result = learningStore.introduce(item.id, { source: 'daily-plan' });
        if (result.created) session.newIntroduced++;
        session.didWork = session.didWork || result.created; session.n++; draw(false);
      } catch (error) { answered = false; toast(`Could not save word: ${error.message}`); }
    });
    const collectionAction = remembered => {
      if (answered) return; answered = true;
      try { learningStore.recordCollectionPractice(item.id, remembered, collectionId); session.collectionCards++; session.didWork = true; session.n++; draw(false); }
      catch (error) { answered = false; toast(`Could not save practice: ${error.message}`); }
    };
    $('#collection-remembered')?.addEventListener('click', () => collectionAction(true));
    $('#collection-not-remembered')?.addEventListener('click', () => collectionAction(false));
  };
  draw(false);
}


/* ---------- router ---------- */
function setTab(name) { document.querySelectorAll('#tabs a').forEach(a => a.toggleAttribute('aria-current', a.dataset.tab === name)); document.querySelectorAll('#tabs a').forEach(a => { if (a.dataset.tab === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); }

function route() {
  let h = '';
  try { h = decodeURIComponent(location.hash.replace(/^#\/?/, '')); } catch { h = location.hash.replace(/^#\/?/, ''); }
  const [seg, ...rest] = h.split('/');
  const arg = rest.join('/');
  window.scrollTo(0, 0);
  if (seg === 'w' && arg) { setTab('search'); viewWord(arg); document.title = `${arg} – Rishe ${APP_VERSION}`; return; }
  document.title = `Rishe ${APP_VERSION} – English Roots Dictionary`;
  if (seg === 'support') { setTab(''); viewSupport(); }
  else if (seg === 'about') { setTab(''); viewAbout(); }
  else if (seg === 'learn') { setTab('learn'); viewLearnHome(); }
  else if (seg === 'progress') { setTab('learn'); viewProgress(); }
  else if (seg === 'collections') { setTab('learn'); viewCollections(); }
  else if (seg === 'collection') { setTab('learn'); viewCollection(rest.join('/')); }
  else if (seg === 'study') { setTab('learn'); viewStudy(rest[0] || 'mixed', rest[1] || ''); }
  else if (seg === 'singles') { setTab('families'); viewSingles(arg || ''); }
  else if (seg === 'saved') { setTab('saved'); viewSaved(); }
  else if (seg === 'practice') { setTab('practice'); viewPractice(rest[0], rest[1]); }
  else if (seg === 'affix') { setTab('affixes'); viewAffix(+arg); }
  else if (seg === 'families') { setTab('families'); viewFamilies(arg || ''); }
  else if (seg === 'f') { setTab('families'); viewFamily(arg); }
  else if (seg === 'affixes') { setTab('affixes'); viewAffixes(); }
  else { setTab('search'); viewHome(); }
}

/* ---------- PWA ---------- */
let deferred;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#install').hidden = false; });
$('#install').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#install').hidden = true; });
window.addEventListener('appinstalled', () => { $('#install').hidden = true; toast('Installed – works offline now'); });
const hadController = !!navigator.serviceWorker?.controller;
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(r => r.addEventListener('updatefound', () => { const w = r.installing; w?.addEventListener('statechange', () => { if (w.state === 'activated' && hadController) toast('Updated – reload for the newest version'); }); })).catch(() => {}));

/* ---------- boot ---------- */
load().then(() => { window.addEventListener('hashchange', route); route(); startReminderChecks(); })
  .catch(() => { main.innerHTML = '<p class="loading">Could not load the dictionary data. Please check your connection and reload.</p>'; });
})();
