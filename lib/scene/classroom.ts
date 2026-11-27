// 강의실 장면 배치 (화면 담당). 사건: 랜섬웨어 사건(v3.6). 사건 내용은 서버가 주고, 여기는 "어디를 누를 수 있는지"와 그림만 정한다.
// 역할(범인 포함)은 게임마다 바뀌므로 여기에는 역할 기준 정보를 두지 않는다. 사람은 서버의 사람 ID로 가리킨다.
// 좌표는 public/game/scenes/classroom.png(1536×864) 기준 %.
//
// 배경 구조(2026-11-27): 왼쪽 벽에 창문 없음, 게시판 없음. 긴 책상 2줄(왼쪽 4자리, 오른쪽 3자리). 실제 강의실은 4줄이지만 화면에는 2줄만 그렸다.
// 강사님 자리는 오른쪽 뒤, 책상 위에 모니터·본체·키보드·USB가 보인다. 멘토링 신청표는 스크린 오른쪽 벽에 붙은 종이.
// 그림을 다시 그리면 hotspots·people 좌표만 고치면 된다. 그림 지시문: docs/design/drafts/briefs/ransomware-classroom.md
import type { Closeup, ClueForm, Emotion, Scene } from "@/lib/view/types";

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
export const CHROME_ICON = "/game/case/chrome.png";
export const RANSOM_NOTE = "/game/case/ransom-note.png";

/**
 * 서버 단서 카드(clues[].id)를 화면에 놓을 때 쓰는 형태·그림·자리·시각 (시나리오 5.1절).
 * 시각은 기록에 적힌 대략 표기 그대로다. talk: 현장이 아니라 대화 중에 얻는 단서.
 */
export const CLUE_META: Record<string, { form: ClueForm; icon: string; place: string; order: number | null; timeLabel?: string; talk?: boolean }> = {
  shortcut: { form: "window", icon: icon(9), place: "강사님 모니터", order: 1310, timeLabel: "1시 10분쯤" },
  usblog: { form: "window", icon: icon(1), place: "강사님 모니터", order: 1305, timeLabel: "1시 5분쯤" },
  mentoring: { form: "paper", icon: icon(4), place: "벽에 붙은 신청표", order: null },
  usb: { form: "object", icon: icon(5), place: "강사님 키보드 옆", order: null },
  message: { form: "phone", icon: icon(8), place: "대화 중에 보여 준 스마트폰", order: null, talk: true },
};
/** 자료 형태별 작은 그림 (수첩 표시용). */
export const FORM_ICON: Record<ClueForm, string> = { window: icon(9), paper: icon(4), object: icon(5), phone: icon(8), files: icon(1) };

// 누른 곳 → 단서 카드는 서버가 판정하고 기록한다(/api/investigate).
// 이 사건의 단서 자리 id: pc-chrome(바로가기 속성), pc-devices(USB 접속 기록), desk-usb(키보드 옆 USB), mentoring-sheet(신청표).

/** 단서가 없는 곳의 관찰문. {victim}은 피해자 이름으로 바뀐다. */
export const SPOT_TEXT: Record<string, string> = {
  monitor: "실습 화면이 떠 있다. 눈에 띄는 기록은 없다.",
  "teacher-kb": "강사님의 키보드. 자판에는 이상한 점이 없다.",
  "teacher-tower": "강사님 컴퓨터의 본체. USB 포트는 지금 모두 비어 있다.",
  screen: "스크린이 내려와 있다. 오후 강의 자료가 띄워질 자리였다.",
  door: "유리문 너머로 복도가 보인다. 계단은 복도 끝에 있다.",
  trash: "쓰레기통. 구겨진 종이뿐이다.",
  "pc-file": "열리지 않는다. 파일 이름 뒤에 낯선 글자가 붙어 있다.",
  "pc-note": "누군가 장난처럼 남긴 안내문이다. 이것만으로는 누가 했는지 알 수 없다.",
};

