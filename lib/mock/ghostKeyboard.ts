// UI 시험용 **예시** 데이터: 「유령 키보드 — 사라진 실습 프로그램」 (시나리오 개정판 + 규칙 v2).
// 사건 내용·단서 문구·해금 조건은 시나리오 담당이 정한다. 이 파일은 화면 흐름을 끝까지 시험하려고 문서를 옮긴 것이다.
// 실제 서버에서는 정답·해금 판정(아래 mockServer)이 서버에만 있고, 대사는 LLM이 만든다.
// 인물 배정은 임시다: A=봉경, B=윤찬(피해자), C=원, D=건희. 배정이 확정되면 suspects만 바꾸면 된다.
import type { Emotion, Evidence, PublicScenario, ReportView, Verdict } from "@/lib/view/types";

const face = (id: string): Record<Emotion, string> => ({
  neutral: `/game/portraits/${id}-neutral.png`,
  flustered: `/game/portraits/${id}-flustered.png`,
  angry: `/game/portraits/${id}-angry.png`,
  smile: `/game/portraits/${id}-smile.png`,
});
const body = (id: string): Record<Emotion, string> => ({
  neutral: `/game/sprites/${id}-neutral.png`,
  flustered: `/game/sprites/${id}-flustered.png`,
  angry: `/game/sprites/${id}-angry.png`,
  smile: `/game/sprites/${id}-smile.png`,
});
const icon = (n: number) => `/game/items/gk-${n}.png`;

