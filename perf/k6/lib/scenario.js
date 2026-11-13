// load / stress / spike で共有する「混合シナリオ」の 1 イテレーション。
import { check, sleep } from 'k6';
import { POSTS, USERS, RUN_TAG, api, handleOf, okStatus, randInt, token, userIndex } from './config.js';

const SEARCH_TERMS = ['perf_user_1', 'perf_user_12', 'Perf User', 'user_99', 'perf', 'zzz_none'];

// VU ごとの状態(タイムラインで見た投稿 id など)
const state = { topId: 0, seenIds: [] };

function timeline(tok) {
  const tab = Math.random() < 0.6 ? 'following' : 'all';
  let path = `/api/timeline?tab=${tab}`;
  // カーソルで 1〜3 ページ読む(無限スクロール相当)
  for (let page = 0, max = randInt(1, 3); page < max; page++) {
    const res = api('GET', path, tok, 'timeline');
    if (!check(res, { 'timeline 200': (r) => r.status === 200 })) return;
    const body = res.json();
    if (body.items.length > 0) {
      if (page === 0) state.topId = Math.max(state.topId, body.items[0].id);
      state.seenIds = body.items.map((p) => p.id);
    }
    if (!body.nextCursor) return;
    path = `/api/timeline?tab=${tab}&cursor=${encodeURIComponent(body.nextCursor)}`;
    sleep(0.5);
  }
}

function poll(tok) {
  if (state.topId === 0) {
    const first = api('GET', '/api/timeline?tab=all&limit=1', tok, 'timeline');
    if (first.status === 200 && first.json('items').length > 0) state.topId = first.json('items.0.id');
  }
  const res = api('GET', `/api/timeline/new?tab=following&sinceId=${state.topId}`, tok, 'timeline_new');
  check(res, { 'timeline/new 200': (r) => r.status === 200 });
}

function pickSeenId() {
  return state.seenIds.length > 0 ? state.seenIds[randInt(0, state.seenIds.length - 1)] : randInt(1, POSTS);
}

function postDetail(tok) {
  const id = pickSeenId();
  check(api('GET', `/api/posts/${id}`, tok, 'post_detail'), { 'post 200': (r) => r.status === 200 });
  check(api('GET', `/api/posts/${id}/comments`, tok, 'comments'), { 'comments 200': (r) => r.status === 200 });
}

function search(tok) {
  const q = encodeURIComponent(SEARCH_TERMS[randInt(0, SEARCH_TERMS.length - 1)]);
  check(api('GET', `/api/search/users?q=${q}`, tok, 'search'), { 'search 200': (r) => r.status === 200 });
}

function profile(tok) {
  const handle = handleOf(randInt(1, USERS));
  check(api('GET', `/api/users/${handle}`, tok, 'profile'), { 'profile 200': (r) => r.status === 200 });
  const sub = ['posts', 'followers', 'following'][randInt(0, 2)];
  check(api('GET', `/api/users/${handle}/${sub}`, tok, 'user_list'), { [`${sub} 200`]: (r) => r.status === 200 });
}

// 書き込み。いいね・フォローは付けて外して差し引き 0 にする(クリーンアップ不要にする)
function write(tok, me) {
  switch (randInt(0, 3)) {
    case 0: {
      const res = api('POST', '/api/posts', tok, 'write', { body: `${RUN_TAG} k6 post ${Date.now()}` });
      check(res, { 'post create 2xx': okStatus });
      break;
    }
    case 1: {
      const id = pickSeenId();
      // すでにいいね済みの投稿なら触らない(外してしまうとシードが変わる)
      const liked = api('GET', `/api/posts/${id}`, tok, 'post_detail');
      if (liked.status !== 200 || liked.json('likedByMe')) return;
      check(api('PUT', `/api/posts/${id}/like`, tok, 'write'), { 'like 2xx': okStatus });
      check(api('DELETE', `/api/posts/${id}/like`, tok, 'write'), { 'unlike 2xx': okStatus });
      break;
    }
    case 2: {
      const id = pickSeenId();
      check(api('POST', `/api/posts/${id}/comments`, tok, 'write', { body: `${RUN_TAG} k6 comment` }), {
        'comment 2xx': okStatus,
      });
      break;
    }
    default: {
      // 自分以外をフォローして、すぐ解除する。すでにフォロー済みなら触らない
      let target = randInt(1, USERS);
      if (target === me) target = (target % USERS) + 1;
      const handle = handleOf(target);
      const profileRes = api('GET', `/api/users/${handle}`, tok, 'profile');
      if (profileRes.status !== 200 || profileRes.json('followedByMe')) return;
      check(api('PUT', `/api/users/${handle}/follow`, tok, 'write'), { 'follow 2xx': okStatus });
      check(api('DELETE', `/api/users/${handle}/follow`, tok, 'write'), { 'unfollow 2xx': okStatus });
    }
  }
}

// [重み, 関数]。タイムライン 40 / ポーリング 20 / 詳細 15 / 検索 10 / プロフィール 8 / 書き込み 7
const ACTIONS = [
  [40, timeline],
  [20, poll],
  [15, postDetail],
  [10, search],
  [8, profile],
  [7, write],
];
const TOTAL = ACTIONS.reduce((s, [w]) => s + w, 0);

export function mixedIteration(vu) {
  const tok = token(vu);
  const me = userIndex(vu);
  let r = Math.random() * TOTAL;
  for (const [weight, fn] of ACTIONS) {
    if ((r -= weight) < 0) {
      fn(tok, me);
      break;
    }
  }
  sleep(1 + Math.random() * 2); // 利用者の操作間隔(think time)
}
