'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('release version is consistent across app metadata, package, and Service Worker', () => {
  const index = read('index.html'), app = read('app.js'), sw = read('sw.js');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const pkg = JSON.parse(read('package.json'));
  assert.match(index, /application-version" content="1\.6\.2"/);
  assert.match(index, /Version 1\.6\.2/);
  assert.match(app, /const APP_VERSION = '1\.6\.2'/);
  assert.match(sw, /rishe-app-v1\.6\.2/);
  assert.match(index, /learning\.js/);
  assert.equal(pkg.version, '1.6.2');
  assert.match(manifest.description, /Rishe 1\.6\.2/);
});

test('every Service Worker shell asset exists in the project', () => {
  const sw = read('sw.js');
  const match = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(match, 'Service Worker shell array exists');
  const paths = [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.ok(paths.includes('learning.js'));
  for (const entry of paths) {
    if (entry === './') continue;
    assert.ok(fs.existsSync(path.join(root, entry)), `missing shell entry: ${entry}`);
  }
});

test('learning routes and UI entry points are wired into the existing router', () => {
  const app = read('app.js'), index = read('index.html');
  for (const route of ['learn', 'progress', 'collections', 'collection', 'study']) assert.ok(app.includes(`seg === '${route}'`), `missing route: ${route}`);
  for (const id of ['goal-form', 'export-learning', 'import-learning-file', 'create-collection', 'reveal-answer', 'introduce-word']) assert.ok(app.includes(id), `missing UI action: ${id}`);
  assert.match(index, /data-tab="learn"/);
});

test('dictionary JSON remains in the existing schema and is not copied into the learning module', () => {
  const data = JSON.parse(read('data.json'));
  assert.ok(Array.isArray(data.words) && Array.isArray(data.families) && Array.isArray(data.affixes));
  const engine = read('learning.js');
  assert.doesNotMatch(engine, /fetch\(['"]data\.json/);
  assert.doesNotMatch(engine, /localStorage\.setItem\(['"]data\.json/);
});


test('v1.6.1 generated inflections remain intact after the v1.6.2 aviation import', () => {
  const data = JSON.parse(read('data.json'));
  assert.equal(data.words.length, 11629);
  const generated = data.words.filter(word => word.form_type);
  assert.equal(generated.length, 3581);
  assert.equal(generated.length + 7162, 10743);
  assert.equal(data.words.length - (generated.length + 7162), 886);
  assert.ok(generated.every(word => word.review_status === 'draft' && word.example_status === 'generated-draft'));
  assert.ok(generated.every(word => typeof word.form_of === 'string' && word.form_of.length > 0));
  assert.ok(generated.every(word => typeof word.ex === 'string' && new RegExp(`(^|[^A-Za-z])${word.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^A-Za-z])`, 'i').test(word.ex)));
  assert.ok(generated.every(word => typeof word.exFa === 'string' && word.exFa.length > 0));
});

test('learning, About, Support, chart, and reminder features expose bilingual text and notification handling', () => {
  const app = read('app.js'), sw = read('sw.js'), styles = read('styles.css');
  for (const phrase of ['Your daily plan', 'برنامهٔ یادگیری امروز', 'Daily reminder', 'یادآور روزانه', 'Daily activity chart', 'نمودار فعالیت روزانه', 'About Rishe', 'دربارهٔ ریشه', 'Support Rishe Development', 'حمایت از توسعهٔ ریشه']) {
    assert.ok(app.includes(phrase), `missing expected bilingual text: ${phrase}`);
  }
  assert.match(app, /showNotification\(/);
  assert.match(sw, /notificationclick/);
  assert.match(styles, /\.learning-chart/);
});

test('examples do not fall back to an unrelated family-root sentence', () => {
  const app = read('app.js');
  assert.match(app, /if \(w\.ex && wordOccursInExample\(w\.w, w\.ex\)\)/);
  assert.match(app, /wordOccursInExample\(w\.w, f\.ex\)/);
  assert.doesNotMatch(app, /const en = w\.ex \|\| f\.ex/);
  assert.match(app, /Standalone entry and related forms/);
  assert.match(app, /entryCard\(wi\) \+ soloCard\(wi\) \+ exampleCard\(wi\)/);
  assert.match(app, /Generated \$\{w\.form_type\} of/);
});


test('reminder checks send once per local day after the selected time and disclose browser limits', () => {
  const app = read('app.js');
  assert.match(app, /if \(time < settings\.time \|\| settings\.lastSentDay === today\) return/);
  assert.match(app, /saveReminderSettings\(\{ lastSentDay: today \}\)/);
  assert.match(app, /Without a push server, notifications cannot be guaranteed/);
  assert.match(app, /await registration\.showNotification\(/);
});

test('generated forms stay draft and remain linked to an existing family/source entry', () => {
  const data = JSON.parse(read('data.json'));
  const byIndex = data.words;
  const generated = byIndex.filter(w => w.form_type);
  for (const w of generated) {
    assert.equal(w.review_status, 'draft');
    assert.ok(byIndex.some(source => source.f === w.f && source.w === w.form_of), `${w.w} should link to source ${w.form_of}`);
    assert.ok((data.families.find(f => f.id === w.f)?.words || []).some(i => i < 7162 + generated.length && byIndex[i] === w));
  }
});


test('1.6.2 covers every normalized unique token in the aviation source text', () => {
  const data = JSON.parse(read('data.json'));
  const source = read('tools/aviation_source/aviation_text_4000.txt').replace(/\ben\s+route\b/gi, 'en-route');
  const normalize = raw => raw.toLowerCase().replace(/['’]s$/i, '');
  const tokens = [...source.matchAll(/\b[A-Za-z]+(?:[-'][A-Za-z]+)*\b/g)].map(m => normalize(m[0]));
  const unique = new Set(tokens);
  const forms = new Set(data.words.map(w => String(w.w).toLowerCase()));
  const missing = [...unique].filter(word => !forms.has(word));
  assert.equal(tokens.length, 3985);
  assert.equal(unique.size, 1448);
  assert.deepEqual(missing, []);
});

test('aviation import adds 854 source tokens and 32 root/component entries, all as Draft', () => {
  const data = JSON.parse(read('data.json'));
  const imported = data.words.filter(w => w.source === 'aviation_text_4000.txt');
  const source = read('tools/aviation_source/aviation_text_4000.txt').replace(/\ben\s+route\b/gi, 'en-route');
  const sourceTokens = new Set([...source.matchAll(/\b[A-Za-z]+(?:[-'][A-Za-z]+)*\b/g)].map(m => m[0].toLowerCase().replace(/['’]s$/i, '')));
  const direct = imported.filter(w => sourceTokens.has(String(w.w).toLowerCase()));
  const addedRoots = imported.filter(w => !sourceTokens.has(String(w.w).toLowerCase()));
  assert.equal(imported.length, 886);
  assert.equal(direct.length, 854);
  assert.equal(addedRoots.length, 32);
  const importedFamilies = imported.map(w => data.families.find(f => f.id === w.f));
  assert.equal(imported.filter(w => data.families.find(f => f.id === w.f)?.solo).length, 529);
  assert.equal(imported.filter(w => !data.families.find(f => f.id === w.f)?.solo).length, 357);
  assert.ok(imported.every(w => w.review_status === 'draft' && typeof w.fa === 'string' && w.fa.trim().length > 0));
  assert.ok(imported.every(w => {
    if (!w.form_of) return true;
    const family = data.families.find(f => f.id === w.f);
    return data.words.some(root => root.w.toLowerCase() === w.form_of.toLowerCase() && root.f === w.f)
      && family?.words.includes(data.words.indexOf(w));
  }), 'linked forms must reference an existing root in the same family');
});

test('aviation source examples include the exact imported headword', () => {
  const data = JSON.parse(read('data.json'));
  const imported = data.words.filter(w => w.source === 'aviation_text_4000.txt' && w.ex);
  const escaped = word => word.split('-').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[-\\s]+');
  for (const word of imported) {
    const re = new RegExp(`(^|[^A-Za-z])${escaped(word.w)}(?=$|[^A-Za-z])`, 'i');
    assert.match(word.ex, re, `example for "${word.w}" must contain the exact headword`);
  }
  assert.equal(imported.length, 861);
  assert.equal(data.words.filter(w => w.source === 'aviation_text_4000.txt' && !w.ex).length, 25);
});

test('aviation coverage report records no missing source tokens or empty translations', () => {
  const report = JSON.parse(read('tools/reports/aviation_coverage_report_1.6.2.json'));
  assert.equal(report.release, '1.6.2');
  assert.equal(report.new_source_vocabulary_records_including_roots, 886);
  assert.deepEqual(report.unmatched_source_tokens_after_import, []);
  assert.deepEqual(report.records_with_missing_translation, []);
  assert.equal(report.records_requiring_editorial_review.length, 886);
});
