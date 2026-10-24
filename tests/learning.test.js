'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../learning.js');

class MemoryStorage {
  constructor(initial = {}) { this.data = new Map(Object.entries(initial)); this.failReads = false; this.failWrites = false; }
  getItem(k) { if (this.failReads) throw new Error('read blocked'); return this.data.has(k) ? this.data.get(k) : null; }
  setItem(k, v) { if (this.failWrites) throw new Error('quota'); this.data.set(k, String(v)); }
  removeItem(k) { this.data.delete(k); }
}
let clock;
const now = () => clock;
const resetClock = () => { clock = Date.UTC(2026, 9, 24, 8, 0, 0); };
const makeStore = (storage = new MemoryStorage()) => L.createStore(storage, { now });
const word = (w, base = '') => ({ w, fa: `${w} معنی`, f: base });
const baseFor = w => w.f;

test('word IDs are stable across array positions and distinguish family senses', () => {
  assert.equal(L.wordId(word('Fly', 'fly'), 'fly'), L.wordId(word('fly', 'fly'), 'fly'));
  assert.notEqual(L.wordId(word('fly', 'fly'), 'fly'), L.wordId(word('fly', 'flee'), 'flee'));
  assert.equal(L.wordId({ w: '  ' }), '');
});

test('new records start in learning and use a short initial interval', () => {
  resetClock(); const r = L.initialRecord('word:act', clock);
  assert.equal(r.state, 'learning');
  assert.equal(r.nextReviewAt - clock, 10 * L.MINUTE);
  assert.equal(r.intervalDays, 10 / 1440);
  assert.equal(r.lastReviewedAt, null);
});

test('Again fails recall and schedules a 15-minute retry', () => {
  resetClock(); const r = L.schedule(L.initialRecord('word:act', clock), 'again', clock + 1000);
  assert.equal(r.state, 'learning'); assert.equal(r.failedReviews, 1);
  assert.equal(r.consecutiveSuccesses, 0); assert.equal(r.nextReviewAt, clock + 1000 + 15 * L.MINUTE);
});

test('Hard and Good move through learning, then established review', () => {
  resetClock(); let r = L.initialRecord('word:act', clock);
  r = L.schedule(r, 'hard', clock); assert.equal(r.state, 'learning'); assert.equal(r.intervalDays, 1);
  r = L.schedule(r, 'good', clock + L.DAY); assert.equal(r.state, 'review');
  assert.equal(r.intervalDays, 3); assert.equal(r.successfulReviews, 2);
  r = L.schedule(r, 'good', clock + 4 * L.DAY); assert.equal(r.intervalDays, 6);
});

test('Easy graduates a word to review; repeated intervals are capped', () => {
  resetClock(); let r = L.schedule(L.initialRecord('word:easy', clock), 'easy', clock);
  assert.equal(r.state, 'review'); assert.equal(r.intervalDays, 3);
  r.intervalDays = L.MAX_INTERVAL_DAYS; r = L.schedule(r, 'good', clock + L.DAY);
  assert.equal(r.intervalDays, L.MAX_INTERVAL_DAYS);
  assert.ok(Number.isFinite(r.nextReviewAt));
});

test('a forgotten established word enters relearning and stays there after one Good', () => {
  resetClock(); let r = { ...L.initialRecord('word:act', clock), state: 'review', intervalDays: 12, consecutiveSuccesses: 5 };
  r = L.schedule(r, 'again', clock); assert.equal(r.state, 'relearning');
  r = L.schedule(r, 'good', clock + 15 * L.MINUTE); assert.equal(r.state, 'relearning');
  r = L.schedule(r, 'good', clock + 16 * L.MINUTE); assert.equal(r.state, 'review');
});

test('invalid ratings and timestamps are rejected', () => {
  resetClock(); const r = L.initialRecord('word:act', clock);
  assert.throws(() => L.schedule(r, 'perfect', clock), /Unknown recall rating/);
  assert.throws(() => L.schedule(r, 'good', -1), /timestamp/);
});

