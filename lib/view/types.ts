// 화면이 쓰는 데이터 형태. 서버 API가 생기면 이 타입에 맞춰 내려주면 된다.
// 기준 문서: AI churI/규칙/유령_키보드_게임규칙_v2.md, AI churI/시나리오/유령_키보드_시나리오_개정판.md
// 정답, 진상, 해금 조건, 캐릭터 시트는 여기에 없다. 서버만 안다.

export type Emotion = "neutral" | "flustered" | "angry" | "smile";

/** 배경 그림 대비 % 좌표의 사각형. */
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * 장면이나 클로즈업에서 누를 수 있는 곳. 화면에 표시하지 않는다.
 * - closeup: 누르면 그 클로즈업 화면이 열린다 (2단계 조사)
 * - action "keyboard-test": 키보드 테스트를 연다 (단서 3·4 확보 후, 그 전에는 id로 조사)
 * - 둘 다 없으면 id로 조사한다 (단서가 없는 곳도 있다)
 */
export type Hotspot = Rect & { id: string; label: string; closeup?: string; action?: "keyboard-test"; keyboardOf?: string };

/** 장소. 지금 시나리오는 교실 1곳이지만 여러 곳도 받을 수 있다. */
export type Scene = {
  id: string;
  name: string;
  background: string;
  width: number;
  height: number;
  hotspots: Hotspot[];
  people: { suspectId: string; hit: Rect }[];
};

/**
 * 클로즈업. 그림(image) 위에 클릭 영역을 두거나, 컴퓨터 화면(screen)을 HTML로 그린다.
 * 컴퓨터 화면은 정확한 글자(파일 이름, 시각)가 필요해서 그림 대신 화면 요소로 그린다.
 */
export type Closeup =
  | { id: string; title: string; kind: "image"; background: string; hotspots: Hotspot[]; links?: { label: string; closeup: string }[] }
  | { id: string; title: string; kind: "screen"; screen: "desktop" | "editor"; owner: string };

export type PublicSuspect = {
  id: string;
  letter: "A" | "B" | "C" | "D";
  name: string;
  role: string; // 화면에 보이는 한 줄 소개
  isVictim?: boolean; // 피해자도 용의자 목록에 들어간다
  keyboard: "wireless" | "wired";
  portraits: Record<Emotion, string>; // 얼굴 초상 (수첩·작은 표시용)
  sprites: Record<Emotion, string>; // 골반 위 상반신 (대화할 때 화면 가운데, 배경 투명)
};

export type PublicScenario = {
  id: string;
  title: string;
  intro: string; // 사건 개요 (시나리오 1장)
  rules: string[]; // 사건 소개 화면의 규칙 요약
  scenes: Scene[];
  closeups: Record<string, Closeup>;
  emptyText: string;
  suspects: PublicSuspect[];
  motives: { id: string; label: string }[];
  keyboardTest: { candidates: string[]; requires: string[] }; // 테스트 대상, 열리는 조건(증거 id)
  suggestions: Record<string, string[]>; // 사람별 추천 질문
};

/**
 * 수첩에 쌓이는 증거. 현장 단서, 서버가 판정해 자동으로 넣는 증언, 키보드 테스트 결과.
 * 모두 심문에서 "증거로 내밀" 수 있다.
 * order: 사건 순서 정렬용(서버가 정함). timeLabel: 기록은 정확한 시각, 증언은 대략적 표현.
 */
export type Evidence = {
  id: string;
  kind: "scene" | "testimony" | "test";
  name: string;
  place: string;
  text: string;
  icon: string;
  suspectId?: string; // 증언한 사람 / 테스트 대상
  order: number | null; // null이면 시간과 무관
  timeLabel?: string;
  exact?: boolean; // 컴퓨터 기록처럼 정확한 시각
  foundAt: number;
};

export type Message = {
  id: string;
  suspectId: string;
  question: string; // 증거만 내밀면 빈 문자열
  clueId: string | null; // 내민 증거
  answer: string;
  emotion: Emotion;
  charged: boolean; // 질문 횟수를 썼는지 (복합 질문·무관한 말·같은 증거 재제시는 차감 안 함)
  notice?: string; // 차감 안 함 등 안내
  newEvidenceIds: string[]; // 이 답변으로 수첩에 들어온 증언
  createdAt: number;
};

/** 플레이어가 답변 문장을 눌러 남긴 개인 메모. 서버 판정에는 쓰지 않는다. */
export type Note = { id: string; suspectId: string; messageId: string; text: string; createdAt: number };

/** 플레이어가 사건 순서 쪽에서 두 증거를 연필로 이은 개인 메모. 서버 판정에는 쓰지 않는다. */
export type Contradiction = { id: string; a: string; b: string; memo: string };

export type PlayerSummary = { nickname: string; questionsUsed: number; submitted: boolean; isMe: boolean };

export type GameConfig = {
  generalQuestions: number;
  totalMs: number;
  graceMs: number; // 시간 종료 후 제출 유예
  questionMaxLength: number;
};

export type RoomStatus = "waiting" | "playing" | "finished";

export type Me = {
  nickname: string;
  isHost: boolean;
  questionsUsed: number;
  started: boolean; // 사건 소개 화면을 지나 수사를 시작했는지
  submitted: boolean;
};

export type Accusation = { suspectId: string; motiveId: string } | null; // null = 시간 초과 미제출

export type Verdict = "win" | "partial" | "lose";

export type ReportView = {
  verdict: Verdict;
  culpritOk: boolean;
  motiveOk: boolean;
  answer: { culprit: string; motive: string };
  mine: { culprit: string | null; motive: string | null };
  truth: string;
  timeline: { time: string; text: string }[];
  howItHappened: string;
  keyEvidence: { label: string; got: boolean }[];
  usage: { questionsUsed: number; timeLeftMs: number; evidenceFound: number; evidenceShown: string[] };
  players: { nickname: string; verdict: Verdict | null; questionsUsed: number; isMe: boolean }[];
};

export type GameView = {
  code: string;
  status: RoomStatus;
  endsAt: number | null; // 내 수사 종료 시각 (수사 시작 시 서버가 정함)
  config: GameConfig;
  scenario: PublicScenario;
  players: PlayerSummary[];
  me: Me;
  checked: string[]; // 조사한 곳 id
  evidence: Evidence[];
  testsDone: string[]; // 키보드 테스트한 사람 id
  messages: Message[];
  notes: Note[];
  contradictions: Contradiction[];
  myAccusation: Accusation | undefined; // undefined = 아직 제출 안 함
  report: ReportView | null;
};