export const ghostScenario: PublicScenario = {
  id: "ghost-keyboard",
  title: "유령 키보드",
  intro:
    "오전 10시 15분. 윤찬은 자신이 만든 점심 메뉴 룰렛 프로그램을 시연하려고 했다. 그런데 바탕화면에서 프로그램 창이 사라져 있었고, 실행 파일마저 없었다. “쉬는 시간 전에 분명 켜 놓고 갔는데요? 누가 껐어요? 파일은 어디 갔어요?” 주변 학생들은 모두 “나는 윤찬 컴퓨터를 만진 적 없다”고 말한다. 교실에는 같은 무선 키보드를 쓰는 학생이 여럿이고, 윤찬의 컴퓨터 뒤에는 정체를 알 수 없는 작은 USB 장치가 꽂혀 있다.",
  rules: [
    "질문은 20번. 네 사람에게 자유롭게 나눠 쓴다.",
    "제한 시간은 20분. 끝나면 30초 안에 제출해야 한다.",
    "현장 조사와 수첩 보기는 질문을 쓰지 않는다.",
    "증거를 내미는 것도 질문 1번이다.",
    "키보드 테스트는 한 사람당 질문 1번이다.",
    "범인 1명과 동기 1개를 한 번만 제출한다.",
  ],
  emptyText: "특별한 건 없어 보인다.",
  // 좌표는 public/game/scenes/classroom.png 그림에 맞춘 값이다 (가로·세로 %).
  scenes: [
    {
      id: "classroom",
      name: "교실",
      background: "/game/scenes/classroom.png",
      width: 1536,
      height: 864,
      hotspots: [
        { id: "window", label: "창문", x: 0, y: 3.5, w: 30.6, h: 49.7 },
        { id: "screen", label: "스크린", x: 41.5, y: 13.7, w: 31.1, h: 28.5 },
        { id: "teacher-desk", label: "강사님 책상", x: 72.6, y: 35.3, w: 15.6, h: 22.6 },
        { id: "board", label: "정리판", x: 78.8, y: 19.9, w: 8.3, h: 13.3 },
        { id: "b-monitor", label: "윤찬의 모니터", x: 57.6, y: 41.9, w: 6.5, h: 9.6, closeup: "b-desktop" },
        { id: "b-tower", label: "윤찬의 본체", x: 64.9, y: 43.7, w: 2.9, h: 8.6, closeup: "b-tower-front" },
        { id: "b-kb", label: "윤찬의 키보드", x: 59.4, y: 51.8, w: 4.3, h: 3 },
        { id: "b-note", label: "윤찬의 실습 노트", x: 67.4, y: 51.3, w: 3.9, h: 3.2 },
        { id: "a-kb", label: "봉경의 키보드", x: 27.3, y: 51.8, w: 4.3, h: 3, action: "keyboard-test", keyboardOf: "a" },
        { id: "a-usb", label: "봉경 책상의 USB 메모리", x: 31.8, y: 51.8, w: 2.6, h: 3 },
        { id: "c-kb", label: "원의 키보드", x: 36.1, y: 70.6, w: 6.3, h: 3, action: "keyboard-test", keyboardOf: "c" },
        { id: "c-phone", label: "원의 휴대폰", x: 43.6, y: 70.8, w: 2.6, h: 3.4 },
        { id: "d-monitor", label: "건희의 모니터", x: 65.6, y: 57.9, w: 8.3, h: 9.8, closeup: "d-editor" },
        { id: "d-kb", label: "건희의 키보드", x: 72.9, y: 71.2, w: 5.6, h: 4.6, action: "keyboard-test", keyboardOf: "d" },
      ],
      people: [
        { suspectId: "a", hit: { x: 19.5, y: 39, w: 7.5, h: 30 } },
        { suspectId: "b", hit: { x: 52, y: 40, w: 5.5, h: 30 } },
        { suspectId: "c", hit: { x: 28.6, y: 56, w: 7.5, h: 37 } },
        { suspectId: "d", hit: { x: 76, y: 54, w: 9, h: 37 } },
      ],
    },
  ],
  closeups: {
    "b-desktop": { id: "b-desktop", title: "윤찬의 컴퓨터 화면", kind: "screen", screen: "desktop", owner: "b" },
    "d-editor": { id: "d-editor", title: "건희의 컴퓨터 화면", kind: "screen", screen: "editor", owner: "d" },
    "b-tower-front": {
      id: "b-tower-front",
      title: "윤찬의 본체 · 앞쪽",
      kind: "image",
      background: "/game/closeups/b-tower-front.png",
      hotspots: [
        { id: "front-usb", label: "앞쪽 USB 포트", x: 62, y: 53, w: 18.5, h: 9.5 },
        { id: "b-power", label: "전원 버튼", x: 68, y: 35.9, w: 5.6, h: 10.4 },
        { id: "b-kb", label: "유선 키보드", x: 0, y: 59, w: 54.7, h: 29 },
      ],
      links: [{ label: "뒤쪽 보기", closeup: "b-tower-back" }],
    },
    "b-tower-back": {
      id: "b-tower-back",
      title: "윤찬의 본체 · 뒤쪽",
      kind: "image",
      background: "/game/closeups/b-tower-back.png",
      hotspots: [
        { id: "receiver", label: "뒤쪽 USB에 꽂힌 작은 장치", x: 57, y: 58.5, w: 9.5, h: 14 },
        { id: "receiver", label: "본체 옆면의 테이프 자국", x: 79.7, y: 16.2, w: 14.3, h: 16.2 },
        { id: "b-cables", label: "전원선과 모니터 선", x: 0, y: 10, w: 45, h: 80 },
      ],
      links: [{ label: "앞쪽 보기", closeup: "b-tower-front" }],
    },
  },
  suspects: [
    { id: "a", letter: "A", name: "봉경", role: "윤찬과 코드 문제로 다툰 사람", keyboard: "wireless", portraits: face("a"), sprites: body("a") },
    { id: "b", letter: "B", name: "윤찬", role: "프로그램이 사라진 학생", isVictim: true, keyboard: "wired", portraits: face("b"), sprites: body("b") },
    { id: "c", letter: "C", name: "원", role: "윤찬 컴퓨터로 휴대폰을 충전한 사람", keyboard: "wireless", portraits: face("c"), sprites: body("c") },
    { id: "d", letter: "D", name: "건희", role: "쉬는 시간에 자리에 있던 사람", keyboard: "wireless", portraits: face("d"), sprites: body("d") },
  ],
  motives: [
    { id: "m1", label: "자신의 시연을 놀린 윤찬을 장난으로 당황하게 만들려고" },
    { id: "m2", label: "다툼이 있던 봉경에게 누명을 씌우려고" },
    { id: "m3", label: "원이 몰래 충전한 일을 감추려고" },
    { id: "m4", label: "윤찬의 PC를 고쳐 주려다 실수로" },
    { id: "m5", label: "윤찬의 발표 순서를 뒤로 미루려고" },
  ],
  keyboardTest: { candidates: ["a", "c", "d"], requires: ["c3", "c4"] },
  suggestions: {
    a: ["쉬는 시간에 어디 있었어요?", "쉬는 시간에 윤찬 자리 근처에 간 적 있어요?", "윤찬과는 왜 다퉜어요?"],
    b: ["프로그램은 언제 없어진 걸 알았어요?", "나갈 때 컴퓨터를 잠갔어요?", "프로그램에 버그는 없었어요?"],
    c: ["윤찬 컴퓨터 앞쪽 USB는 왜 만졌어요?", "쉬는 시간에 윤찬 컴퓨터 근처에 누가 있었어요?", "건희는 그 뒤에 뭘 하고 있었어요?"],
    d: ["쉬는 시간에 뭐 하고 있었어요?", "2교시에 키보드는 왜 안 썼어요?", "윤찬 컴퓨터 근처에 간 적 있어요?"],
  },
};