test('storage persists goals, learning records and collections across reloads', () => {
  resetClock(); const storage = new MemoryStorage(), s = makeStore(storage);
  s.setDailyGoal(15); s.introduce('word:act'); s.rate('word:act', 'good');
  const id = s.createCollection('Aviation', 'Exam words'); s.addToCollection(id, 'word:act'); s.addToCollection(id, 'word:act');
  const loaded = makeStore(storage);
  assert.equal(loaded.state.settings.dailyGoal, 15);
  assert.equal(loaded.getRecord('word:act').successfulReviews, 1);
  assert.equal(loaded.state.collections.length, 1);
  assert.deepEqual(loaded.state.collections[0].wordIds, ['word:act']);
});

test('daily plan is deterministic, respects goal, and does not re-introduce studied IDs', () => {
  resetClock(); const s = makeStore(); s.setDailyGoal(2);
  const words = [word('act', 'act'), word('action', 'act'), word('active', 'act'), word('adapt', 'adapt')];
  const p1 = L.calculatePlan(words, s, baseFor, clock), p2 = L.calculatePlan(words, s, baseFor, clock);
  assert.equal(p1.newWords.length, 2);
  assert.deepEqual(p1.newWords.map(w => L.wordId(w, baseFor(w))), p2.newWords.map(w => L.wordId(w, baseFor(w))));
  s.introduce(L.wordId(p1.newWords[0], baseFor(p1.newWords[0])));
  const p3 = L.calculatePlan(words, s, baseFor, clock);
  assert.equal(p3.newWords.length, 1);
  assert.ok(p3.newWords.every(w => L.wordId(w, baseFor(w)) !== L.wordId(p1.newWords[0], baseFor(p1.newWords[0]))));
});

test('daily plan limits new introductions when review backlog is heavy', () => {
  resetClock(); const s = makeStore(); s.setDailyGoal(10);
  const backlogWords = Array.from({length: 20}, (_, i) => word(`old${i}`, `oldbase${i}`));
  for (const w of backlogWords) {
    const id = L.wordId(w, baseFor(w)); s.introduce(id); s.state.records[id].state = 'review'; s.state.records[id].nextReviewAt = clock - 1000;
  }
  s.save();
  const words = [...backlogWords, ...Array.from({length: 5}, (_, i) => word(`fresh${i}`, `base${i}`))];
  const plan = L.calculatePlan(words, s, baseFor, clock);
  assert.equal(plan.dueCount, 20); assert.equal(plan.newWords.length, 0); assert.ok(plan.deferralReason);
});

test('due queue prioritizes relearning and learning states before established review', () => {
  resetClock(); const s = makeStore();
  ['reviewWord', 'learningWord', 'relearningWord'].forEach(id => { s.introduce(id); s.state.records[id].nextReviewAt = clock - 1000; });
  s.state.records.reviewWord.state = 'review'; s.state.records.learningWord.state = 'learning'; s.state.records.relearningWord.state = 'relearning'; s.save();
  assert.deepEqual(s.dueRecords(clock).map(r => r.id), ['relearningWord', 'learningWord', 'reviewWord']);
});

test('statistics count only real records/events and define Again as unsuccessful', () => {
  resetClock(); const s = makeStore(); const words = [word('act', 'act')];
  const id = L.wordId(words[0], 'act'); s.introduce(id); s.rate(id, 'again'); s.rate(id, 'good');
  s.recordSessionCompleted({ mode: 'mixed', reviewCards: 2, successfulReviews: 1, failedReviews: 1, newWords: 1 });
  const stats = L.statistics(words, s, baseFor, clock);
  assert.equal(stats.introduced, 1); assert.equal(stats.reviewsCompleted, 2); assert.equal(stats.newToday, 1);
  assert.equal(stats.reviewsToday, 2); assert.equal(stats.successRate7d, 50); assert.equal(stats.reviewSessionsCompleted, 1);
});

