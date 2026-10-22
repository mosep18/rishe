/* Rishe – English → Persian root dictionary (MVP). Vanilla JS, no build step. */
(() => {
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const main = $('#main');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

/* ---------- data ---------- */
async function load() {
  const res = await fetch('data.json');
  D = await res.json();
  D.families.forEach(f => famById.set(f.id, f));
  D.words.forEach((w, i) => {
    const k = w.w.toLowerCase();
    if (!wordMap.has(k)) wordMap.set(k, []);
    wordMap.get(k).push(i);
  });
  allForms = [...wordMap.keys()].sort();
  D.affixes.forEach((a, gi) => a.variants.forEach(v => {
    const s = v.replace(/-/g, '').trim();
    (a.type === 'Prefix' ? prefixes : suffixes).push({ s, v, gi });
  }));
  prefixes.sort((a, b) => b.s.length - a.s.length);
  const nf = D.families.filter(f => !f.solo).length, ns = D.families.length - nf, nw = D.words.length, nd = D.words.filter(w => famById.get(w.f).draft).length;
  $('.foot p').textContent = `${nf} word families + ${ns} single words · ${nw.toLocaleString()} words in total (${nd.toLocaleString()} drafted by AI, not yet reviewed). Works offline once loaded.`;
  suffixes.sort((a, b) => b.s.length - a.s.length);
}

/* ---------- lookup engine ---------- */
const IRREGULAR = { knew: 'know', known: 'know', thought: 'think', felt: 'feel', wrote: 'write', written: 'write' };

function normalizeFa(s) {
  return s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌ً-ٟ]/g, ' ').replace(/\s+/g, ' ').trim();
}
const isPersian = s => /[؀-ۿ]/.test(s);

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
    <div class="chips">${LEVELS.filter(l => D.families.some(f => f.cefr === l && !f.solo)).map(l => `<a class="chip" href="#/families/${l}">${l} · ${D.families.filter(f => f.cefr === l && !f.solo).length} families</a>`).join('')}<a class="chip" href="#/singles">Single words · ${D.families.filter(f => f.solo).length}</a></div>`;
  bindSearch();
}

function entryCard(wi, ctx) {
  const w = D.words[wi], f = famById.get(w.f);
  const tags = [...posParts(w.pos).map(p => `<span class="tag">${esc(POS[p]?.[0] || p)}</span>`), w.cefr ? `<span class="tag cefr">${esc(w.cefr)}</span>` : '', f.draft ? `<span class="tag draft" title="Persian wording drafted by AI; not yet reviewed by a lexicographer">Draft</span>` : ''].join('');
  return `<section class="card entry enter">
    <div class="row"><h1 class="word" lang="en">${esc(w.w)}</h1><button class="say" data-say="${esc(w.w)}" aria-label="Pronounce ${esc(w.w)}"><svg viewBox="0 0 24 24"><path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16.500 9a4 4 0 010 6M19 6.500a8 8 0 010 11"/></svg></button>
      <div class="actions"><button class="say fav" data-fav="${esc(w.w)}" aria-pressed="${isFav(w.w)}" aria-label="Save word"><svg viewBox="0 0 24 24"><path d="M6 4h12v17l-6-4-6 4z"/></svg></button>
      <button class="say share" data-share="${esc(w.w)}" aria-label="Share"><svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/></svg></button></div></div>
    <div class="tags">${tags}</div>
    <p class="meaning" lang="fa" dir="rtl"><small>Persian meaning · معنی فارسی</small>${esc(w.fa)}</p>
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

function exampleCard(wi) {
  const w = D.words[wi], f = famById.get(w.f);
  const own = !!w.ex;
  const en = w.ex || f.ex, fa = w.exFa || f.exFa;
  if (!en) return '';
  const re = new RegExp('\\b(' + w.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')\\b', 'i');
  const hl = esc(en).replace(re, '<mark>$1</mark>');
  return `<section class="card enter"><h2>Example <span class="fa" lang="fa">مثال</span></h2>
    <p class="example" lang="en">${hl}</p><p class="example-fa" lang="fa" dir="rtl">${esc(fa || '')}</p>
    ${own ? '' : `<div class="src">Example for the base word “${esc(f.base)}”.</div>`}</section>`;
}

