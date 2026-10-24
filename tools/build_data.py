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
                      ex=clean(r[12]), exFa=clean(r[13]), words=[], review_status='source-curated')

words, seen = [], {}
for r in list(wb['Individual_Words'].iter_rows(values_only=True))[1:]:
    if r[0] is None: continue
    w, fid = r[1].strip(), r[2]
    if fid not in fams: print('orphan', w, fid); continue
    if (w.lower(), fid) in seen: print('dup', w, fid); continue
    pre = find_affix(r[8], w.lower(), 'prefix'); suf = find_affix(r[9], w.lower(), 'suffix')
    d = dict(w=w, f=fid, pos=r[6], fa=r[7], cefr=lvl(r[11]), review_status='source-curated')
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
    nid = max(100, max(int(k) for k in fams) + 1); added = 0
    for nf in parse_batches(sys.argv[3], taken):
        if len(nf['entries']) < 3: continue
        members = {e[0].lower() for e in nf['entries']}
        fam = dict(id=nid, base=nf['base'], root=nf['root'], pos=nf['pos'], fa=nf['fa'], pattern='', cefr=nf['cefr'], topic=nf['topic'],
                   ex=nf['ex'], exFa=nf['exFa'], words=[], draft=1, review_status='draft')
        kinds = set()
        for (w, pos, fa) in nf['entries']:
            d = dict(w=w, f=nid, pos=pos, fa=fa, cefr=nf['cefr'], review_status='draft')
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
    sid = max(1000, max(int(k) for k in fams) + 1); n_solo = 0
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
                             words=[len(words)], draft=1, solo=1, review_status='draft')
            words.append(dict(w=w, f=sid, pos=p[1], fa=p[2], cefr=cefr, review_status='draft')); sid += 1; n_solo += 1
    print('stand-alone words:', n_solo)

# ---------------------------------------------------------------- Rishe 1.6.1 inflectional coverage
# Add reproducible, explicitly-draft regular forms. Existing entries and their indexes
# are kept in place; every generated record points back to its source word and family.
# These are inflectional forms, not claims of 50% more independent lemmas.
import re

IRREGULAR_VERBS = set("""be am is are was were been being have has had do does did done go goes went gone come came become became run ran eat ate eaten write wrote written read speak spoke spoken take took taken make made get got gotten give gave given see saw seen know knew known think thought tell told say said find found feel felt leave left bring brought buy bought teach taught catch caught build built choose chose chosen drive drove driven drink drank drunk sing sang sung swim swam swum break broke broken begin began begun keep kept sleep slept send sent spend spent stand stood understand understood wear wore worn win won lose lost pay paid meet met mean meant lead led sit sat set cut put let hurt hold held sell sold hear heard grow grew grown fall fell fallen fly flew flown draw drew drawn fight fought seek sought throw threw thrown forget forgot forgotten forgive forgave forgiven hide hid hidden shake shook shaken steal stole stolen blow blew blown bite bit bitten light lit lay laid lie lain rise rose risen ride rode ridden ring rang rung cost quit shut spread split burst cast deal dealt dig dug feed fed hang hung shine shone stick stuck strike struck swear swore torn wake woke woken weep wept sweep swept bend bent bind bound bleed bled breed bred burn burnt dream dreamt smell smelt spell spelt spoil spoilt""".split())
UNCOUNTABLE_NOUNS = set("""advice information equipment furniture luggage baggage traffic news knowledge research evidence homework money work software hardware feedback progress weather bread music water air rice sugar milk coffee tea meat clothing machinery accommodation scenery poetry jewelry jewellery patience happiness honesty courage violence permission employment education training travel access assistance cash damage data electricity energy fun health help ice ink luck oxygen pollution safety staff traffic transport vocabulary wealth wisdom""".split())
IRREGULAR_PLURALS = {
    'person': 'people', 'man': 'men', 'woman': 'women', 'child': 'children',
    'foot': 'feet', 'tooth': 'teeth', 'mouse': 'mice', 'goose': 'geese',
    'ox': 'oxen', 'analysis': 'analyses', 'basis': 'bases', 'crisis': 'crises',
    'thesis': 'theses', 'phenomenon': 'phenomena', 'criterion': 'criteria',
    'datum': 'data', 'index': 'indices', 'matrix': 'matrices', 'appendix': 'appendices',
    'cactus': 'cacti', 'fungus': 'fungi', 'nucleus': 'nuclei', 'syllabus': 'syllabi',
    'radius': 'radii', 'diagnosis': 'diagnoses', 'hypothesis': 'hypotheses',
    'parenthesis': 'parentheses', 'oasis': 'oases', 'axis': 'axes', 'quiz': 'quizzes',
}