// ---------------- 아래는 서버만 아는 정보 (예시) ----------------

type Def = Omit<Evidence, "id" | "foundAt">;

/** 현장 단서 (시나리오 6장). */
export const CLUES: Record<string, Def> = {
  c1: { kind: "scene", name: "사라진 데모 화면", place: "윤찬 모니터", text: "점심 룰렛 프로그램 창이 없다. 실습 폴더에 점심룰렛_데모.exe가 없다.", icon: icon(1), order: 1015, timeLabel: "10:15 발견", exact: true },
  c2: { kind: "scene", name: "휴지통 기록", place: "윤찬 PC 휴지통", text: "점심룰렛_데모.exe / 삭제: 오늘 09:56 / 원래 위치: 바탕화면\\실습_데모", icon: icon(2), order: 956, timeLabel: "09:56", exact: true },
  c3: { kind: "scene", name: "낯선 수신기", place: "윤찬 본체 뒤쪽", text: "작은 무선 키보드 수신기가 꽂혀 있다. 측면에 테이프를 뗀 자국만 있고 이름이나 번호는 없다.", icon: icon(3), order: null },
  c4: { kind: "scene", name: "교실 장비표", place: "정리판", text: "무선 키보드 세트 3개(봉경·원·건희) 구입, 같은 모델. 수신기는 세트별 전용 페어링이라 다른 세트 키보드로는 입력되지 않는다. 윤찬은 유선 키보드.", icon: icon(4), order: null },
  c5: { kind: "scene", name: "봉경의 USB 메모리", place: "봉경 책상", text: "봉경_실습_과제 폴더와 윤찬에게 받은 참고 자료. 데모 실행 파일은 없다.", icon: icon(5), order: null },
  c6: { kind: "scene", name: "충전 케이블", place: "윤찬 본체 앞쪽 / 원의 휴대폰", text: "케이블은 윤찬 본체 앞쪽 USB에 꽂혀 있었고 09:57에 회수됐다.", icon: icon(6), order: 957, timeLabel: "09:57", exact: true },
  c7: { kind: "scene", name: "실습 노트", place: "윤찬 책상", text: "09:45 메모 — 점심 룰렛 실행 확인. 2교시 발표 때 시연.", icon: icon(7), order: 945, timeLabel: "09:45", exact: true },
  c8: { kind: "scene", name: "단체 대화 기록", place: "윤찬 PC 메신저", text: "09:30 윤찬: 건희 시연하다 또 멈추는 거 아니야? ㅋㅋ / 건희: ㅋㅋ 웃기네", icon: icon(8), order: 930, timeLabel: "09:30", exact: true },
  c9: { kind: "scene", name: "건희의 모니터", place: "건희 책상", text: "편집기 마지막 저장 09:51, 이후 변화 없음. 오전 시연 때 난 오류 창이 그대로 남아 있다.", icon: icon(9), order: 951, timeLabel: "09:51", exact: true },
};