export const classroom: Scene = {
  id: "classroom",
  name: "강의실",
  background: "/game/scenes/classroom.png",
  width: 1536,
  height: 864,
  hotspots: [
    { id: "screen", label: "스크린", x: 37.4, y: 16.2, w: 29.3, h: 25.5 },
    { id: "mentoring-sheet", label: "벽에 붙은 종이", x: 77.4, y: 20, w: 4.6, h: 9.4 },
    { id: "door", label: "유리문", x: 92.8, y: 11, w: 7.2, h: 54 },
    { id: "trash", label: "쓰레기통", x: 88.8, y: 46.6, w: 3.8, h: 11.4 },
    // 강사님 자리
    { id: "teacher-monitor", label: "강사님의 모니터", x: 70.6, y: 31.9, w: 6.4, h: 9.6, closeup: "teacher-pc" },
    { id: "teacher-tower", label: "강사님 컴퓨터 본체", x: 77.6, y: 33, w: 3.3, h: 8.6 },
    { id: "teacher-kb", label: "강사님의 키보드", x: 72.9, y: 41.3, w: 5.6, h: 2 },
    { id: "desk-usb", label: "강사님 키보드 옆", x: 79.9, y: 40.3, w: 3, h: 3.2 },
    // 수강생 자리 (단서 없음)
    { id: "monitor", label: "수강생 자리의 모니터", x: 12.8, y: 46.2, w: 36, h: 8.6 },
    { id: "monitor", label: "수강생 자리의 모니터", x: 60.6, y: 46.2, w: 23.8, h: 8.6 },
    { id: "monitor", label: "수강생 자리의 모니터", x: 8.2, y: 67.8, w: 40.4, h: 9.4 },
    { id: "monitor", label: "수강생 자리의 모니터", x: 56.4, y: 67.8, w: 32.4, h: 9.4 },
  ],
  people: [
    { suspectId: "kim", hit: { x: 21.2, y: 42.4, w: 7.6, h: 24.6 } },
    { suspectId: "hwangyc", hit: { x: 55.2, y: 42.6, w: 8.6, h: 24.8 } },
    { suspectId: "won", hit: { x: 27.4, y: 62.2, w: 8.8, h: 28 } },
    { suspectId: "hwanggh", hit: { x: 76.2, y: 62.2, w: 11.2, h: 28 } },
  ],
};

export const closeups: Record<string, Closeup> = {
  "teacher-pc": { id: "teacher-pc", title: "강사님의 컴퓨터 화면", kind: "screen" },
};

export const RULES = [
  "용의자 네 명에게 자유롭게 질문한다. 질문은 모두 20번. 한 번에 세 가지까지 물을 수 있고, 물은 개수만큼 줄어든다.",
  "제대로 된 답을 받은 질문만 차감된다. 질문이 여러 개 섞이면 다시 물어보라고 한다.",
  "현장 조사와 수첩 보기는 질문을 쓰지 않는다.",
  "단서 카드나 다른 사람의 말을 증거로 내밀 수 있다. 숨긴 이야기를 여는 열쇠다.",
  "범인 1명과 동기를 한 번만 제출한다. 동기는 자유롭게 쓴다.",
  "범인과 동기를 모두 맞히면 해결. 시간 제한은 없다.",
];

export const SUGGESTIONS = ["점심시간에 어디 있었어요?", "강사님 자리 근처에 간 사람을 봤어요?", "요즘 강사님이랑 무슨 일 있었어요?"];

/**
 * 막혔을 때의 혼잣말 힌트 (화면 담당). 아직 못 얻은 단서 카드마다 "어디를 볼지"만 알려 준다. 내용은 말하지 않는다.
 * [흐릿한 힌트, 구체적인 힌트]. HINT_ORDER 순서로 아직 못 얻은 첫 단서를 고른다.
 */
export const HINTS: Record<string, [string, string]> = {
  shortcut: ["강사님이 마지막으로 누른 건 크롬이었다. 그것부터 봐야겠다.", "강사님의 모니터를 눌러 바탕화면의 크롬 아이콘을 살펴보자."],
  usblog: ["이 컴퓨터에 무엇이 꽂혔었는지, 컴퓨터가 기억하고 있을지도 몰라.", "강사님의 모니터를 눌러 바탕화면에서 '장치 기록'을 열어 보자."],
  usb: ["강사님 책상 위에 강사님 것이 아닌 물건이 있는 것 같다.", "강사님 키보드 옆을 눌러 보자."],
  mentoring: ["강사님과 수강생들 사이에 무슨 일이 있었는지, 벽에 붙은 것부터 볼까.", "벽에 붙은 종이를 눌러 보자."],
  message: ["현장에서 볼 건 다 봤다. 나머지는 사람들 입에서 나온다.", "찾은 단서를 사람들에게 하나씩 내밀어 보자. 숨기던 걸 보여 줄지도 모른다."],
};
export const HINT_ORDER = ["shortcut", "usblog", "usb", "mentoring", "message"];
export const ALL_FOUND_HINT = "단서는 다 모았다. 이제 단서와 증언을 서로 맞대어 누구 말이 어긋나는지 따져 보자.";

/** "{victim}" 자리표시자를 채운다. */
export const fillVictim = (s: string, victim: string) => s.replaceAll("{victim}", victim);