function wordView(res) {
  const idx = res.idx;
  let sel = 0;
  const sw = idx.length > 1 ? `<div class="switch" role="tablist" aria-label="Families containing this word">${idx.map((i, n) => `<button class="chip ${n === sel ? 'on' : ''}" data-sel="${n}" role="tab">in family: ${esc(famById.get(D.words[i].f).base)}</button>`).join('')}</div>` : '';
  const notice = noticeHtml(res);
  const paint = (n, target) => {
    const wi = idx[n];
    target.innerHTML = (idx.length > 1 ? `<div class="notice"><span>🔀</span><div><b>${esc(D.words[wi].w)}</b> belongs to ${idx.length} families — pick one above.</div></div>` : '') +
      (famById.get(D.words[wi].f).solo ? entryCard(wi) + soloCard(wi) : entryCard(wi) + rootCard(wi) + buildCard(wi) + familyCard(D.words[wi].f, wi) + exampleCard(wi));
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
    <div class="chips"><a class="chip on" href="#/families">Families</a><a class="chip" href="#/singles">Single words</a></div>
    <div class="chips"><a class="chip ${!level ? 'on' : ''}" href="#/families">All levels</a>${LEVELS.filter(l => D.families.some(f => f.cefr === l)).map(l => `<a class="chip ${level === l ? 'on' : ''}" href="#/families/${l}">${l}</a>`).join('')}</div>
    <div class="grid">${list.map(f => `<a class="fcard enter" href="#/f/${f.id}"><div class="top2"><span class="b">${esc(f.base)}</span><span class="lv">${esc(f.cefr || '')}${f.draft ? ' · draft' : ''}</span></div><span class="fa" lang="fa" dir="rtl">${esc(f.fa)}</span><span class="n">${f.words.length} words · ${esc(f.topic || '')}</span></a>`).join('')}</div>`;
}

function viewFamily(id) {
  const f = famById.get(+id);
  if (!f) return viewFamilies();
  if (f.solo) return viewWord(f.base);
  const bi = f.words.find(i => D.words[i].w.toLowerCase() === f.base.toLowerCase());
  const first = bi ?? f.words[0];
  main.innerHTML = `<a class="back" href="#/families">← All families</a>
    <section class="card entry enter"><div class="row"><h1 class="word">${esc(f.base)}</h1></div>
      <div class="tags">${f.cefr ? `<span class="tag cefr">${esc(f.cefr)}</span>` : ''}${f.draft ? '<span class="tag draft">Draft</span>' : ''}${f.topic ? `<span class="tag">${esc(f.topic)}</span>` : ''}</div>
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
function grade(w, ok) { const b = boxes(), k = w.toLowerCase(); b[k] = { b: ok ? Math.min((b[k]?.b || 1) + 1, 5) : 1, t: Date.now() }; store.set('rishe.box', b); }
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
  return `<section class="card enter"><h2>Word family <span class="fa" lang="fa">خانوادهٔ واژه</span></h2>
    <p class="sub" style="margin:0">“${esc(w.w)}” stands on its own: no related forms for it have been added to the database yet.${f.topic ? ` Topic: <b>${esc(f.topic)}</b>.` : ''}</p></section>`;
}
function viewSingles(level) {
  const list = D.families.filter(f => f.solo && (!level || f.cefr === level)).sort((a, b) => a.base.localeCompare(b.base));
  main.innerHTML = `<h1 class="page-title">Single words <span class="fa" lang="fa" style="font-size:1.1rem;color:var(--muted)">واژه‌های مستقل</span></h1>
    <p class="sub">Words without family members. ${list.length} shown.</p>
    <div class="chips"><a class="chip" href="#/families">Families</a><a class="chip on" href="#/singles">Single words</a></div>
    <div class="chips"><a class="chip ${!level ? 'on' : ''}" href="#/singles">All levels</a>${LEVELS.filter(l => D.families.some(f => f.solo && f.cefr === l)).map(l => `<a class="chip ${level === l ? 'on' : ''}" href="#/singles/${l}">${l}</a>`).join('')}</div>
    <input class="filter" id="sfilter" type="search" placeholder="Filter words…" aria-label="Filter single words">
    <div id="slist"></div>`;
  const draw = t => { const q = t.toLowerCase().trim(); const rows = list.filter(f => !q || f.base.toLowerCase().includes(q) || f.fa.includes(q)).slice(0, 300);
    $('#slist').innerHTML = rows.map(f => rowHtml(f.words[0])).join('') || '<p class="sub">No match.</p>'; };
  draw(''); $('#sfilter').addEventListener('input', e => draw(e.target.value));
}
/* ---------- router ---------- */
function setTab(name) { document.querySelectorAll('#tabs a').forEach(a => a.toggleAttribute('aria-current', a.dataset.tab === name)); document.querySelectorAll('#tabs a').forEach(a => { if (a.dataset.tab === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); }

function route() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [seg, ...rest] = h.split('/');
  const arg = rest.join('/');
  window.scrollTo(0, 0);
  if (seg === 'w' && arg) { setTab('search'); viewWord(arg); document.title = `${arg} – Rishe`; return; }
  document.title = 'Rishe – English Roots Dictionary';
  if (seg === 'singles') { setTab('families'); viewSingles(arg || ''); }
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
load().then(() => { window.addEventListener('hashchange', route); route(); })
  .catch(() => { main.innerHTML = '<p class="loading">Could not load the dictionary data. Please check your connection and reload.</p>'; });
})();