/** 증언 (서버가 해금을 판정해 수첩에 자동으로 넣는다). 사람의 증언은 대략적인 시각만 쓴다. */
export const TESTIMONY: Record<string, Def> = {
  "t-a0": { kind: "testimony", suspectId: "a", name: "봉경: 복도에 있었다", place: "봉경의 말", text: "쉬는 시간 내내 복도에 있었다고 한다.", icon: icon(11), order: 950, timeLabel: "쉬는 시간 내내" },
  "t-a": { kind: "testimony", suspectId: "a", name: "봉경: 잠깐 윤찬 화면을 봤다", place: "봉경의 말", text: "쉬는 시간에 잠깐 들어와 윤찬 화면을 봤다. 그땐 창이 이미 닫혀 있었는데 폴더에 파일은 있었다.", icon: icon(11), order: 955, timeLabel: "쉬는 시간 중 잠깐" },
  "t-b": { kind: "testimony", suspectId: "b", name: "윤찬: 잠그지 않고 나갔다", place: "윤찬의 말", text: "나갈 때 PC를 잠그지 않았다. 돌아와서는 자료를 전체 화면으로 봐서 프로그램이 없는 건 몰랐다. 전날 시연 때 버그로 한 번 멈춘 적은 있다.", icon: icon(11), order: 950, timeLabel: "쉬는 시간이 시작될 때" },
  "t-c1": { kind: "testimony", suspectId: "c", name: "원: 건희가 본체 뒤에 숙였다", place: "원의 말", text: "쉬는 시간 끝나기 조금 전에 건희가 윤찬 컴퓨터 뒤에 몸을 숙이는 걸 봤다. 뭘 하는지는 안 보였다. 그 뒤에 봉경도 잠깐 들어왔다 나갔다.", icon: icon(11), order: 953, timeLabel: "쉬는 시간 끝나기 조금 전" },
  "t-c2": { kind: "testimony", suspectId: "c", name: "원: 건희가 무릎 위 키보드를 두드렸다", place: "원의 말", text: "건희가 자리에서 키보드를 무릎에 놓고 계속 두드리는 것 같았는데, 건희 화면은 그대로여서 이상했다.", icon: icon(11), order: 954, timeLabel: "그 직후" },
  "t-d0": { kind: "testimony", suspectId: "d", name: "건희: 코드를 고치고 있었다", place: "건희의 말", text: "쉬는 시간에 자기 자리에서 자기 코드를 고치고 있었다고 한다.", icon: icon(11), order: 951, timeLabel: "쉬는 시간 내내" },
  "t-d05": { kind: "testimony", suspectId: "d", name: "건희: 키보드가 안 먹혔다", place: "건희의 말", text: "그땐 키보드가 안 먹혔다고 말을 바꿨다. 이유는 모른다고 한다.", icon: icon(11), order: 952, timeLabel: "쉬는 시간 중" },
  "t-d1": { kind: "testimony", suspectId: "d", name: "건희: 수신기를 꽂았다", place: "건희의 말", text: "자기 키보드 수신기를 윤찬 컴퓨터 뒤쪽에 꽂았다고 인정했다.", icon: icon(11), order: 953, timeLabel: "쉬는 시간 끝나기 조금 전" },
  "t-d2": { kind: "testimony", suspectId: "d", name: "건희: 끄고 지웠다", place: "건희의 말", text: "자기 자리에서 윤찬의 프로그램을 끄고 실행 파일을 휴지통에 넣었다고 인정했다.", icon: icon(11), order: 956, timeLabel: "그 뒤" },
  "t-d3": { kind: "testimony", suspectId: "d", name: "건희: 놀림을 되갚으려 했다", place: "건희의 말", text: "시연 때 놀림을 받아서 윤찬을 당황하게 만들고 싶었다고 인정했다.", icon: icon(11), order: 930, timeLabel: "오전 수업 때부터" },
};

