// 想定負荷の混合シナリオ。VUS まで 1 分で増やし、HOLD の間維持して、30 秒で下げる。
import exec from 'k6/execution';
import { HOLD, VUS, guard, thresholds } from './lib/config.js';
import { mixedIteration } from './lib/scenario.js';

export const options = {
  scenarios: {
    mixed: {
      executor: 'ramping-vus',
      stages: [
        { duration: '1m', target: VUS },
        { duration: HOLD, target: VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: thresholds([
    'timeline',
    'timeline_new',
    'post_detail',
    'comments',
    'search',
    'profile',
    'user_list',
    'write',
    'login',
    'refresh',
  ]),
};

export function setup() {
  guard();
}

export default function () {
  mixedIteration(exec.vu.idInTest);
}
