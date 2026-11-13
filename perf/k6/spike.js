// 急増。少数の負荷から 10 秒で 100 VU に跳ね上げ、1 分維持してから戻し、回復するかを見る。
import exec from 'k6/execution';
import { guard } from './lib/config.js';
import { mixedIteration } from './lib/scenario.js';

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: 5 },
        { duration: '10s', target: 100 },
        { duration: '1m', target: 100 },
        { duration: '10s', target: 5 },
        { duration: '2m', target: 5 }, // 回復の確認
        { duration: '10s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  // 急増時は劣化して当然なので、閾値は緩め(エラー率のみ)
  thresholds: { http_req_failed: ['rate<0.05'] },
};

export function setup() {
  guard();
}

export default function () {
  mixedIteration(exec.vu.idInTest);
}