test('collection operations reject duplicates and never delete learning history', () => {
  resetClock(); const s = makeStore(); s.introduce('word:act');
  const id = s.createCollection('Aviation');
  assert.throws(() => s.createCollection('aviation'), /already exists/);
  assert.equal(s.addToCollection(id, 'word:act').added, true);
  assert.equal(s.addToCollection(id, 'word:act').added, false);
  assert.equal(s.removeFromCollection(id, 'word:act'), true);
  assert.ok(s.getRecord('word:act'));
  s.addToCollection(id, 'word:act'); assert.equal(s.deleteCollection(id), true);
  assert.ok(s.getRecord('word:act')); assert.equal(s.state.collections.length, 0);
});

test('legacy practice is integrated with SRS while collection practice does not change scheduling', () => {
  resetClock(); const s = makeStore(); s.recordLegacyPractice('word:act', true);
  assert.equal(s.getRecord('word:act').successfulReviews, 1);
  const before = { ...s.getRecord('word:act') };
  s.recordCollectionPractice('word:act', false, 'collection-1');
  assert.deepEqual(s.getRecord('word:act'), before);
  assert.ok(s.state.events.some(e => e.type === 'collection-practice' && e.successful === false));
});

test('version-zero state receives defaults and future schemas are rejected', () => {
  const migrated = L.normalizeState({ records: {}, settings: { dailyGoal: 200 } });
  assert.equal(migrated.schemaVersion, 1); assert.equal(migrated.settings.dailyGoal, 100);
  assert.throws(() => L.normalizeState({ schemaVersion: 99 }), /newer/);
});

test('corrupt stored JSON is preserved and learning falls back to in-memory mode', () => {
  resetClock(); const storage = new MemoryStorage({ 'rishe.learning': '{broken-json' }); const s = makeStore(storage);
  assert.equal(s.writable, false); assert.match(s.warning, /left untouched/);
  s.introduce('word:act');
  assert.equal(storage.getItem('rishe.learning'), '{broken-json');
  assert.equal(Object.keys(s.state.records).length, 1);
  assert.ok([...storage.data.keys()].some(k => k.startsWith('rishe.learning.recovery-')));
});

test('storage read/write errors produce warnings without throwing', () => {
  resetClock(); const storage = new MemoryStorage(); storage.failWrites = true; const s = makeStore(storage);
  s.introduce('word:act'); assert.equal(s.writable, false); assert.match(s.warning, /could not be saved/);
  const unreadable = new MemoryStorage(); unreadable.failReads = true; const s2 = makeStore(unreadable);
  assert.match(s2.warning, /could not be read/); assert.doesNotThrow(() => s2.introduce('word:act'));
});

test('import validates shape, filters unknown word IDs, and export survives round-trip', () => {
  resetClock(); const source = makeStore(); source.introduce('word:act');
  const collectionId = source.createCollection('Words'); source.addToCollection(collectionId, 'word:act'); source.addToCollection(collectionId, 'word:missing');
  source.recordCollectionPractice('word:act', true, collectionId);
  source.recordSessionCompleted({ mode: 'collection', collectionCards: 1 });
  const payload = source.exportData({ savedWords: ['act'] });
  const target = makeStore();
  const result = target.importData(payload, 'replace', new Set(['word:act']));
  assert.equal(result.records, 1); assert.deepEqual(target.state.collections[0].wordIds, ['word:act']);
  assert.ok(result.warnings.some(w => w.includes('collection word reference')));
  assert.ok(target.state.events.some(e => e.type === 'session-completed'));
  assert.ok(target.state.events.some(e => e.type === 'collection-practice'));
  assert.throws(() => target.importData({ app: 'Other', exportSchemaVersion: 1, learning: {} }), /supported/);
});
