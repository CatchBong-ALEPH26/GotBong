// 화면 미리보기용 가짜 서버 (화면 담당). 랜섬웨어 사건(v3.6) 화면을 서버 작업 전에 확인하려고 둔다.
//
// - 실제 서버가 아직 예전 사건을 주는 동안에만 쓰인다. 서버가 새 사건을 주기 시작하면(isNewCase) 자동으로 꺼진다.
// - 응답 모양은 "서버에 요청하는 새 계약" 그대로다. 서버 담당은 이 파일의 응답 모양을 참고하면 된다.
//     GET  /api/session      clues[] 는 { id, title } 만 먼저 주고, detail 은 찾은 단서에만 넣는다 (이름이 든 단서가 미리 새지 않게)
//     POST /api/investigate  { spot } → { clue: { id, title, detail } | null }   자리 id: pc-chrome, pc-devices, desk-usb, mentoring-sheet
//     POST /api/question     turn 에 선택 필드 material(증언 속 자료), gained(대화로 얻은 단서 카드)
//     POST /api/submit       result 에 선택 필드 grade(S/A/B/C), cast[].culprit
// - 용의자 대답은 진짜 대사가 아니라 자리 표시 문장이다. 사건의 전말과 자백은 넣지 않았다. 판정도 흉내만 낸다.
// - 상태는 이 브라우저의 localStorage 에만 둔다. 서버의 질문 횟수는 쓰지 않는다.
import type { ServerResult, ServerTurn, Session } from "@/lib/api/useGame";
import type { Material } from "@/lib/view/types";

type Npc = Session["npcs"][number];
type Role = "불씨" | "자랑" | "초조" | "심부름";
const ROLES: Role[] = ["불씨", "자랑", "초조", "심부름"];
const ROLE_TITLE: Record<Role, string> = { 불씨: "범인", 자랑: "칭찬받은 사람", 초조: "배탈 난 사람", 심부름: "USB를 두고 온 사람" };

type State = {
  gameKey: string;
  npcs: Npc[];
  cast: Record<Role, string>; // 역할 → 사람 ID
  found: string[];
  turns: ServerTurn[];
  remaining: number;
  result: ServerResult | null;
};

const KEY = "gotbong:preview:ransomware";
const MAX_QUESTIONS = 20;
const VICTIM = "홍정민 강사님";

const INTRO = [
  "점심시간이 끝난 오후 2시쯤, 식사를 마치고 강의실로 돌아온 홍정민 강사님은 다음 강의를 준비하려고 늘 하던 대로 바탕화면의 크롬 아이콘을 눌렀습니다.",
  "그런데 화면이 한 번 깜빡이더니 파일 이름 뒤에 낯선 글자가 줄줄이 붙기 시작했습니다. 아이콘은 하나둘 흰 빈 문서로 바뀌었고, 바탕화면에는 누군가 장난처럼 남긴 안내문 파일이 생겼습니다.",
  "강사님은 점심시간(1시~2시) 내내 자리를 비웠습니다. 그 사이 누군가 강사님 컴퓨터에 손을 댄 것이 분명합니다. 그날 학원에 있던 수강생은 네 명입니다. 현장을 살펴보고 네 사람에게 질문해서 범인과 그 동기를 밝혀 주세요.",
  "질문은 20번까지 할 수 있고, 현장 조사는 질문 횟수에 포함되지 않습니다.",
].join("\n");