/** 키보드 테스트 결과 (단서 10). */
export const TESTS: Record<string, Def & { typedOn: "self" | "b"; line?: string }> = {
  a: { kind: "test", suspectId: "a", name: "키보드 테스트: 봉경", place: "봉경의 키보드", text: "봉경의 PC에 글자가 입력된다. 윤찬 화면은 그대로다. 봉경 본체에 수신기가 꽂혀 있다.", icon: icon(12), order: null, typedOn: "self" },
  c: { kind: "test", suspectId: "c", name: "키보드 테스트: 원", place: "원의 키보드", text: "원의 PC에 글자가 입력된다. 윤찬 화면은 그대로다.", icon: icon(12), order: null, typedOn: "self" },
  d: { kind: "test", suspectId: "d", name: "키보드 테스트: 건희", place: "건희의 키보드", text: "건희의 PC에는 아무 변화가 없다. 윤찬의 모니터에 글자가 입력된다. 건희 본체의 수신기 자리는 비어 있다.", icon: icon(12), order: null, typedOn: "b", line: "…건전지 문제일 거예요." },
};

/** 장면·클로즈업의 클릭 영역 id → 단서 id. 없으면 SPOT_TEXT의 관찰문. */
export const SPOT_TO_CLUE: Record<string, string> = {
  "b-folder": "c1",
  "b-trash": "c2",
  receiver: "c3",
  board: "c4",
  "a-usb": "c5",
  "front-usb": "c6",
  "c-phone": "c6",
  "b-note": "c7",
  "b-chat": "c8",
  "d-editor-main": "c9",
};

export const SPOT_TEXT: Record<string, string> = {
  "b-kb": "윤찬의 키보드는 선이 달린 유선 키보드다.",
  "a-kb": "흰색 무선 키보드다. 겉으로 봐서는 누구 것과도 똑같다.",
  "c-kb": "흰색 무선 키보드다. 겉으로 봐서는 누구 것과도 똑같다.",
  "d-kb": "흰색 무선 키보드다. 건희가 무릎 위에 올려 두고 있다.",
  screen: "스크린이 내려와 있다. 2교시 발표 자료가 띄워질 자리다.",
  "teacher-desk": "강사님 책상. 출석부와 리모컨만 있다.",
  window: "앙상한 가로수 위로 첫눈이 살짝 앉았다.",
  "b-cables": "모니터 선과 전원선. 이상한 점은 없다.",
  "b-power": "전원 버튼. 컴퓨터는 켜져 있다.",
};

// ---------------- 예시 판정기 ----------------

export type ServerState = {
  flags: { a: boolean; a0: boolean; b: boolean; c1: boolean; c2: boolean; d0: boolean; alibi: boolean; dStage: number };
  shownTo: Record<string, string[]>; // 사람별로 내민 증거 (누적)
};

export const initialServerState = (): ServerState => ({
  flags: { a: false, a0: false, b: false, c1: false, c2: false, d0: false, alibi: false, dStage: 0 },
  shownTo: { a: [], b: [], c: [], d: [] },
});

type Reply = { answer: string; emotion: Emotion; charged: boolean; notice?: string; add: string[] };

