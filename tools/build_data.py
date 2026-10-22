import openpyxl, json, re, sys
src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src)
lvl = lambda v: (re.match(r'[ABC][12]', str(v)) or [None])[0] if v else None
clean = lambda v: (str(v).strip() if v not in (None, '') else None)

# affixes
aff = []
for r in list(wb['Prefixes_Suffixes'].iter_rows(values_only=True))[1:]:
    if not r[0]: continue
    variants = [v.strip() for v in r[0].split('/')]
    aff.append(dict(key=r[0].strip(), variants=variants, type=r[1], en=r[2], fa=r[3], ex=clean(r[4]), note=clean(r[5]), prod=clean(r[6])))
def find_affix(raw, word, kind):
    """validate a sheet affix against the actual word; return (group index, matched variant) or None"""
    if not raw: return None
    raw = raw.strip()
    for gi, g in enumerate(aff):
        if g['type'].lower() != kind: continue
        if raw in g['variants'] or raw == g['key']:
            ok = []
            for v in g['variants']:
                s = v.strip('-')
                if kind == 'prefix' and word.startswith(s) and len(word) > len(s) + 2: ok.append(v)
                if kind == 'suffix' and word.endswith(s) and len(word) > len(s) + 2: ok.append(v)
            if ok: return gi, max(ok, key=len)
    return None

fams = {}
for r in list(wb['Word_Families'].iter_rows(values_only=True))[1:]:
    if r[0] is None: continue
    fams[r[0]] = dict(id=r[0], base=r[1], root=r[2], pos=r[3], fa=r[4], pattern=r[9], cefr=lvl(r[10]), topic=r[11],
                      ex=clean(r[12]), exFa=clean(r[13]), words=[])

words, seen = [], {}
for r in list(wb['Individual_Words'].iter_rows(values_only=True))[1:]:
    if r[0] is None: continue
    w, fid = r[1].strip(), r[2]
    if fid not in fams: print('orphan', w, fid); continue
    if (w.lower(), fid) in seen: print('dup', w, fid); continue
    pre = find_affix(r[8], w.lower(), 'prefix'); suf = find_affix(r[9], w.lower(), 'suffix')
    d = dict(w=w, f=fid, pos=r[6], fa=r[7], cefr=lvl(r[11]))
    if pre: d['pre'] = [pre[0], pre[1]]
    if suf: d['suf'] = [suf[0], suf[1]]
    if r[13]: d['ex'], d['exFa'] = r[13], r[14]
    if r[15] and r[15] != 'Base form of the family': d['note'] = r[15]
    seen[(w.lower(), fid)] = len(words); fams[fid]['words'].append(len(words)); words.append(d)

# make sure every family's base word is present as an entry (some bases are like "struct / construct")
for f in fams.values():
    f['hasBase'] = any(words[i]['w'].lower() == f['base'].lower() for i in f['words'])
    if not f['hasBase']: print('base not listed as word:', f['id'], f['base'])
    del f['hasBase']

# ---------------------------------------------------------------- draft batches
import glob, os
DROP = set("adjust adjustment planet planetary weekend liberate liberty liberal freeze frozen freezer cape".split())
def undouble(x): return x[:-1] if len(x) > 2 and x[-1] == x[-2] else None
pre_opts, suf_opts = [], []
for gi, g in enumerate(aff):
    for v in g['variants']:
        (pre_opts if g['type'].lower() == 'prefix' else suf_opts).append((v.strip('-'), v, gi))
pre_opts.sort(key=lambda t: -len(t[0])); suf_opts.sort(key=lambda t: -len(t[0]))

def detect(w, base, members):
    best = None
    pres = [None] + [p for p in pre_opts if w.startswith(p[0]) and len(w) - len(p[0]) >= 3]
    sufs = [None] + [x for x in suf_opts if w.endswith(x[0]) and len(w) - len(x[0]) >= 3]
    for p in pres:
        for x in sufs:
            if not p and not x: continue
            core = w[len(p[0]):] if p else w
            if x: core = core[:-len(x[0])]
            if len(core) < 3: continue
            cands = [core, core + 'e', core[:-1] + 'y' if core.endswith('i') else core, undouble(core) or core]
            if any(c in members and c != w for c in cands): sc = 2
            elif len(base) >= 3 and any(c.startswith(base[:3]) for c in cands): sc = 1
            else: continue
            key = (sc, -((1 if p else 0) + (1 if x else 0)), len(core))
            if not best or key > best[0]: best = (key, p, x)
    return best