def inflect_third_person(word):
    if word.endswith(('s', 'x', 'z', 'ch', 'sh', 'o')):
        return word + 'es'
    if re.search(r'[^aeiou]y$', word):
        return word[:-1] + 'ies'
    return word + 's'

def inflect_past(word):
    if word.endswith('e'):
        return word + 'd'
    if re.search(r'[^aeiou]y$', word):
        return word[:-1] + 'ied'
    if 3 <= len(word) <= 5 and re.search(r'[^aeiou][aeiou][^aeiouwxy]$', word):
        return word + word[-1] + 'ed'
    return word + 'ed'

def inflect_gerund(word):
    if word.endswith('ie'):
        return word[:-2] + 'ying'
    if word.endswith('e') and not word.endswith(('ee', 'ye', 'oe')):
        return word[:-1] + 'ing'
    if 3 <= len(word) <= 5 and re.search(r'[^aeiou][aeiou][^aeiouwxy]$', word):
        return word + word[-1] + 'ing'
    return word + 'ing'

def inflect_plural(word):
    if word in UNCOUNTABLE_NOUNS:
        return None
    if word.endswith(('s', 'x', 'z', 'ch', 'sh')):
        return word + 'es'
    if re.search(r'[^aeiou]y$', word):
        return word[:-1] + 'ies'
    if word.endswith('fe'):
        return word[:-2] + 'ves'
    if word.endswith('f') and word not in {'roof', 'belief', 'chief', 'chef', 'proof', 'cliff', 'reef', 'handkerchief'}:
        return word[:-1] + 'ves'
    return word + 's'

# Common Persian infinitive endings let us create a transparent first-pass translation
# for generated examples. When the gloss does not support safe conjugation, use a
# metalinguistic Persian sentence instead of inventing a translation.
PERSIAN_VERBS = [
    ('پذیرفتن', 'پذیرفت', 'می‌پذیرد'), ('نوشتن', 'نوشت', 'می‌نویسد'),
    ('خواندن', 'خواند', 'می‌خواند'), ('دیدن', 'دید', 'می‌بیند'),
    ('گرفتن', 'گرفت', 'می‌گیرد'), ('دادن', 'داد', 'می‌دهد'),
    ('گذاشتن', 'گذاشت', 'می‌گذارد'), ('داشتن', 'داشت', 'دارد'),
    ('ساختن', 'ساخت', 'می‌سازد'), ('یافتن', 'یافت', 'می‌یابد'),
    ('رسیدن', 'رسید', 'می‌رسد'), ('ماندن', 'ماند', 'می‌ماند'),
    ('نشستن', 'نشست', 'می‌نشیند'), ('ایستادن', 'ایستاد', 'می‌ایستد'),
    ('پوشیدن', 'پوشید', 'می‌پوشد'), ('خوردن', 'خورد', 'می‌خورد'),
    ('بردن', 'برد', 'می‌برد'), ('گفتن', 'گفت', 'می‌گوید'),
    ('آمدن', 'آمد', 'می‌آید'), ('رفتن', 'رفت', 'می‌رود'),
    ('شدن', 'شد', 'می‌شود'), ('کردن', 'کرد', 'می‌کند'),
    ('بودن', 'بود', 'است'), ('زدن', 'زد', 'می‌زند'),
]

def first_gloss(value):
    return re.split(r'[؛;،,]', str(value or ''))[0].strip()

def conjugate_persian(gloss, tense):
    gloss = first_gloss(gloss)
    for infinitive, past, present in PERSIAN_VERBS:
        if gloss.endswith(infinitive):
            stem = gloss[:-len(infinitive)].rstrip()
            result = past if tense == 'past' else present
            return (stem + (' ' if stem else '') + result).strip()
    return None