/**
 * 질문·증거 제시 한 번에 대한 예시 판정 (규칙 v2 3장, 5장, 시나리오 5장).
 * 실제로는 서버가 해금·자백 단계를 판정하고, 대사는 LLM이 캐릭터 말투로 만든다.
 */
export function mockServer(st: ServerState, sid: string, question: string, clueId: string | null): Reply {
  const q = question.trim();
  const has = (re: RegExp) => re.test(q);
  if ((q.match(/[?？]/g) ?? []).length > 1)
    return { answer: "하나씩 물어봐 주세요. 한 번에 하나만 대답할게요.", emotion: "neutral", charged: false, notice: "질문이 여러 개라 차감되지 않았다", add: [] };
  if (!clueId && (!q || has(/프롬프트|시스템|너는\s*AI|AI야|게임\s*규칙|규칙을?\s*(무시|바꿔)/)))
    return { answer: "네? 무슨 말씀인지 잘 모르겠어요. 사건 얘기만 해 주세요.", emotion: "neutral", charged: false, notice: "사건과 무관한 말이라 차감되지 않았다", add: [] };
  if (clueId && st.shownTo[sid].includes(clueId))
    return { answer: "아까 그거 보여 주셨잖아요. 더 할 말은 없어요.", emotion: "neutral", charged: false, notice: "같은 증거라 차감되지 않았다", add: [] };
  if (clueId) st.shownTo[sid].push(clueId);
  const shown = new Set(st.shownTo[sid]);
  const f = st.flags;
  const add: string[] = [];
  const r = (answer: string, emotion: Emotion): Reply => ({ answer, emotion, charged: true, add });

  if (sid === "a") {
    if (!f.a0) {
    f.a0 = true;
    add.push("t-a0");
  }
    if (!f.a && (clueId === "t-c1" || has(/(윤찬|자리|모니터|화면).*(근처|갔|왔|봤)|교실에.*(들어|왔)|들어(왔|갔)/))) {
      f.a = true;
      add.push("t-a");
      return r("…잠깐 들어가서 윤찬 화면은 봤어요. 그땐 창이 이미 닫혀 있었는데 폴더에 파일은 있었어요. 지금 말하면 제가 범인 같아서 못 했어요.", "flustered");
    }
    if (clueId === "c5") return r("그건 제 과제 폴더예요. 데모 파일 같은 건 없어요.", "angry");
    if (clueId === "c3") return r("저도 같은 키보드 쓰긴 하는데요, 제 수신기는 제 컴퓨터에 그대로 꽂혀 있어요.", "angry");
    if (has(/키보드|수신기/)) return r("저도 그 흰 무선 키보드 써요. 근데 제 건 제 컴퓨터에 잘 꽂혀 있어요.", "neutral");
    if (has(/다투|다퉜|싸|코드/)) return r("코드 문제로 좀 날카롭게 말한 건 맞아요. 그렇다고 남의 프로그램을 왜 지워요?", "angry");
    return f.a
      ? r("아까 말한 대로예요. 화면만 보고 바로 나갔어요. 아무것도 안 만졌어요.", "neutral")
      : r("저는 쉬는 시간 내내 복도에 있었어요. 윤찬이랑 코드로 좀 다툰 건 맞는데, 남의 프로그램을 왜 지워요?", "neutral");
  }

  if (sid === "b") {
    if (!f.b && (clueId === "c1" || clueId === "c2" || has(/버그|오류|멈춘|멈췄|잠그|잠금|잠갔/))) {
      f.b = true;
      add.push("t-b");
      return r("버그는 있었어요. 어제 시연 때 한 번 멈췄거든요. 그래도 오류가 파일을 휴지통에 넣지는 않잖아요. 나갈 때 컴퓨터를 안 잠그고 나간 건 맞아요.", "flustered");
    }
    if (clueId === "c3") return r("그거 제 거 아니에요. 전 유선 키보드 쓰거든요. 언제 꽂혔는지도 몰라요.", "flustered");
    if (clueId === "c8") return r("그냥 농담한 거예요. 건희도 웃었잖아요.", "smile");
    if (has(/언제|몇\s*시|알았|발견/)) return r("발표하려고 자료를 닫았더니 없었어요. 돌아와서는 자료만 전체 화면으로 봐서 몰랐어요.", "neutral");
    return r("아까까지 프로그램 켜져 있었어요! 지금 창도 없고 파일도 없는데요!", "angry");
  }

  if (sid === "c") {
    if (!f.c1 && (clueId === "c6" || has(/앞쪽|뒤쪽|근처에?\s*누가|누가.*(컴퓨터|본체|자리|근처)|본\s*사람|봤어요/))) {
      f.c1 = true;
      add.push("t-c1");
      return r("…쉬는 시간 끝나기 조금 전에 건희가 윤찬 컴퓨터 뒤에 몸을 숙이는 걸 봤어요. 뭘 하는지는 안 보였어요. 그 뒤에 봉경도 잠깐 들어왔다 나갔어요.", "flustered");
    }
    if (f.c1 && !f.c2 && (clueId === "test-d" || has(/(건희).*(뭐|그\s*뒤|하고|했)/))) {
      f.c2 = true;
      add.push("t-c2");
      return r("건희가 자리에서 키보드를 무릎에 놓고 계속 두드리는 것 같았는데, 건희 화면은 그대로여서 이상했어요.", "neutral");
    }
    if (clueId === "c6") return r("네, 그 케이블 제 거예요. 허락 없이 충전한 건 죄송해요. 앞쪽 포트만 썼어요.", "flustered");
    return r("제가 USB 만진 건 맞는데, 제 휴대폰 충전하려고 한 거예요.", "neutral");
  }

  // d
  if (!f.d0) {
    f.d0 = true;
    add.push("t-d0");
  }
  if (!f.alibi && (clueId === "c9" || clueId === "t-c2")) {
    f.alibi = true;
    add.push("t-d05");
    return r("…그땐 키보드가 안 먹혔어요. 왜인지는 저도 몰라요.", "flustered");
  }
  if (f.dStage === 0 && f.alibi && shown.has("test-d") && shown.has("t-c1")) {
    f.dStage = 1;
    add.push("t-d1");
    return r("…네, 제 키보드 수신기를 윤찬 컴퓨터 뒤에 꽂았어요. 근데 그게 다예요.", "flustered");
  }
  if (f.dStage === 1 && shown.has("c2")) {
    f.dStage = 2;
    add.push("t-d2");
    return r("끄기만 하려고 했는데… 윤찬 반응이 생각나서 파일까지 휴지통에 넣었어요.", "flustered");
  }
  if (f.dStage === 2 && shown.has("c8")) {
    f.dStage = 3;
    add.push("t-d3");
    return r("시연 때 놀려서… 좀 당황하게 하고 싶었어요. 이렇게 커질 줄은 몰랐어요. 죄송합니다.", "flustered");
  }
  if (clueId === "c3" && f.dStage === 0) return r("그거 다 비슷한 거잖아요. 제 건지 어떻게 알아요?", "angry");
  if (has(/키보드|건전지|입력/) && f.dStage === 0) return r("키보드 건전지가 나갔나 봐요. 2교시 내내 안 되더라고요.", "neutral");
  if (has(/근처|뒤에|본체|숙/) && f.dStage === 0) return r("USB 점검하러 근처에 잠깐 간 것뿐이에요.", "flustered");
  if (f.dStage >= 1) return r("…다 말씀드렸잖아요.", "flustered");
  if (f.alibi) return r("키보드가 안 됐다니까요. 그 이상은 몰라요.", "angry");
  return r("저는 쉬는 시간에 제 자리에서 제 코드 고치고 있었는데요. 왜 저를 보세요?", "angry");
}