def parse_batches(folder, taken):
    fams, cur = [], None
    for fn in sorted(glob.glob(os.path.join(folder, '*.txt'))):
        for n, line in enumerate(open(fn, encoding='utf-8'), 1):
            line = line.strip()
            if not line: continue
            if line.startswith('#'):
                p = line[1:].split('|'); assert len(p) == 6, (fn, n, line)
                cur = dict(base=p[0], root=p[1], pos=p[2], fa=p[3], cefr=p[4], topic=p[5], ex=None, exFa=None, entries=[]); fams.append(cur)
            elif line.startswith('~'):
                a = line[1:].split('|'); assert cur and len(a) == 2, (fn, n, line); cur['ex'], cur['exFa'] = a
            else:
                p = line.split('|'); assert cur and len(p) == 3 and p[2].strip(), (fn, n, line)
                k = p[0].strip().lower()
                if k in taken or k in DROP: continue
                taken.add(k); cur['entries'].append((p[0].strip(), p[1].strip(), p[2].strip()))
    return fams

if len(sys.argv) > 3:
    taken = {w['w'].lower() for w in words}
    nid = 100; added = 0
    for nf in parse_batches(sys.argv[3], taken):
        if len(nf['entries']) < 3: continue
        members = {e[0].lower() for e in nf['entries']}
        fam = dict(id=nid, base=nf['base'], root=nf['root'], pos=nf['pos'], fa=nf['fa'], pattern='', cefr=nf['cefr'], topic=nf['topic'],
                   ex=nf['ex'], exFa=nf['exFa'], words=[], draft=1)
        kinds = set()
        for (w, pos, fa) in nf['entries']:
            d = dict(w=w, f=nid, pos=pos, fa=fa, cefr=nf['cefr'])
            if w.lower() != nf['base'].lower():
                hit = detect(w.lower(), nf['base'].lower(), members)
                if hit:
                    _, p, x = hit
                    if p: d['pre'] = [p[2], p[1]]; kinds.add('prefixation')
                    if x: d['suf'] = [x[2], x[1]]; kinds.add('suffixation')
            fam['words'].append(len(words)); words.append(d); added += 1
        fam['pattern'] = ' + '.join(sorted(kinds)) or 'root-based / compounding'
        fams[nid] = fam; nid += 1
    print('draft batches:', nid - 100, 'families,', added, 'words')

# ---------------------------------------------------------------- stand-alone words (no family)
# format per line:  word|pos|Persian meaning|CEFR|topic     (optional 6th field: example sentence EN|FA not supported)
if len(sys.argv) > 4:
    taken = {w['w'].lower() for w in words} | DROP
    sid = 1000; n_solo = 0
    for fn in sorted(glob.glob(os.path.join(sys.argv[4], '*.txt'))):
        for n, line in enumerate(open(fn, encoding='utf-8'), 1):
            line = line.strip()
            if not line or line.startswith('#'): continue
            p = [x.strip() for x in line.split('|')]
            assert len(p) >= 3 and p[2], (fn, n, line)
            w = p[0]; k = w.lower()
            if k in taken: continue
            taken.add(k)
            cefr = p[3] if len(p) > 3 and p[3] else None; topic = p[4] if len(p) > 4 else ''
            fams[sid] = dict(id=sid, base=w, root='', pos=p[1], fa=p[2], pattern='', cefr=cefr, topic=topic, ex=None, exFa=None,
                             words=[len(words)], draft=1, solo=1)
            words.append(dict(w=w, f=sid, pos=p[1], fa=p[2], cefr=cefr)); sid += 1; n_solo += 1
    print('stand-alone words:', n_solo)

json.dump(dict(families=list(fams.values()), words=words,
               affixes=[{k: v for k, v in a.items()} for a in aff]),
          open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(fams), 'families total', len(words), 'words total', len(aff), 'affixes')
print(sum('pre' in w for w in words), 'with prefix', sum('suf' in w for w in words), 'with suffix')
