// 疎通・シナリオ正当性の確認。1 VU で全エンドポイントを 1 周ずつ、30 秒間繰り返す。
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { api, guard, handleOf, okStatus, RUN_TAG, thresholds, token } from './lib/config.js';

export const options = {
  vus: 1,
  duration: '30s',
  // smoke は 1 件の失敗も許さない
  thresholds: {
    ...thresholds(['timeline', 'timeline_new', 'post_detail', 'comments', 'search', 'profile', 'user_list', 'write']),
    http_req_failed: ['rate==0'],
    checks: ['rate==1'],
  },
};

export function setup() {
  guard();
}

export default function () {
  const tok = token(exec.vu.idInTest);
  const timeline = api('GET', '/api/timeline?tab=all', tok, 'timeline');
  check(timeline, { 'timeline 200': (r) => r.status === 200, 'timeline has items': (r) => r.json('items').length > 0 });
  const first = timeline.json('items.0');
  check(api('GET', `/api/timeline/new?tab=following&sinceId=${first.id}`, tok, 'timeline_new'), {
    'new 200': (r) => r.status === 200,
  });
  check(api('GET', `/api/posts/${first.id}`, tok, 'post_detail'), { 'post 200': (r) => r.status === 200 });
  check(api('GET', `/api/posts/${first.id}/comments`, tok, 'comments'), { 'comments 200': (r) => r.status === 200 });
  check(api('GET', '/api/search/users?q=perf_user_1', tok, 'search'), { 'search 200': (r) => r.status === 200 });
  check(api('GET', `/api/users/${handleOf(2)}`, tok, 'profile'), { 'profile 200': (r) => r.status === 200 });
  for (const sub of ['posts', 'followers', 'following']) {
    check(api('GET', `/api/users/${handleOf(2)}/${sub}`, tok, 'user_list'), { [`${sub} 200`]: (r) => r.status === 200 });
  }
  check(api('POST', '/api/posts', tok, 'write', { body: `${RUN_TAG} smoke` }), { 'create 2xx': okStatus });
  sleep(1);
}
