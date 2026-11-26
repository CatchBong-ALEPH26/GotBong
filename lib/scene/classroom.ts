// 교실 장면 배치 (화면 담당). 사건 내용은 서버가 주고, 여기는 "어디를 누르면 어느 단서 카드가 나오는지"만 정한다.
// 역할(범인 포함)은 게임마다 바뀌므로 여기에는 역할 기준 정보를 두지 않는다. 사람은 서버의 사람 ID로 가리킨다.
// 좌표는 public/game/scenes/classroom.png(1536×864) 기준 %.
//
// 임시 배치: 지금 그림에는 빈 피해자 자리가 없어서 오른쪽 뒤 책상(원래 강사님 책상)을 피해자 자리로 쓴다.
// 그림을 다시 그리면 VICTIM_DESK 좌표와 people 좌표만 고치면 된다.
import type { Closeup, Emotion, Scene } from "@/lib/view/types";

/** 서버 사람 ID → 그림 파일 이름. public/game/{portraits,sprites}/<id>-<표정>.png */
export const art = (id: string) => {
  const files = (dir: string): Record<Emotion, string> => ({
    neutral: `/game/${dir}/${id}-neutral.png`,
    flustered: `/game/${dir}/${id}-flustered.png`,
    angry: `/game/${dir}/${id}-angry.png`,
    smile: `/game/${dir}/${id}-smile.png`,
  });
  return { portraits: files("portraits"), sprites: files("sprites") };
};

const icon = (n: number) => `/game/items/gk-${n}.png`;
export const TESTIMONY_ICON = icon(11);

/** 서버 단서 카드(clues[].id)를 수첩에 놓을 때 쓰는 그림·시각. 시각은 단서 문구에 적힌 컴퓨터 기록 시각이다. */
export const CLUE_META: Record<string, { icon: string; place: string; order: number | null; timeLabel?: string }> = {
  trash: { icon: icon(2), place: "{victim}의 컴퓨터", order: 956, timeLabel: "09:56" },
  receiver: { icon: icon(3), place: "{victim}의 본체 뒤쪽 · 장비표", order: null },
  source: { icon: icon(1), place: "{victim}의 컴퓨터", order: 947, timeLabel: "09:47" },
  build: { icon: icon(9), place: "자리의 모니터", order: 949, timeLabel: "09:49" },
  chat: { icon: icon(8), place: "{victim}의 메신저", order: 930, timeLabel: "09:30" },
};

// 누른 곳 → 단서 카드는 서버가 판정하고 기록한다(/api/investigate). 표는 lib/game/data/spots.mjs 하나뿐이다.
// 새 단서 자리를 만들면 hotspots·closeups 의 id 를 그 표에 추가한다.

/** 단서가 없는 곳의 관찰문. {victim}은 피해자 이름으로 바뀐다. */
export const SPOT_TEXT: Record<string, string> = {
  monitor: "실습 화면이 떠 있다. 눈에 띄는 기록은 없다.",
  keyboard: "흰색 키보드다. 겉으로 봐서는 누구 것과도 비슷하다.",
  "victim-kb": "{victim}의 키보드. 이상한 점은 없다.",
  screen: "스크린이 내려와 있다. 2교시 발표 자료가 띄워질 자리다.",
  window: "앙상한 가로수 위로 첫눈이 살짝 앉았다.",
  usb: "USB 메모리. 실습 과제 폴더뿐이다.",
  phone: "휴대폰이다. 잠겨 있다.",
  note: "실습 노트. 오늘 수업 필기뿐이다.",
  "front-usb": "앞쪽 USB 포트. 지금은 비어 있다.",
  power: "전원 버튼. 컴퓨터는 켜져 있다.",
  cables: "모니터 선과 전원선. 이상한 점은 없다.",
};

export const classroom: Scene = {
  id: "classroom",
  name: "교실",
  background: "/game/scenes/classroom.png",
  width: 1536,
  height: 864,
  hotspots: [
    { id: "window", label: "창문", x: 0, y: 3.5, w: 30.6, h: 49.7 },
    { id: "screen", label: "스크린", x: 41.5, y: 13.7, w: 31.1, h: 28.5 },
    { id: "board", label: "게시판의 교실 장비표", x: 78.8, y: 19.9, w: 8.3, h: 13.3 },
    // 피해자 자리 (VICTIM_DESK)
    { id: "victim-desk", label: "{victim}의 본체", x: 72.6, y: 43.5, w: 15.6, h: 14.4, closeup: "tower-front" },
    { id: "victim-monitor", label: "{victim}의 모니터", x: 75.4, y: 35.2, w: 5.8, h: 9.4, closeup: "victim-desktop" },
    { id: "victim-kb", label: "{victim}의 키보드", x: 80.1, y: 43.4, w: 4.4, h: 1.8 },
    // 사람 자리의 모니터와 소품
    { id: "monitor-kim", label: "모니터", x: 26.4, y: 41.9, w: 6.8, h: 10.2 },
    { id: "monitor-hwangyc", label: "모니터", x: 57.6, y: 41.9, w: 6.5, h: 9.6 },
    { id: "monitor-won", label: "모니터", x: 35.5, y: 57.9, w: 8, h: 12.5 },
    { id: "monitor-hwanggh", label: "모니터", x: 65.6, y: 57.9, w: 8.3, h: 9.8 },
    { id: "keyboard", label: "키보드", x: 27.3, y: 51.8, w: 4.3, h: 3 },
    { id: "keyboard", label: "키보드", x: 59.4, y: 51.8, w: 4.3, h: 3 },
    { id: "keyboard", label: "키보드", x: 36.1, y: 70.6, w: 6.3, h: 3 },
    { id: "keyboard", label: "키보드", x: 72.9, y: 71.2, w: 5.6, h: 4.6 },
    { id: "usb", label: "USB 메모리", x: 31.8, y: 51.8, w: 2.6, h: 3 },
    { id: "phone", label: "휴대폰", x: 43.6, y: 70.8, w: 2.6, h: 3.4 },
    { id: "note", label: "실습 노트", x: 67.4, y: 51.3, w: 3.9, h: 3.2 },
  ],
  people: [
    { suspectId: "kim", hit: { x: 19.5, y: 39, w: 7.5, h: 30 } },
    { suspectId: "hwangyc", hit: { x: 52, y: 40, w: 5.5, h: 30 } },
    { suspectId: "won", hit: { x: 28.6, y: 56, w: 7.5, h: 37 } },
    { suspectId: "hwanggh", hit: { x: 76, y: 54, w: 9, h: 37 } },
  ],
};

