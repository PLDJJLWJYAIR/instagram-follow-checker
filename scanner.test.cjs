const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'content-v2.js'), 'utf8');

function exportHarness(initial, download) {
  const data = structuredClone(initial);
  const context = vm.createContext({
    Date, encodeURIComponent,
    importScripts() {},
    buildTextExport: require('./report.js').buildTextExport,
    chrome: {
      downloads: download ? { download } : undefined,
      runtime: { onMessage: { addListener() {} } },
      storage: { local: {
        get: async () => structuredClone(data),
        set: async (values) => Object.assign(data, structuredClone(values))
      } }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'background.js'), 'utf8'), context);
  return { data, run: () => vm.runInContext('exportLatestResult()', context) };
}

test('export without a completed snapshot reports why instead of silently doing nothing', async () => {
  const h = exportHarness({scanCheckpoint: {following: {users: ['a']}}}, () => assert.fail('no download expected'));
  const result = await h.run();
  assert.equal(result.ok, false);
  assert.match(result.error, /尚无已保存/);
  assert.equal(h.data.exportState.status, 'error');
});

test('background export starts save-as without any popup and persists feedback', async () => {
  let options;
  const h = exportHarness({latest: {at: '2026-09-16T12:34:56.789Z', profile: 'me', notFollowingBack: ['example']}}, async (value) => { options = value; return 42; });
  assert.equal((await h.run()).ok, true);
  assert.equal(options.saveAs, true);
  assert.match(decodeURIComponent(options.url), /@example/);
  assert.equal(h.data.exportState.downloadId, 42);
});

test('export reports unavailable downloads permission and cancelled saves', async () => {
  const initial = {latest: {at: '2026-09-16T12:34:56.789Z'}};
  const missing = exportHarness(initial);
  assert.match((await missing.run()).error, /下载权限/);
  const cancelled = exportHarness(initial, async () => { throw new Error('User cancelled'); });
  assert.equal((await cancelled.run()).ok, false);
  assert.match(cancelled.data.exportState.message, /User cancelled/);
});

function harness(initial = {}) {
  const data = structuredClone(initial);
  const delays = [];
  const context = vm.createContext({
    URL, Date, console,
    setTimeout: (fn, ms) => { delays.push(ms); queueMicrotask(fn); return 1; },
    location: { href: 'https://www.instagram.com/me/', origin: 'https://www.instagram.com' },
    chrome: {
      runtime: { onMessage: { addListener() {} } },
      storage: { local: {
        get: async () => structuredClone(data),
        set: async (values) => Object.assign(data, structuredClone(values)),
        remove: async (keys) => { for (const key of [keys].flat()) delete data[key]; }
      } }
    }
  });
  vm.runInContext(source, context);
  return { data, delays, run: (code) => vm.runInContext(code, context) };
}

test('search timeout stays unknown; delayed match stays mutual; explicit empty needs two queries', async () => {
  const h = harness();
  await h.run(`
    var input = { value: '' }, tick = 0, observerCallback, queries = {};
    isVisible = () => true;
    MutationObserver = class { constructor(cb) { observerCallback = cb; } observe() {} disconnect() {} };
    var dialog = { isConnected: true, querySelector: () => input, querySelectorAll(selector) {
      if (selector === 'a[href]') {
        tick++;
        if (input.value === 'mutual' && tick >= 10) return [{getAttribute: () => '/mutual/'}];
        return [];
      }
      if (selector === 'span, p, div' && input.value === 'absent') return [{textContent: 'No results found.'}];
      return [];
    }};
    openList = async () => ({ dialog }); closeDialog = async () => {};
    setInputValue = (field, value) => { field.value = value; tick = 0; if (value) { queries[value] = (queries[value] || 0) + 1; observerCallback(); } };
  `);
  const result = await h.run(`searchMembership('followers', ['slow', 'mutual', 'absent'])`);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { found: ['mutual'], absent: ['absent'], unknown: ['slow'] });
  assert.equal(h.run('queries.absent'), 2);
});

test('resumed scan reads new follows, ignores old follower seed, and excludes stale follows', async () => {
  const h = harness({ scanCheckpoint: { profile: 'me', updatedAt: new Date().toISOString(),
    following: { users: ['stale'], expected: 3 }, followers: { users: ['new'], expected: 1 } } });
  await h.run(`
    var calls = [];
    collectList = async (kind, options) => {
      calls.push({kind, seeds: options.seedUsers});
      const users = kind === 'following' ? ['stale', 'new', 'mutual'] : ['mutual'];
      await options.onCheckpoint(users, users.length);
      return { users, expected: users.length, complete: true };
    };
    searchMembership = async (kind, candidates) => kind === 'followers'
      ? { found: [], absent: candidates, unknown: [] }
      : { found: candidates.filter(u => u === 'new'), absent: ['stale'], unknown: [] };
  `);
  const result = await h.run('scanAll()');
  assert.deepEqual(Array.from(result.notFollowingBack), ['new']);
  assert.equal(h.run('calls.find(c => c.kind === "followers").seeds.length'), 0);
});

