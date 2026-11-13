// k6 共通設定・ヘルパ。環境変数(-e)で上書きできる。
import http from 'k6/http';
import { check, fail } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
// シードしたユーザー数・投稿数(seed.sql と揃える)
export const USERS = Number(__ENV.USERS || 1000);
export const POSTS = Number(__ENV.POSTS || 100000);
export const VUS = Number(__ENV.VUS || 20);
export const HOLD = __ENV.HOLD || '8m';
export const PASSWORD = __ENV.PERF_PASSWORD || 'PerfTest1234';
// テストが作るデータの目印。cleanup/run-data.sql がこの接頭辞で削除する
export const RUN_TAG = '[perf-run]';

// アクセストークン(15 分)を延命する前に更新する間隔
const REFRESH_AFTER_MS = 12 * 60 * 1000;

// 合格基準(p95, ms)。docs/21_ログ設計と閾値.md のスロー閾値に合わせる
const P95 = {
  login: 1000,
  refresh: 1000,
  timeline: 500,
  comments: 500,
  search: 500,
  user_list: 500,
  timeline_new: 300,
  post_detail: 300,
  profile: 300,
  write: 300,
};

/** 使うエンドポイントの p95 閾値と、エラー率の閾値を返す。 */
export function thresholds(endpoints, extra = {}) {
  const t = { http_req_failed: ['rate<0.01'], ...extra };
  for (const name of endpoints) {
    t[`http_req_duration{endpoint:${name}}`] = [`p(95)<${P95[name]}`];
  }
  return t;
}

export function userIndex(vu) {
  return ((vu - 1) % USERS) + 1;
}
export const handleOf = (n) => `perf_user_${n}`;
export const emailOf = (n) => `perf_user_${n}@perf.example.test`;
export const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

/** ログインしてアクセストークンを返す(失敗時は null)。 */
export function login(n) {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email: emailOf(n), password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'login' } },
  );
  const ok = check(res, { 'login 200': (r) => r.status === 200 });
  return ok ? res.json('accessToken') : null;
}

// VU ごとのセッション(モジュール変数は VU ごとに独立)
let session = null;

/** この VU のトークンを返す。初回はログイン、期限が近ければ Cookie でリフレッシュする。 */
export function token(vu) {
  const now = Date.now();
  if (session && now - session.at < REFRESH_AFTER_MS) return session.token;
  if (session) {
    const res = http.post(`${BASE_URL}/api/auth/refresh`, null, { tags: { endpoint: 'refresh' } });
    if (check(res, { 'refresh 200': (r) => r.status === 200 })) {
      session = { token: res.json('accessToken'), at: now };
      return session.token;
    }
  }
  const t = login(userIndex(vu));
  if (!t) fail('ログインに失敗しました(perf DB にシード済みか確認してください)');
  session = { token: t, at: now };
  return t;
}

/** 認証付きリクエスト。endpoint は結果の集計用タグ。 */
export function api(method, path, tok, endpoint, body) {
  return http.request(method, `${BASE_URL}${path}`, body === undefined ? null : JSON.stringify(body), {
    headers: authHeaders(tok),
    tags: { endpoint },
  });
}

export const okStatus = (r) => r.status >= 200 && r.status < 300;

/**
 * 実行前の安全確認。perf 用にシードされた環境(perf_user_1 でログインできる)でなければ中断する。
 * 開発 DB や本番には perf_user_1 が存在しないので、誤った向き先への実行を止められる。
 */
export function guard() {
  if (!login(1)) {
    fail(`${BASE_URL} に perf_user_1 でログインできません。perf DB をシードし、バックエンドをそれに向けて起動してください`);
  }
}