export const closeups: Record<string, Closeup> = {
  "victim-desktop": { id: "victim-desktop", title: "{victim}의 컴퓨터 화면", kind: "screen" },
  "tower-front": {
    id: "tower-front",
    title: "{victim}의 본체 · 앞쪽",
    kind: "image",
    background: "/game/closeups/tower-front.png",
    hotspots: [
      { id: "front-usb", label: "앞쪽 USB 포트", x: 62, y: 53, w: 18.5, h: 9.5 },
      { id: "power", label: "전원 버튼", x: 68, y: 35.9, w: 5.6, h: 10.4 },
      { id: "victim-kb", label: "키보드", x: 0, y: 59, w: 54.7, h: 29 },
    ],
    links: [{ label: "뒤쪽 보기", closeup: "tower-back" }],
  },
  "tower-back": {
    id: "tower-back",
    title: "{victim}의 본체 · 뒤쪽",
    kind: "image",
    background: "/game/closeups/tower-back.png",
    hotspots: [
      { id: "receiver", label: "뒤쪽 USB에 꽂힌 작은 장치", x: 57, y: 58.5, w: 9.5, h: 14 },
      { id: "receiver", label: "본체 옆면의 테이프 자국", x: 79.7, y: 16.2, w: 14.3, h: 16.2 },
      { id: "cables", label: "전원선과 모니터 선", x: 0, y: 10, w: 45, h: 80 },
    ],
    links: [{ label: "앞쪽 보기", closeup: "tower-front" }],
  },
};

export const RULES = [
  "용의자 네 명에게 자유롭게 질문한다. 질문은 모두 20번. 한 번에 세 가지까지 물을 수 있고, 물은 개수만큼 줄어든다.",
  "제대로 된 답을 받은 질문만 차감된다. 질문이 여러 개 섞이면 다시 물어보라고 한다.",
  "현장 조사와 수첩 보기는 질문을 쓰지 않는다.",
  "단서 카드나 다른 사람의 말을 증거로 내밀 수 있다. 숨긴 이야기를 여는 열쇠다.",
  "범인 1명과 동기를 한 번만 제출한다. 동기는 자유롭게 쓴다.",
  "범인과 동기를 모두 맞히면 해결. 시간 제한은 없다.",
];

export const SUGGESTIONS = ["쉬는 시간에 어디 있었어요?", "{victim} 자리 근처에 간 사람을 봤어요?", "오늘 오전에 {victim} 씨랑 무슨 일이 있었어요?"];

/**
 * 막혔을 때의 혼잣말 힌트 (화면 담당). 아직 못 찾은 단서 카드마다 "어디를 볼지"만 알려 준다. 내용은 말하지 않는다.
 * [흐릿한 힌트, 구체적인 힌트]. HINT_ORDER 순서로 아직 못 찾은 첫 단서를 고른다.
 */
export const HINTS: Record<string, [string, string]> = {
  trash: ["사라진 프로그램이 어디로 갔는지부터 확인해야겠다.", "{victim}의 모니터를 눌러 바탕화면을 살펴보자. 휴지통이 수상하다."],
  receiver: ["{victim}의 본체 주변이 마음에 걸린다.", "{victim}의 본체를 누르고 '뒤쪽 보기'로 넘겨 보자. 게시판의 장비표도 같이 보면 좋다."],
  source: ["누가 {victim}의 컴퓨터를 만졌는지, 컴퓨터가 기억하고 있을지도 몰라.", "{victim}의 바탕화면에서 '최근 파일'을 열어 보자."],
  chat: ["오늘 오전에 무슨 일이 있었는지 남은 기록이 있을까?", "{victim}의 바탕화면에서 메신저를 열어 보자."],
  build: ["다른 사람들 자리에도 뭔가 남아 있을지 몰라.", "용의자들 자리의 모니터를 하나씩 눌러 보자."],
};
export const HINT_ORDER = ["trash", "receiver", "source", "chat", "build"];
export const ALL_FOUND_HINT = "현장 단서는 다 모았다. 이제 사람들에게 단서를 내밀어 숨긴 이야기를 끌어내자.";

/** "{victim}" 자리표시자를 채운다. */
export const fillVictim = (s: string, victim: string) => s.replaceAll("{victim}", victim);