/** 결과·보고서 예시 (규칙 v2 7·8장). */
export function buildReport(input: {
  culprit: string | null;
  motive: string | null;
  evidenceIds: string[];
  shown: string[];
  questionsUsed: number;
  timeLeftMs: number;
  others: { nickname: string; verdict: Verdict | null; questionsUsed: number }[];
}): ReportView {
  const culpritOk = input.culprit === "d";
  const motiveOk = input.motive === "m1";
  const verdict: Verdict = culpritOk && motiveOk ? "win" : culpritOk ? "partial" : "lose";
  const name = (id: string | null) => ghostScenario.suspects.find((s) => s.id === id)?.name ?? null;
  const has = new Set(input.evidenceIds);
  return {
    verdict,
    culpritOk,
    motiveOk,
    answer: { culprit: "건희", motive: ghostScenario.motives[0].label },
    mine: { culprit: name(input.culprit), motive: ghostScenario.motives.find((m) => m.id === input.motive)?.label ?? null },
    truth:
      "오전 수업에서 윤찬이 건희의 시연을 두고 “시연하다 또 멈추는 거 아니야?”라고 놀렸다. 쉬는 시간, 윤찬이 PC를 잠그지 않고 나가자 건희는 자기 키보드의 수신기를 뽑아 윤찬 PC 본체 뒤쪽에 꽂고 이름 테이프를 뗐다. 윤찬의 모니터가 보이는 대각선 뒤 자리에서 키보드를 무릎에 놓고 프로그램을 끈 뒤, 실행 파일을 휴지통으로 보냈다. 윤찬이 돌아와 계속 자리에 있었기 때문에 건희는 수신기를 돌려놓지 못했고, 2교시 내내 자기 PC에 한 글자도 칠 수 없었다. 봉경은 쉬는 시간에 잠깐 윤찬 화면을 보고 나갔을 뿐이다.",
    timeline: [
      { time: "09:30", text: "윤찬이 건희의 멈춘 시연을 놀림" },
      { time: "09:50", text: "윤찬이 PC를 잠그지 않고 나감 · 원이 앞쪽 USB로 충전" },
      { time: "09:52", text: "건희가 자기 PC에서 수신기를 뽑음" },
      { time: "09:53", text: "건희가 수신기를 윤찬 본체 뒤쪽에 꽂음 (원이 목격)" },
      { time: "09:54", text: "건희가 자리에서 윤찬의 프로그램을 종료" },
      { time: "09:55", text: "봉경이 잠깐 들어와 화면만 보고 나감" },
      { time: "09:56", text: "건희가 점심룰렛_데모.exe를 휴지통으로 이동" },
      { time: "10:15", text: "윤찬이 발표 직전에 발견" },
    ],
    howItHappened: "건희가 자기 키보드 수신기를 윤찬 본체에 꽂고, 자기 자리에서 프로그램을 끈 뒤 실행 파일을 휴지통에 넣었다.",
    keyEvidence: [
      { label: "휴지통 기록 (09:56)", got: has.has("c2") },
      { label: "낯선 수신기", got: has.has("c3") },
      { label: "교실 장비표", got: has.has("c4") },
      { label: "키보드 테스트: 건희", got: has.has("test-d") },
      { label: "원의 목격 (건희가 본체 뒤에 숙임)", got: has.has("t-c1") },
      { label: "건희의 모니터 (알리바이 모순)", got: has.has("c9") },
      { label: "단체 대화 기록 (동기)", got: has.has("c8") },
    ],
    usage: { questionsUsed: input.questionsUsed, timeLeftMs: input.timeLeftMs, evidenceFound: input.evidenceIds.length, evidenceShown: input.shown },
    players: [{ nickname: "나", verdict, questionsUsed: input.questionsUsed, isMe: true }, ...input.others.map((o) => ({ ...o, isMe: false }))],
  };
}