test('incomplete lists get bounded retries, keep checkpoint, and save partial results without popup', async () => {
  const h = harness();
  await h.run(`
    var calls = [];
    collectList = async (kind, options) => {
      calls.push(kind);
      const users = kind === 'following' ? ['new'] : ['mutual'];
      await options.onCheckpoint(users, 10);
      return { users, expected: 10, complete: false };
    };
    searchMembership = async (kind, candidates) => ({found: [], absent: [], unknown: candidates});
  `);
  await h.run('runAutomaticScan()');
  assert.equal(h.run('calls.length'), 4);
  assert.deepEqual(h.delays, [5000, 5000]);
  assert.equal(h.data.latest.partial, true);
  assert.deepEqual(h.data.latest.unresolved, ['new']);
  assert.deepEqual(h.data.latest.notFollowingBack, []);
  assert.ok(h.data.scanCheckpoint);
  assert.equal(h.data.scanState.status, 'complete');
});

test('reading does not stop at cached count before traversing the current list', async () => {
  const h = harness();
  await h.run(`
    var passes = 0, container = {scrollTop: 0, scrollHeight: 1000, clientHeight: 500};
    scrollContainer = () => container;
    setScrollTop = (el, top) => { el.scrollTop = top; };
    collectVisible = (_dialog, users) => { passes++; if (passes >= 3) users.add('new'); };
    var users = new Set(['old']);
  `);
  await h.run(`scanPass({}, users, 1, {direction: 1, initialWait: 0, maxSteps: 4, stepRatio: 0.8, delay: 0, stableLimit: 2, endWait: 0})`);
  assert.equal(h.run("users.has('new')"), true);
});

test('gaps of one to three finish without retries but preserve exact counts and history guard', async () => {
  for (const gap of [1, 2, 3]) {
    const h = harness();
    await h.run(`
      var calls = [];
      collectList = async (kind, options) => {
        calls.push(kind);
        const result = {users: ['mutual'], expected: ${1 + gap}, complete: false};
        await options.onCheckpoint(result.users, result.expected);
        return result;
      };
      searchMembership = async () => ({found: [], absent: [], unknown: []});
    `);
    await h.run('runAutomaticScan()');
    assert.equal(h.run('calls.length'), 2);
    assert.deepEqual(h.delays, []);
    assert.equal(h.data.latest.partial, false);
    assert.equal(h.data.latest.followingExpected, 1 + gap);
    assert.equal(h.data.latest.followersComplete, false);
    assert.equal(h.data.latest.hasPrevious, false);
    assert.equal(h.data.scanCheckpoint, undefined);
  }
});

test('one list collection contains only one traversal even outside tolerance', async () => {
  const h = harness();
  await h.run(`
    var passes = 0;
    openList = async () => ({dialog: {}, expected: 416});
    closeDialog = async () => {};
    scanPass = async (_dialog, users) => { passes++; users.add('only_one'); };
  `);
  await h.run("collectList('following')");
  assert.equal(h.run('passes'), 1);
  assert.equal(h.run("acceptableCount({users: [], expected: 2})"), false);
  assert.equal(h.run("acceptableCount({users: ['a'], expected: null})"), false);
  assert.equal(h.run("acceptableCount({users: ['a','b'], expected: 1})"), false);
});

test('TXT includes exact scan/export timestamps, counts, result groups and full lists', () => {
  const { buildTextExport } = require('./report.js');
  const report = buildTextExport({
    at: '2026-09-16T13:04:05.123Z', profile: 'me',
    following: ['one', 'two'], followingExpected: 3,
    followers: ['two'], followersExpected: 1,
    notFollowingBack: ['one'], unresolved: ['pending'],
    partial: true, countTolerance: 3, hasPrevious: false,
    warning: '缺口在容差内'
  }, new Date('2026-09-16T13:10:11.456Z'));
  assert.equal(report.filename, 'Instagram-me-2026-09-16T13-04-05-123Z.txt');
  assert.match(report.text, /2026-09-16T13:04:05\.123Z/);
  assert.match(report.text, /2026-09-16T13:10:11\.456Z/);
  assert.match(report.text, /实际读取 2 \/ 页面显示 3；差额 1/);
  assert.match(report.text, /待确认（不计入未互关）（1）\r\n@pending/);
  assert.match(report.text, /本次读取的关注账号（2）\r\n@one\r\n@two/);
  assert.match(report.text, /暂无可比较的历史快照/);
  assert.doesNotThrow(() => buildTextExport({at: 'invalid'}));
});