def generated_example(form, source, form_type):
    gloss = first_gloss(source.get('fa', ''))
    if form_type == 'plural noun':
        return (f'The {form} were discussed at the meeting.',
                f'دربارهٔ «{gloss}» در جلسه گفت‌وگو شد.')
    if form_type == 'past tense':
        translated = conjugate_persian(gloss, 'past')
        return (f'She {form} yesterday.', f'او دیروز {translated}.' if translated else f'صورت گذشتهٔ «{form}» در این جمله به کار رفته است.')
    if form_type == '3rd person singular':
        translated = conjugate_persian(gloss, 'present')
        return (f'She {form} every morning.', f'او هر صبح {translated}.' if translated else f'صورت سوم‌شخص مفرد «{form}» در این جمله به کار رفته است.')
    return (f'She is {form} right now.',
            f'او اکنون در حال {gloss} است.' if gloss.endswith(('کردن', 'شدن', 'بودن', 'دادن', 'گرفتن', 'رفتن', 'آمدن', 'زدن')) else f'صورت ing واژهٔ «{form}» در این جمله به کار رفته است.')

existing_forms = {str(w['w']).strip().casefold() for w in words}
extra_target = round(len(words) * 0.5)
inflection_candidates = []
for source_index, source in enumerate(list(words)):
    token = str(source.get('w') or '').strip().lower()
    if not token.isalpha() or len(token) < 2:
        continue
    pos = {x.strip() for x in str(source.get('pos') or '').lower().split('/')}
    candidates = []
    if 'v' in pos and token not in IRREGULAR_VERBS and not token.endswith(('ed', 'ing')):
        candidates.extend([
            (inflect_third_person(token), '3rd person singular'),
            (inflect_past(token), 'past tense'),
            (inflect_gerund(token), 'gerund'),
        ])
    family = fams.get(source['f'])
    if 'n' in pos and family and token.casefold() == str(family.get('base') or '').casefold():
        plural = IRREGULAR_PLURALS.get(token) or inflect_plural(token)
        if plural:
            candidates.append((plural, 'plural noun'))
    for form, form_type in candidates:
        key = form.casefold()
        if not form.isalpha() or key in existing_forms or len(form) > 32:
            continue
        existing_forms.add(key)
        inflection_candidates.append((form, source_index, form_type))

# Spread generated forms across families instead of filling the first few families.
# Families already above the validation threshold are not expanded, and no family
# receives generated members beyond 25 total entries in this pass.
from collections import defaultdict
from heapq import heappop, heappush

candidates_by_family = defaultdict(list)
for candidate in inflection_candidates:
    form, source_index, form_type = candidate
    candidates_by_family[words[source_index]['f']].append(candidate)

family_heap = []
family_cursors = defaultdict(int)
for fid, candidates in candidates_by_family.items():
    size = len(fams[fid]['words'])
    if candidates and size < 25:
        heappush(family_heap, (size, str(fid), fid))

added_inflections = 0
while family_heap and added_inflections < extra_target:
    size, _, fid = heappop(family_heap)
    family = fams[fid]
    cursor = family_cursors[fid]
    candidates = candidates_by_family[fid]
    if cursor >= len(candidates) or len(family['words']) >= 25:
        continue
    form, source_index, form_type = candidates[cursor]
    family_cursors[fid] += 1
    source = words[source_index]
    example_en, example_fa = generated_example(form, source, form_type)
    generated = {
        'w': form,
        'f': source['f'],
        'pos': source.get('pos', ''),
        'fa': source.get('fa', ''),
        'cefr': source.get('cefr') or family.get('cefr'),
        'review_status': 'draft',
        'form_of': source.get('w', ''),
        'form_type': form_type,
        'ex': example_en,
        'exFa': example_fa,
        'example_status': 'generated-draft',
    }
    family['words'].append(len(words))
    words.append(generated)
    added_inflections += 1
    new_size = len(family['words'])
    if family_cursors[fid] < len(candidates) and new_size < 25:
        heappush(family_heap, (new_size, str(fid), fid))

if added_inflections != extra_target:
    raise RuntimeError(f'Could only add {added_inflections} of {extra_target} required draft forms without overfilling families.')
print(f'Rishe 1.6.1: added {added_inflections} generated inflectional word forms (draft); target was {extra_target}.')

json.dump(dict(families=list(fams.values()), words=words,
               affixes=[{k: v for k, v in a.items()} for a in aff]),
          open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(fams), 'families total', len(words), 'words total', len(aff), 'affixes')
print(sum('pre' in w for w in words), 'with prefix', sum('suf' in w for w in words), 'with suffix')
print(sum(f.get('review_status') == 'source-curated' and not f.get('solo') for f in fams.values()), 'source-curated families; all draft batches remain marked draft')
