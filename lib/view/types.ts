// 화면이 쓰는 데이터 형태. 게임 API(app/api/*, docs/game/HANDOFF.md) 응답을 lib/api/useGame.ts가 이 모양으로 바꾼다.
// 정답, 역할 배정(A~D), 해금 조건은 여기에 없다. 서버만 안다.

export type Emotion = "neutral" | "flustered" | "angry" | "smile";

/** 배경 그림 대비 % 좌표의 사각형. */
export type Rect = { x: number; y: number; w: number; h: number };

/**
 * 장면이나 클로즈업에서 누를 수 있는 곳. 화면에 표시하지 않는다.
 * closeup이 있으면 그 클로즈업이 열리고, 없으면 id로 조사한다 (단서가 없는 곳도 있다).
 */
export type Hotspot = Rect & { id: string; label: string; closeup?: string };

/** 장소. 지금은 교실 1곳. people의 suspectId는 서버의 사람 ID(kim, hwangyc, won, hwanggh). */
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
 * 클로즈업. 그림(image) 위에 클릭 영역을 두거나, 피해자 컴퓨터 화면(screen)을 HTML로 그린다.
 * 컴퓨터 화면은 정확한 글자(파일 이름, 시각)가 필요해서 그림 대신 화면 요소로 그린다.
 */
export type Closeup =
  | { id: string; title: string; kind: "image"; background: string; hotspots: Hotspot[]; links?: { label: string; closeup: string }[] }
  | { id: string; title: string; kind: "screen" };

export type PublicSuspect = {
  id: string; // 서버의 사람 ID
  name: string;
  role: string; // 한 줄 소개 (서버 npcs[].summary)
  portraits: Record<Emotion, string>; // 얼굴 초상 (수첩·작은 표시용)
  sprites: Record<Emotion, string>; // 상반신 (대화할 때 화면 가운데, 배경 투명)
};

export type PublicScenario = {
  title: string;
  intro: string; // 여러 줄
  victim: string; // 피해자 이름 (게임마다 바뀜, 심문 불가)
  rules: string[];
  scenes: Scene[];
  closeups: Record<string, Closeup>;
  emptyText: string;
  suspects: PublicSuspect[]; // 서버가 준 순서 그대로
  suggestions: string[]; // 추천 질문 (모든 사람 공통)
};

/**
 * 수첩에 쌓이는 증거. 현장 단서(장면에서 찾은 서버 단서 카드)와 증언(다른 사람의 답변).
 * 모두 심문에서 "증거로 내밀" 수 있다. 증언 id는 "turn:<서버 turn id>".
 */
export type Evidence = {
  id: string;
  kind: "scene" | "testimony";
  name: string;
  place: string;
  text: string;
  icon: string;
  suspectId?: string; // 증언한 사람
  order: number | null; // 사건 순서 정렬용. null이면 시간과 무관
  timeLabel?: string;
  exact?: boolean; // 컴퓨터 기록처럼 정확한 시각
  foundAt: number;
};

export type Message = {
  id: string; // 서버 turn id
  suspectId: string;
  question: string;
  clueId: string | null; // 내민 증거 (Evidence.id)
  answer: string;
  emotion: Emotion;
  createdAt: number;
};

/** 플레이어가 답변 문장을 눌러 남긴 개인 메모. 서버 판정에는 쓰지 않는다. */
export type Note = { id: string; suspectId: string; messageId: string; text: string; createdAt: number };

/** 플레이어가 사건 순서 쪽에서 두 증거를 연필로 이은 개인 메모. 서버 판정에는 쓰지 않는다. */
export type Contradiction = { id: string; a: string; b: string; memo: string };

export type GameConfig = { generalQuestions: number; questionMaxLength: number };

export type Me = {
  questionsUsed: number;
  started: boolean; // 사건 소개 화면을 지나 수사를 시작했는지
  submitted: boolean;
};

export type Accusation = { suspectId: string; motive: string };

export type Verdict = "win" | "lose";

export type ReportView = {
  verdict: Verdict;
  mine: { culprit: string; motive: string };
  truth: string; // 여러 줄
  cast: { name: string; title: string; culprit: boolean }[]; // 사람마다 실제로 맡았던 역할
  /** 동기를 채점한 방식. fixture = 테스트용 키워드 비교, gemini·openai = 실제 AI, null = 범인이 틀려 채점 안 함 */
  grader: "fixture" | "gemini" | "openai" | null;
  usage: { questionsUsed: number; evidenceShown: string[]; pinned: number };
};

/** 서버 단서 카드의 찾기 현황. 제목은 게임이 끝난 뒤(보고서)에만 화면에 보여 준다. */
export type ClueStatus = { id: string; title: string; found: boolean; icon: string; timeLabel?: string };

export type GameView = {
  mode: "openai" | "gemini" | "fixture";
  config: GameConfig;
  scenario: PublicScenario;
  me: Me;
  checked: string[]; // 조사한 곳 id
  clues: ClueStatus[];
  evidence: Evidence[];
  messages: Message[];
  notes: Note[];
  contradictions: Contradiction[];
  report: ReportView | null;
};
