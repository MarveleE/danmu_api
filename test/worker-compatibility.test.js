import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { mainJsContent } from '../danmu_api/ui/js/main.js';
import worker from '../danmu_api/worker.js';
import { getSourceByKey } from '../danmu_api/sources/registry.js';
import { buildSearchAnimeUrl } from '../danmu_api/apis/dandan-api.js';

const env = { TOKEN: 'test-reader', ADMIN_TOKEN: 'test-administrator', LOG_LEVEL: 'error' };
const call = (path, options = {}, bindings = env) => worker.fetch(
  new Request(`https://danmu.example${path}`, options), bindings, { waitUntil() {} },
);

test('episode search preserves provider aliases and the selected episode URL', async (t) => {
  const renren = getSourceByKey('renren');
  t.mock.method(renren, 'search', async () => [{
    provider: 'renren', mediaId: '57603', title: '足球教练 第四季',
    aliases: ['Ted Lasso Season 4'], type: '电视剧', year: '2026',
    imageUrl: '', episodeCount: 2,
  }]);
  t.mock.method(renren, 'getEpisodes', async () => [
    { episodeIndex: 1, episodeId: '57603-391567', provider: 'renren', title: '第01集' },
    { episodeIndex: 2, episodeId: '57603-391568', provider: 'renren', title: '第02集' },
  ]);
  const response = await call(`/${env.TOKEN}/api/v2/search/episodes?anime=Ted%20Lasso&episode=2`, {}, {
    ...env, SOURCE_ORDER: 'renren', PLATFORM_ORDER: 'renren',
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.animes.length, 1);
  assert.deepEqual(body.animes[0].aliases, ['Ted Lasso Season 4']);
  assert.equal(body.animes[0].animeTitle, '足球教练 第四季(2026)【电视剧】from renren');
  assert.equal(body.animes[0].episodes[0].url, '57603-391568');
});

test('cloud search keeps the aliases needed to match an English title', async (t) => {
  const renren = getSourceByKey('renren');
  const candidate = { mediaId: '57603', title: '足球教练 第四季', type: '电视剧', year: '2026', imageUrl: '' };
  t.mock.method(renren, 'searchAppContent', async () => [{ ...candidate, aliases: [] }]);
  t.mock.method(renren, 'performWinSearch', async () => [{ ...candidate, aliases: ['Ted Lasso Season 4'] }]);
  t.mock.method(renren, 'getEpisodes', async () => [
    { episodeIndex: 2, episodeId: '57603-391568', provider: 'renren', title: '第02集' },
  ]);
  const results = await renren._searchCloud('Ted Lasso');
  const animes = [];
  await renren.handleAnimes(results, 'Ted Lasso', animes, new Map());
  assert.equal(animes.length, 1);
  assert.deepEqual(animes[0].aliases, ['Ted Lasso Season 4']);
  assert.equal(animes[0].animeTitle, '足球教练 第四季(2026)【电视剧】from renren');
});

test('cloud search falls back to TV when Windows returns no candidates', async (t) => {
  const renren = getSourceByKey('renren');
  t.mock.method(renren, 'performWinSearch', async () => []);
  t.mock.method(renren, 'searchAppContent', async () => [{ title: '足球教练 第四季' }]);
  const results = await renren._searchCloud('足球教练');
  assert.equal(results[0].title, '足球教练 第四季');
});

test('preserves specials season zero in the provider search URL', () => {
  const url = buildSearchAnimeUrl(new URL('https://danmu.example/api/v2/search/episodes'), 'Example', 0, 2);
  assert.equal(url.searchParams.get('season'), '0');
  assert.equal(url.searchParams.get('episode'), '2');
});

test('private-service mode accepts tokenless requests and still validates inputs', async () => {
  const response = await call('/api/v2/segmentcomment?format=json', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'renren', url: '', segment_start: 0, segment_end: 30 }),
  }, { ...env, AUTH_ENABLED: 'false' });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).errorMessage, 'Missing or invalid url parameter');
  const config = await call('/api/config', {}, { AUTH_ENABLED: 'false', LOG_LEVEL: 'error' });
  assert.equal(config.status, 200);
  assert.equal((await config.json()).authEnabled, false);
  const ui = await call('/', {}, { AUTH_ENABLED: 'false', LOG_LEVEL: 'error' });
  assert.equal(ui.status, 200);
  for (const [, script] of (await ui.text()).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script);
});

test('normal deployments continue to require the configured token', async () => {
  const response = await call('/api/v2/search/episodes?anime=Example');
  assert.equal(response.status, 401);
});

test('tokenless UI keeps the gateway mount when fetching data and administration', () => {
  const activated = [];
  const context = vm.createContext({ URL,
    globals: { authEnabled: false },
    localStorage: { getItem() { return null; } },
    document: {
      addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
      getElementById(id) { return { classList: { add() { activated.push(id); } } }; },
      body: { appendChild() {} }, createElement() { return { style: {}, appendChild() {} }; },
    },
    fetch() { return new Promise(() => {}); }, setTimeout() { return 0; }, addLog() {},
    window: { location: { pathname: '/gateway/admin-session/', origin: 'https://example.org' } },
  });
  vm.runInContext(mainJsContent, context);
  assert.equal(vm.runInContext("buildApiUrl('/api/config', true)", context), '/gateway/admin-session/api/config');
  assert.equal(vm.runInContext("buildApiUrl('/api/v2/search/anime')", context), '/gateway/admin-session/api/v2/search/anime');
  vm.runInContext("switchSection('api')", context);
  assert.deepEqual(activated, ['api-section']);
});
