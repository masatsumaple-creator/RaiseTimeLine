// ログイン(BCrypt)・リフレッシュの負荷を単独で測る。BCrypt は CPU を使うので、混合シナリオとは分けて見る。
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { BASE_URL, PASSWORD, VUS, emailOf, guard, thresholds, userIndex } from './lib/config.js';

export const options = {
  scenarios: {
    auth: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: Math.min(VUS, 10) },
        { duration: '2m', target: Math.min(VUS, 10) },
        { duration: '15s', target: 0 },
      ],
    },
  },
  thresholds: thresholds(['login', 'refresh']),
};

export function setup() {
  guard();
}

export default function () {
  const n = userIndex(exec.vu.idInTest);
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email: emailOf(n), password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'login' },
  });
  check(res, { 'login 200': (r) => r.status === 200 });
  // Cookie(リフレッシュトークン)でアクセストークンを取り直す
  const refreshed = http.post(`${BASE_URL}/api/auth/refresh`, null, { tags: { endpoint: 'refresh' } });
  check(refreshed, { 'refresh 200': (r) => r.status === 200 });
  sleep(1);
}
