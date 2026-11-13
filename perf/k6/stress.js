// 限界を探る。VU を段階的に増やし、どの段階で p95 やエラー率が崩れるかを見る。
// 合否ではなく劣化点の把握が目的。エラー率が 20% を超えたら打ち切る。
import exec from 'k6/execution';
import { guard } from './lib/config.js';
import { mixedIteration } from './lib/scenario.js';

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m', target: 10 },
        { duration: '2m', target: 25 },
        { duration: '2m', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '2m', target: 150 },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_failed: [{ threshold: 'rate<0.2', abortOnFail: true, delayAbortEval: '30s' }],
  },
};

export function setup() {
  guard();
}

export default function () {
  mixedIteration(exec.vu.idInTest);
}