/** 단서 5장 (시나리오 5.1절의 "화면에 나오는 글"). {역할}은 배정된 사람 이름으로 바뀐다. */
const CLUES: { id: string; title: string; detail: string }[] = [
  { id: "shortcut", title: "크롬 바로가기 속성", detail: "이름: Chrome\n실행 경로: 크롬 설치 폴더가 아닌 '공용 문서' 폴더의 파일\n바로가기 만든 날짜: 오늘 1시 10분쯤\n그 파일의 속성: 만든 날짜 오늘 1시 10분쯤 / 복사해 온 곳 'PowerBank'" },
  { id: "usblog", title: "USB 접속 기록", detail: "① {심부름}의 USB / 저장장치 / 32GB / 오늘 10시쯤 연결, 10시 반쯤 해제\n② PowerBank / 저장장치 / 1TB / 오늘 1시 5분쯤 연결, 1시 20분쯤 해제" },
  { id: "mentoring", title: "멘토링 신청표", detail: "전날 3시: {자랑}\n전날 4시 반: {불씨}\n나머지 두 명은 다른 날" },
  { id: "usb", title: "키보드 옆 32GB USB", detail: "32GB USB\n뒷면 이름 스티커: {심부름}\n파일이 하나도 없다." },
  { id: "message", title: "스마트폰의 푸념 메시지", detail: "전날 밤 9시쯤\n{불씨}: 포폴 이렇게 할 거면 딴 거 알아보래. 사람들 다 듣는 데서. 그냥은 못 넘어가." },
];
const SPOT_TO_CLUE: Record<string, string> = { "pc-chrome": "shortcut", "pc-devices": "usblog", "desk-usb": "usb", "mentoring-sheet": "mentoring" };

/** 증언 속 자료 4종 (시나리오 5.2절). 미리보기는 네 형태를 모두 볼 수 있게 B 갈래로 고정한다. */
const MATERIALS: Record<string, { role: Role; ask: RegExp; reply: string; material: Material }> = {
  receipt: { role: "자랑", ask: /점심|식당|밥|영수증|어디/, reply: "점심은 식당에서 먹었어요. 영수증도 있어요, 보세요.", material: { id: "receipt", form: "paper", title: "식당 영수증", text: "주문 1시쯤 2인분\n결제 1시 50분쯤" } },
  studylog: { role: "초조", ask: /점심|어디|자습실|기록/, reply: "자습실에 있었어요. 데스크 기록표에 적혀 있을 거예요.", material: { id: "studylog", form: "paper", title: "자습실 이용 기록", text: "{초조} 12시 40분쯤 입실\n1시 반쯤 외출\n1시 40분쯤 재입실" } },
  submit: { role: "초조", ask: /왜|거르|제출|남았|방어전/, reply: "방어전 자료를 내야 했어요. 제출 완료 알림도 왔고요.", material: { id: "submit", form: "phone", title: "제출 완료 알림", text: "방어전 자료 1시 25분쯤 제출 완료" } },
  savelog: { role: "불씨", ask: /저장|기록|보여/, reply: "제 자리에서 포폴 고쳤어요. 저장 기록도 있어요.", material: { id: "savelog", form: "files", title: "포폴 저장 기록", text: "포폴_최종.pptx / 12시 55분쯤 저장\n포폴_최종.pptx / 1시 50분쯤 저장" } },
};

const uid = () => crypto.randomUUID();

function load(): State | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as State) : null;
  } catch {
    return null;
  }
}
function save(st: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
  } catch {
    /* 저장이 막혀 있으면 이번 화면에서만 기억한다 */
  }
}
let state: State | null = null;

