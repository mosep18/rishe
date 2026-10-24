/* Rishe 1.6 local-first learning engine. No DOM dependency; CommonJS-compatible for tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RisheLearning = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'rishe.learning';
  const MAX_EVENTS = 20000;
  const MAX_INTERVAL_DAYS = 180;
  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;
  const RATINGS = Object.freeze(['again', 'hard', 'good', 'easy']);
  const STATES = Object.freeze(['new', 'learning', 'review', 'relearning']);
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const norm = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
  const safeSlug = value => norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'untitled';

  // Existing records do not have immutable IDs. Combine the normalized headword with its
  // family base (not an array index) to distinguish same-spelling records across families.
  function wordId(word, familyBase = '') {
    const w = typeof word === 'string' ? word : word?.w;
    if (!norm(w)) return '';
    return `word:${norm(w)}|family:${norm(familyBase)}`;
  }

  function localDay(timestamp = Date.now()) {
    const d = new Date(timestamp);
    if (!Number.isFinite(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function emptyState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: Date.now(),
      records: {},
      events: [],
      collections: [],
      settings: { dailyGoal: 10 }
    };
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Learning data must be an object.');
    const version = Number(raw.schemaVersion || 0);
    if (version > SCHEMA_VERSION) throw new Error(`Learning data schema ${version} is newer than this app supports.`);
    if (version < 0 || !Number.isFinite(version)) throw new Error('Learning data has an invalid schema version.');
    const state = emptyState();
    if (raw.records && typeof raw.records === 'object' && !Array.isArray(raw.records)) {
      state.records = {};
      for (const [id, record] of Object.entries(raw.records)) {
        if (!id || ['__proto__', 'constructor', 'prototype'].includes(id)) continue;
        state.records[id] = record;
      }
    }
    if (Array.isArray(raw.events)) state.events = raw.events.filter(e => e && typeof e === 'object' && Number.isFinite(Number(e.at)));
    if (Array.isArray(raw.collections)) state.collections = raw.collections.filter(c => c && typeof c === 'object');
    if (raw.settings && typeof raw.settings === 'object') {
      const goal = Number(raw.settings.dailyGoal);
      state.settings.dailyGoal = Number.isFinite(goal) ? clamp(Math.round(goal), 1, 100) : 10;
    }
    state.updatedAt = Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now();
    state.schemaVersion = SCHEMA_VERSION;
    // Normalize partial records without pretending they have already been reviewed.
    for (const [id, source] of Object.entries(state.records)) {
      if (!source || typeof source !== 'object') { delete state.records[id]; continue; }
      const successes = Math.max(0, Math.floor(Number(source.successfulReviews) || 0));
      const failures = Math.max(0, Math.floor(Number(source.failedReviews) || 0));
      const validState = STATES.includes(source.state) && source.state !== 'new' ? source.state : 'learning';
      state.records[id] = {
        id: String(source.id || id),
        state: validState,
        firstStudiedAt: Number.isFinite(Number(source.firstStudiedAt)) ? Number(source.firstStudiedAt) : Date.now(),
        lastReviewedAt: source.lastReviewedAt == null ? null : (Number.isFinite(Number(source.lastReviewedAt)) ? Number(source.lastReviewedAt) : null),
        nextReviewAt: Number.isFinite(Number(source.nextReviewAt)) ? Number(source.nextReviewAt) : Date.now(),
        successfulReviews: successes,
        failedReviews: failures,
        consecutiveSuccesses: Math.max(0, Math.floor(Number(source.consecutiveSuccesses) || 0)),
        intervalDays: clamp(Number(source.intervalDays) || 0, 0, MAX_INTERVAL_DAYS),
        introducedDay: String(source.introducedDay || localDay(Number(source.firstStudiedAt) || Date.now()))
      };
    }
    state.events = state.events.slice(-MAX_EVENTS);
    state.collections = state.collections.map((c, index) => ({
      id: String(c.id || `collection-migrated-${index + 1}-${safeSlug(c.name)}`),
      name: String(c.name || 'Untitled collection').trim().slice(0, 80) || 'Untitled collection',
      description: String(c.description || '').trim().slice(0, 300),
      wordIds: Array.isArray(c.wordIds) ? [...new Set(c.wordIds.map(String))] : [],
      createdAt: Number.isFinite(Number(c.createdAt)) ? Number(c.createdAt) : Date.now(),
      updatedAt: Number.isFinite(Number(c.updatedAt)) ? Number(c.updatedAt) : Date.now()
    }));
    return state;
  }

  function initialRecord(id, at = Date.now()) {
    return {
      id: String(id), state: 'learning', firstStudiedAt: at, lastReviewedAt: null,
      nextReviewAt: at + 10 * MINUTE, successfulReviews: 0, failedReviews: 0,
      consecutiveSuccesses: 0, intervalDays: 10 / (24 * 60), introducedDay: localDay(at)
    };
  }

  // A lightweight, deterministic scheduler inspired by common SM-2/Leitner principles,
  // not an implementation of official SM-2. All intervals use elapsed milliseconds.
  function schedule(record, rating, at = Date.now()) {
    if (!record || !STATES.includes(record.state)) throw new Error('A valid learning record is required.');
    if (!RATINGS.includes(rating)) throw new Error(`Unknown recall rating: ${rating}`);
    if (!Number.isFinite(at) || at < 0) throw new Error('Review timestamp must be a non-negative number.');
    const next = { ...record, lastReviewedAt: at };
    if (rating === 'again') {
      next.failedReviews = (Number(next.failedReviews) || 0) + 1;
      next.consecutiveSuccesses = 0;
      next.state = ['review', 'relearning'].includes(record.state) ? 'relearning' : 'learning';
      next.intervalDays = 15 / (24 * 60); // 15 minutes
      next.nextReviewAt = at + 15 * MINUTE;
      return next;
    }

    next.successfulReviews = (Number(next.successfulReviews) || 0) + 1;
    next.consecutiveSuccesses = (Number(next.consecutiveSuccesses) || 0) + 1;
    const priorInterval = Math.max(0, Number(record.intervalDays) || 0);
    let interval;
    if (rating === 'hard') {
      interval = clamp(priorInterval < 1 ? 1 : priorInterval * 1.2, 1, MAX_INTERVAL_DAYS);
      next.state = next.consecutiveSuccesses >= 2 ? 'review' : (record.state === 'relearning' ? 'relearning' : 'learning');
      if (next.state === 'review') interval = Math.max(2, interval);
    } else if (rating === 'good') {
      interval = record.state === 'review' ? Math.max(3, priorInterval * 2) : (next.consecutiveSuccesses >= 2 ? Math.max(3, priorInterval * 2) : 1);
      next.state = record.state === 'review' || next.consecutiveSuccesses >= 2 ? 'review' : (record.state === 'relearning' ? 'relearning' : 'learning');
    } else { // Easy
      interval = priorInterval < 1 ? 3 : Math.max(3, priorInterval * 2.5);
      next.state = 'review';
    }
    next.intervalDays = clamp(interval, 1 / 1440, MAX_INTERVAL_DAYS);
    next.nextReviewAt = at + next.intervalDays * DAY;
    return next;
  }

  function createStore(storage, options = {}) {
    const key = options.key || STORAGE_KEY;
    const now = options.now || (() => Date.now());
    let state = emptyState();
    let warning = '';
    let writable = true;
    let rawBeforeFailure = null;
    let collectionCounter = 0;

    try {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
        warning = 'Browser storage is unavailable. Learning changes will remain only in memory for this session.';
        writable = false;
      } else {
        const raw = storage.getItem(key);
        rawBeforeFailure = raw;
        if (raw != null) {
          try { state = normalizeState(JSON.parse(raw)); }
          catch (error) {
            warning = `Saved learning data could not be safely loaded: ${error.message} Existing data has been left untouched; export current session data before reloading.`;
            writable = false;
            state = emptyState();
            try { storage.setItem(`${key}.recovery-${now()}`, raw); } catch { /* Keep original untouched regardless. */ }
          }
        }
      }
    } catch (error) {
      warning = `Browser storage could not be read (${error.message}). Learning changes may not persist.`;
      writable = false;
    }

    const commit = () => {
      state.updatedAt = now();
      if (!writable) return false;
      try { storage.setItem(key, JSON.stringify(state)); warning = ''; return true; }
      catch (error) {
        warning = `Learning data could not be saved (${error.message}). Free device storage or export your learning data. Changes remain in memory until this page closes.`;
        writable = false;
        return false;
      }
    };
    const event = (type, fields = {}, at = now()) => ({ type, at, day: localDay(at), ...fields });
    const findRecord = id => state.records[String(id)] || null;

    return {
      get state() { return state; },
      get warning() { return warning; },
      get writable() { return writable; },
      save() { return commit(); },
      getRecord(id) { return findRecord(id); },
      isIntroduced(id) { return Boolean(findRecord(id)); },
      introduce(id, metadata = {}) {
        id = String(id || '');
        if (!id) throw new Error('A stable word ID is required.');
        if (findRecord(id)) return { record: findRecord(id), created: false, saved: true };
        const at = now();
        state.records[id] = initialRecord(id, at);
        state.events.push(event('introduced', { wordId: id, source: metadata.source || 'study' }, at));
        state.events = state.events.slice(-MAX_EVENTS);
        const saved = commit();
        return { record: state.records[id], created: true, saved };
      },
      rate(id, rating, metadata = {}) {
        id = String(id || '');
        if (!id) throw new Error('A stable word ID is required.');
        if (!RATINGS.includes(rating)) throw new Error(`Unknown recall rating: ${rating}`);
        if (!findRecord(id)) this.introduce(id, { source: metadata.source || 'first-review' });
        const at = now();
        state.records[id] = schedule(state.records[id], rating, at);
        state.events.push(event('review', { wordId: id, rating, successful: rating !== 'again', source: metadata.source || 'scheduled-review' }, at));
        state.events = state.events.slice(-MAX_EVENTS);
        const saved = commit();
        return { record: state.records[id], saved };
      },
      setDailyGoal(value) {
        const goal = Number(value);
        if (!Number.isFinite(goal)) throw new Error('Daily goal must be a number.');
        state.settings.dailyGoal = clamp(Math.round(goal), 1, 100);
        commit();
        return state.settings.dailyGoal;
      },
      createCollection(name, description = '') {
        name = String(name || '').trim().slice(0, 80);
        description = String(description || '').trim().slice(0, 300);
        if (!name) throw new Error('Collection name cannot be empty.');
        if (state.collections.some(c => c.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('A collection with that name already exists.');
        const at = now();
        collectionCounter += 1;
        const id = `collection-${at.toString(36)}-${collectionCounter.toString(36)}`;
        state.collections.push({ id, name, description, wordIds: [], createdAt: at, updatedAt: at });
        commit();
        return id;
      },
      updateCollection(id, changes = {}) {
        const c = state.collections.find(x => x.id === String(id));
        if (!c) throw new Error('Collection not found.');
        if (Object.prototype.hasOwnProperty.call(changes, 'name')) {
          const name = String(changes.name || '').trim().slice(0, 80);
          if (!name) throw new Error('Collection name cannot be empty.');
          if (state.collections.some(x => x.id !== c.id && x.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('A collection with that name already exists.');
          c.name = name;
        }
        if (Object.prototype.hasOwnProperty.call(changes, 'description')) c.description = String(changes.description || '').trim().slice(0, 300);
        c.updatedAt = now();
        commit();
        return c;
      },
      deleteCollection(id) {
        const before = state.collections.length;
        state.collections = state.collections.filter(c => c.id !== String(id));
        if (state.collections.length !== before) commit();
        return before !== state.collections.length;
      },
      addToCollection(collectionId, id) {
        const c = state.collections.find(x => x.id === String(collectionId));
        if (!c) throw new Error('Collection not found.');
        id = String(id || '');
        if (!id) throw new Error('A stable word ID is required.');
        const existed = c.wordIds.includes(id);
        if (!existed) { c.wordIds.push(id); c.updatedAt = now(); commit(); }
        return { added: !existed, count: c.wordIds.length };
      },
      removeFromCollection(collectionId, id) {
        const c = state.collections.find(x => x.id === String(collectionId));
        if (!c) return false;
        const before = c.wordIds.length;
        c.wordIds = c.wordIds.filter(x => x !== String(id));
        if (before !== c.wordIds.length) { c.updatedAt = now(); commit(); }
        return before !== c.wordIds.length;
      },
      recordLegacyPractice(id, ok) {
        id = String(id || '');
        if (!id) return false;
        if (!findRecord(id)) this.introduce(id, { source: 'legacy-practice' });
        this.rate(id, ok ? 'good' : 'again', { source: 'legacy-practice' });
        return true;
      },
      recordCollectionPractice(id, remembered, collectionId) {
        id = String(id || '');
        if (!id) return false;
        const at = now();
        state.events.push(event('collection-practice', { wordId: id, successful: Boolean(remembered), collectionId: String(collectionId || '') }, at));
        state.events = state.events.slice(-MAX_EVENTS);
        return commit();
      },
      recordSessionCompleted(summary = {}) {
        const at = now();
        state.events.push(event('session-completed', {
          mode: String(summary.mode || 'mixed'),
          reviewCards: Math.max(0, Math.floor(Number(summary.reviewCards) || 0)),
          successfulReviews: Math.max(0, Math.floor(Number(summary.successfulReviews) || 0)),
          failedReviews: Math.max(0, Math.floor(Number(summary.failedReviews) || 0)),
          newWords: Math.max(0, Math.floor(Number(summary.newWords) || 0)),
          collectionCards: Math.max(0, Math.floor(Number(summary.collectionCards) || 0))
        }, at));
        state.events = state.events.slice(-MAX_EVENTS);
        return commit();
      },
      dueRecords(at = now(), filterIds = null) {
        const allowed = filterIds ? new Set(filterIds.map(String)) : null;
        return Object.values(state.records)
          .filter(r => Number.isFinite(r.nextReviewAt) && r.nextReviewAt <= at && (!allowed || allowed.has(r.id)))
          .sort((a, b) => {
            const priority = r => r.state === 'relearning' ? 0 : r.state === 'learning' ? 1 : 2;
            return priority(a) - priority(b) || a.nextReviewAt - b.nextReviewAt || a.id.localeCompare(b.id);
          });
      },
      activityForDay(day = localDay(now()), validWordIds = null) {
        const allowed = validWordIds ? new Set(validWordIds) : null;
        const isValid = e => !allowed || (e.wordId && allowed.has(e.wordId));
        const introductions = state.events.filter(e => e.type === 'introduced' && e.day === day && isValid(e));
        const reviews = state.events.filter(e => e.type === 'review' && e.day === day && isValid(e));
        return { day, newWords: new Set(introductions.map(e => e.wordId)).size, reviews: reviews.length,
          successfulReviews: reviews.filter(e => e.successful).length,
          failedReviews: reviews.filter(e => !e.successful).length };
      },
      exportData(extra = {}) {
        return { app: 'Rishe', exportSchemaVersion: 1, exportedAt: now(), learning: JSON.parse(JSON.stringify(state)), ...extra };
      },
      // Replaces or merges only validated learning-domain data. Callers must validate word refs first.
      importData(incoming, mode = 'merge', validWordIds = null) {
        if (!incoming || incoming.app !== 'Rishe' || Number(incoming.exportSchemaVersion) !== 1 || !incoming.learning) throw new Error('This is not a supported Rishe learning-data export.');
        const rawRecordCount = incoming.learning.records && typeof incoming.learning.records === 'object' ? Object.keys(incoming.learning.records).length : 0;
        const rawEventCount = Array.isArray(incoming.learning.events) ? incoming.learning.events.length : 0;
        const rawCollectionMemberships = Array.isArray(incoming.learning.collections) ? incoming.learning.collections.reduce((n, c) => n + (Array.isArray(c?.wordIds) ? c.wordIds.length : 0), 0) : 0;
        const imported = normalizeState(incoming.learning);
        const allowed = validWordIds ? new Set(validWordIds) : null;
        for (const [id, record] of Object.entries(imported.records)) {
          if (!record || record.id !== id || (allowed && !allowed.has(id))) delete imported.records[id];
        }
        const filteredRecordCount = Math.max(0, rawRecordCount - Object.keys(imported.records).length);
        const originalNormalizedEventCount = imported.events.length;
        imported.events = imported.events.filter(e => {
          if (e.type === 'session-completed') return typeof e.mode === 'string' && Number.isFinite(Number(e.reviewCards)) && Number(e.reviewCards) >= 0;
          if (!e.wordId || (allowed && !allowed.has(e.wordId))) return false;
          if (e.type === 'introduced') return true;
          if (e.type === 'review') return RATINGS.includes(e.rating) && typeof e.successful === 'boolean';
          if (e.type === 'collection-practice') return typeof e.successful === 'boolean';
          return false;
        });
        const filteredEventCount = Math.max(0, originalNormalizedEventCount - imported.events.length);
        imported.collections.forEach(c => { c.wordIds = c.wordIds.filter(id => !allowed || allowed.has(id)); });
        const keptCollectionMemberships = imported.collections.reduce((n, c) => n + c.wordIds.length, 0);
        const filteredMembershipCount = Math.max(0, rawCollectionMemberships - keptCollectionMemberships);
        if (mode === 'replace') {
          state = imported;
        } else if (mode === 'merge') {
          for (const [id, rec] of Object.entries(imported.records)) if (!state.records[id]) state.records[id] = rec;
          const eventKey = e => JSON.stringify([e.type, e.wordId || '', e.at, e.rating || '', e.source || '', e.mode || '', e.collectionId || '', e.reviewCards || 0, e.successfulReviews || 0, e.failedReviews || 0, e.newWords || 0, e.collectionCards || 0]);
          const existingEventKeys = new Set(state.events.map(eventKey));
          imported.events.forEach(e => { const k = eventKey(e); if (!existingEventKeys.has(k)) { state.events.push(e); existingEventKeys.add(k); } });
          const known = new Map(state.collections.map(c => [c.id, c]));
          imported.collections.forEach(c => {
            const local = known.get(c.id);
            if (!local) state.collections.push(c);
            else { local.wordIds = [...new Set([...local.wordIds, ...c.wordIds])]; local.updatedAt = Math.max(local.updatedAt || 0, c.updatedAt || 0); }
          });
          state.settings.dailyGoal = imported.settings.dailyGoal || state.settings.dailyGoal;
          state.events = state.events.slice(-MAX_EVENTS);
        } else throw new Error('Import mode must be "merge" or "replace".');
        const saved = commit();
        const warnings = [];
        if (filteredRecordCount) warnings.push(`${filteredRecordCount} invalid or unavailable learning record(s) skipped`);
        if (filteredEventCount || Math.max(0, rawEventCount - originalNormalizedEventCount)) warnings.push(`${filteredEventCount + Math.max(0, rawEventCount - originalNormalizedEventCount)} invalid or unavailable event(s) skipped`);
        if (filteredMembershipCount) warnings.push(`${filteredMembershipCount} unavailable collection word reference(s) skipped`);
        return { saved, records: Object.keys(state.records).length, collections: state.collections.length, warnings };
      }
    };
  }

  function calculatePlan(words, store, familyBaseFor, at = Date.now()) {
    const today = localDay(at);
    const valid = words.filter(w => w && norm(w.w) && String(w.fa || '').trim());
    const validIds = new Set(valid.map(w => wordId(w, familyBaseFor(w))).filter(Boolean));
    const activity = store.activityForDay(today, validIds);
    const allDue = store.dueRecords(at, [...validIds]);
    const goal = store.state.settings.dailyGoal || 10;
    const remaining = Math.max(0, goal - activity.newWords);
    // Heavy review days deliberately defer new-word introductions.
    const adjustedLimit = allDue.length >= 20 ? 0 : allDue.length >= 10 ? Math.ceil(remaining / 2) : remaining;
    const candidateIds = new Set();
    const candidates = valid.filter(w => {
      const id = wordId(w, familyBaseFor(w));
      if (!id || candidateIds.has(id) || store.isIntroduced(id)) return false;
      candidateIds.add(id); return true;
    });
    const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
    candidates.sort((a, b) => hash(`${today}|${wordId(a, familyBaseFor(a))}`) - hash(`${today}|${wordId(b, familyBaseFor(b))}`));
    const selectedNew = candidates.slice(0, Math.min(adjustedLimit, candidates.length));
    return {
      day: today,
      reviewIds: allDue.map(r => r.id),
      dueCount: allDue.length,
      configuredGoal: goal,
      newIntroducedToday: activity.newWords,
      newGoalRemaining: remaining,
      newGoalPlanned: selectedNew.length,
      newWords: selectedNew,
      deferralReason: allDue.length >= 20 ? 'A heavy review queue is taking priority today.' : allDue.length >= 10 ? 'The new-word target is reduced while reviews are waiting.' : ''
    };
  }

  function statistics(words, store, familyBaseFor, at = Date.now()) {
    const state = store.state;
    const records = Object.values(state.records);
    const validIds = new Set(words.map(w => wordId(w, familyBaseFor(w))));
    const reviews = state.events.filter(e => e.type === 'review' && validIds.has(e.wordId));
    const since = at - 7 * DAY;
    const recentReviews = reviews.filter(e => Number(e.at) >= since && Number(e.at) <= at);
    const allSuccessful = recentReviews.filter(e => e.successful).length;
    const today = localDay(at);
    const todayStats = store.activityForDay(today, validIds);
    const stateCount = name => records.filter(r => validIds.has(r.id) && r.state === name).length;
    return {
      introduced: records.filter(r => validIds.has(r.id)).length,
      reviewsCompleted: reviews.length,
      reviewsDue: store.dueRecords(at).filter(r => validIds.has(r.id)).length,
      learning: stateCount('learning'), established: stateCount('review'), relearning: stateCount('relearning'),
      newToday: todayStats.newWords, reviewsToday: todayStats.reviews,
      successRate7d: recentReviews.length ? Math.round(allSuccessful / recentReviews.length * 100) : null,
      reviews7d: recentReviews.length,
      reviewSessionsCompleted: state.events.filter(e => e.type === 'session-completed' && !['new', 'collection'].includes(e.mode) && validIds.size && e.reviewCards > 0).length,
      activity: Array.from({ length: 7 }, (_, i) => {
        const d = new Date(at); d.setDate(d.getDate() - (6 - i)); const day = localDay(d.getTime());
        const events = state.events.filter(e => e.day === day);
        return { day, newWords: new Set(events.filter(e => e.type === 'introduced').map(e => e.wordId)).size,
          reviews: events.filter(e => e.type === 'review').length };
      })
    };
  }

  return { SCHEMA_VERSION, STORAGE_KEY, MAX_INTERVAL_DAYS, RATINGS, STATES, DAY, MINUTE, wordId, norm, localDay, initialRecord, schedule, normalizeState, createStore, calculatePlan, statistics };
});
