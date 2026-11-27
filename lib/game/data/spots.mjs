// 현장에서 누른 곳 → 단서 카드 id. 서버(조사 API의 clueAtSpot)와 화면(lib/scene/classroom.ts)이 같은 표를 쓴다.
// 사람 모니터(monitor-<사람 ID>)는 여기 없다: 빌드 기록이 어느 모니터에 있는지는 범인을 알아야 정할 수 있어서
// 서버가 배정을 보고 판정한다 (game.mjs clueAtSpot).
export const SPOT_TO_CLUE = Object.freeze({
  'desk-folder': 'trash',
  'desk-trash': 'trash',
  'desk-recent': 'source',
  'desk-chat': 'chat',
  receiver: 'receiver',
  board: 'receiver'
});