function newGame(npcs: Npc[]): State {
  const ids = npcs.map((n) => n.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const cast = Object.fromEntries(ROLES.map((r, i) => [r, ids[i]])) as Record<Role, string>;
  return { gameKey: `preview-${uid()}`, npcs, cast, found: [], turns: [], remaining: MAX_QUESTIONS, result: null };
}

/** 서버가 이미 새 사건을 주는지. 주면 미리보기는 쓰지 않는다. */
export const isNewCase = (s: Session) => s.clues.some((c) => c.id === "usblog");

/** 미리보기를 켠다. 사람 목록(이름·소개)은 실제 서버가 준 것을 그대로 쓴다. */
export function startPreview(npcs: Npc[]) {
  const saved = load();
  const same = saved && saved.npcs.length === npcs.length && saved.npcs.every((n) => npcs.some((m) => m.id === n.id));
  state = same ? { ...saved, npcs } : newGame(npcs);
  save(state);
}

const nameOf = (st: State, id: string) => st.npcs.find((n) => n.id === id)?.name ?? "";
const roleOf = (st: State, id: string) => ROLES.find((r) => st.cast[r] === id);
const fill = (st: State, text: string) => ROLES.reduce((t, r) => t.replaceAll(`{${r}}`, nameOf(st, st.cast[r])), text);
const clue = (st: State, id: string) => {
  const c = CLUES.find((x) => x.id === id)!;
  return { id: c.id, title: c.title, detail: fill(st, c.detail) };
};

function session(st: State): Session {
  return {
    intro: INTRO,
    victim: VICTIM,
    clues: CLUES.map((c) => (st.found.includes(c.id) ? clue(st, c.id) : { id: c.id, title: c.title })),
    npcs: st.npcs,
    mode: "fixture",
    preview: true,
    gameKey: st.gameKey,
    remaining: st.remaining,
    maxQuestions: MAX_QUESTIONS,
    turns: st.turns,
    found: st.found,
    result: st.result,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type QuestionBody = { npc: string; question: string; attach?: { type: "clue" | "turn"; id: string } };
type SubmitBody = { npc: string; motive: string };

/** 가짜 서버. useGame 의 api() 가 미리보기일 때 실제 요청 대신 부른다. */
export async function previewApi(path: string, body?: unknown): Promise<unknown> {
  const st = state;
  if (!st) throw new Error("미리보기가 준비되지 않았다.");

  if (path === "/api/session") return session(st);

  if (path === "/api/investigate") {
    const id = SPOT_TO_CLUE[(body as { spot: string }).spot];
    if (!id) return { clue: null };
    if (!st.found.includes(id)) st.found.push(id);
    save(st);
    return { clue: clue(st, id) };
  }

  if (path === "/api/question") {
    const b = body as QuestionBody;
    await wait(900);
    const role = roleOf(st, b.npc);
    const name = nameOf(st, b.npc);
    let reply = `(화면 미리보기) 서버가 새 사건으로 바뀌면 이 자리에 ${name}의 실제 대답이 나온다.`;
    let emotion = "기본";
    let material: Material | undefined;
    let gained: ReturnType<typeof clue> | undefined;
    if (role === "자랑" && b.attach?.type === "clue" && b.attach.id === "mentoring") {
      reply = "…사실 고치라는 말도 조금 들었어요. 그리고 이거, 어젯밤에 받은 메시지예요.";
      emotion = "당황";
      if (!st.found.includes("message")) {
        st.found.push("message");
        gained = clue(st, "message");
      }
    } else {
      const hit = Object.values(MATERIALS).find((m) => m.role === role && m.ask.test(b.question) && !st.turns.some((t) => t.material?.id === m.material.id));
      if (hit) {
        reply = hit.reply;
        material = { ...hit.material, text: fill(st, hit.material.text) };
      }
    }
    const attached = b.attach?.type === "clue" ? CLUES.find((c) => c.id === b.attach!.id) : undefined;
    const quoted = b.attach?.type === "turn" ? st.turns.find((t) => t.id === b.attach!.id) : undefined;
    const turn: ServerTurn = {
      id: uid(),
      npc: b.npc,
      question: b.question,
      reply,
      emotion,
      attach: attached ? { type: "clue", id: attached.id, title: attached.title } : quoted ? { type: "turn", id: quoted.id, npc: quoted.npc, reply: quoted.reply } : null,
      material,
      gained,
    };
    st.turns.push(turn);
    st.remaining = Math.max(0, st.remaining - 1);
    save(st);
    return { status: "accepted", turn, remaining: st.remaining, used: 1 };
  }

  if (path === "/api/submit") {
    const b = body as SubmitBody;
    await wait(900);
    const right = roleOf(st, b.npc) === "불씨";
    const motiveOk = /멘토링|무시|모욕|폭언|망신/.test(b.motive) && /복수|앙갚음|갚|되갚|보복/.test(b.motive);
    const score = right && motiveOk ? 1 : 0;
    st.result = {
      score,
      grader: right ? "fixture" : null,
      truth: "화면 미리보기라서 사건의 전말은 여기에 적지 않았다.\n서버가 새 사건으로 바뀌면 이 자리에 진상이 나온다.",
      cast: ROLES.map((r) => ({ npc: st.cast[r], name: nameOf(st, st.cast[r]), role: r, title: ROLE_TITLE[r], culprit: r === "불씨" })),
      progress: { solved: [], total: 6 },
      grade: score ? "B" : "C",
    };
    save(st);
    return { result: st.result };
  }

  if (path === "/api/reset") {
    state = newGame(st.npcs);
    save(state);
    return session(state);
  }

  throw new Error(`미리보기에 없는 요청: ${path}`);
}
