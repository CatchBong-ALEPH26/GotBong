'use strict';

// 모든 사용자/모델 문자열은 textContent 로만 렌더링한다 (innerHTML 사용 금지).
const $ = (id) => document.getElementById(id);

const state = {
  npcs: [],
  clues: [],
  turns: [],
  remaining: 0,
  maxQuestions: 20,
  result: null,
  mode: 'gemini',
  current: null, // 선택된 NPC id
  busy: false,
  pending: null, // 네트워크 실패 시 같은 requestId 로 재시도하기 위한 캐시 {sig, id}
};

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function npcName(id) {
  const n = state.npcs.find((x) => x.id === id);
  return n?.name ?? id;
}

async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch (e) {
    const err = new Error('서버에 연결할 수 없습니다.');
    err.network = true;
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch (e) {
    if (res.ok) {
      const err = new Error('서버 응답을 끝까지 받지 못했습니다. 다시 시도해 주세요.');
      err.network = true;
      throw err;
    }
  }
  if (!res.ok) {
    throw new Error((data && data.error) || '요청 실패 (HTTP ' + res.status + ')');
  }
  return data || {};
}

function showBanner(msg, info) {
  const b = $('banner');
  if (!msg) { b.hidden = true; b.textContent = ''; return; }
  b.textContent = msg;
  b.className = 'banner' + (info ? ' info' : '');
  b.hidden = false;
}

function loadSession(s) {
  state.npcs = s.npcs || [];
  state.clues = s.clues || [];
  state.turns = s.turns || [];
  state.remaining = s.remaining;
  state.maxQuestions = s.maxQuestions ?? 20;
  state.result = s.result || null;
  state.mode = s.mode;
  state.pending = null;
  if (!state.npcs.some((n) => n.id === state.current)) {
    state.current = state.npcs.length ? state.npcs[0].id : null;
  }
  $('intro').textContent = s.intro || '';
  $('victim').textContent = s.victim ? '피해자 · ' + s.victim : '';
  $('victim').hidden = !s.victim;
  $('attachment').value = '';
  const ul = $('clues');
  ul.textContent = '';
  state.clues.forEach((c) => {
    const li = el('li');
    li.appendChild(el('strong', null, c.title));
    li.appendChild(el('span', 'detail', c.detail));
    ul.appendChild(li);
  });
  $('trace-panel').hidden = true;
  $('trace-body').textContent = '';
  $('ask-status').textContent = '';
  $('final-status').textContent = '';
  $('question').value = '';
  $('motive').value = '';
  buildFinalSelect();
  renderAll();
}

function buildFinalSelect() {
  const sel = $('final-npc');
  sel.textContent = '';
  state.npcs.forEach((n) => {
    const o = el('option', null, n.name);
    o.value = n.id;
    sel.appendChild(o);
  });
}

function renderAll() {
  const badge = $('mode-badge');
  badge.hidden = state.mode !== 'fixture';
  $('remaining').textContent = '남은 질문 ' + state.remaining + '/' + state.maxQuestions;
  renderTabs();
  renderLog();
  renderAttachments();
  renderResult();
  updateEnabled();
}

function renderTabs() {
  const box = $('npc-tabs');
  box.textContent = '';
  state.npcs.forEach((n) => {
    const b = el('button', 'tab', n.name);
    if (n.summary) b.appendChild(el('span', 'tab-summary', n.summary));
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(n.id === state.current));
    b.addEventListener('click', () => {
      state.current = n.id;
      renderTabs();
      renderLog();
      renderAttachments();
    });
    box.appendChild(b);
  });
}

function turnBubbles(t) {
  const frag = document.createDocumentFragment();
  const q = el('div', 'msg q');
  q.appendChild(el('span', 'who', '나'));
  if (t.attach?.type === 'turn') {
    q.appendChild(el('div', 'quote', npcName(t.attach.npc) + ': “' + t.attach.reply + '”'));
  } else if (t.attach?.type === 'clue') {
    q.appendChild(el('div', 'quote', '📎 단서: ' + t.attach.title));
  }
  q.appendChild(document.createTextNode(t.question));
  frag.appendChild(q);
  const a = el('div', 'msg a');
  const speaker = el('span', 'who', npcName(t.npc));
  if (t.emotion) speaker.appendChild(el('span', 'emotion', t.emotion));
  a.appendChild(speaker);
  a.appendChild(document.createTextNode(t.reply));
  frag.appendChild(a);
  return frag;
}

function renderLog() {
  const log = $('log');
  log.textContent = '';
  const mine = state.turns.filter((t) => t.npc === state.current);
  if (!mine.length) {
    log.appendChild(el('div', 'empty', state.current ? '아직 ' + npcName(state.current) + '와(과)의 대화가 없습니다.' : '용의자 정보를 불러오는 중입니다.'));
    return;
  }
  mine.forEach((t) => log.appendChild(turnBubbles(t)));
  log.scrollTop = log.scrollHeight;
}

function oneLine(s, max) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function renderAttachments() {
  const sel = $('attachment');
  const keep = sel.value;
  sel.textContent = '';
  const none = el('option', null, '첨부 없음');
  none.value = '';
  sel.appendChild(none);
  const clues = el('optgroup');
  clues.label = '단서 카드';
  for (const clue of state.clues) {
    const option = el('option', null, clue.title);
    option.value = 'clue:' + clue.id;
    clues.appendChild(option);
  }
  const statements = el('optgroup');
  statements.label = '다른 사람의 발언';
  for (const turn of state.turns.filter((t) => t.npc !== state.current)) {
    const option = el('option', null, npcName(turn.npc) + ': ' + oneLine(turn.reply, 60));
    option.value = 'turn:' + turn.id;
    statements.appendChild(option);
  }
  sel.append(clues, statements);
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}

function renderResult() {
  const box = $('result');
  if (!state.result) { box.hidden = true; return; }
  box.hidden = false;
  box.dataset.score = String(state.result.score);
  $('result-score').textContent = state.result.score === 1 ? '1 · 정답' : '0 · 오답';
  $('result-truth').textContent = state.result.truth;
  const cast = state.result.cast ?? [];
  const rows = $('result-cast-body');
  rows.textContent = '';
  for (const person of cast) {
    const row = el('tr');
    row.append(el('td', null, person.name), el('td', null, [person.role, person.title].filter(Boolean).join(' · ')));
    rows.appendChild(row);
  }
  $('result-cast').hidden = !cast.length;
}

function updateEnabled() {
  const done = !!state.result;
  const noLeft = state.remaining <= 0;
  const lockAsk = done || noLeft || state.busy;
  ['question', 'attachment', 'ask-btn'].forEach((id) => { $(id).disabled = lockAsk; });
  const lockFinal = done || state.busy;
  ['final-npc', 'motive', 'final-btn'].forEach((id) => { $(id).disabled = lockFinal; });
  $('reset-btn').disabled = state.busy;
  if (done) $('ask-status').textContent = '게임이 끝났습니다.';
  else if (noLeft) $('ask-status').textContent = '질문 횟수를 모두 사용했습니다. 최종 제출만 가능합니다.';
}

function showDebug(debug) {
  const panel = $('trace-panel');
  const body = $('trace-body');
  body.textContent = '';
  panel.hidden = !debug;
  if (!debug) return;

  const cast = Object.entries(debug.cast ?? {}).map(([role, name]) => role + ' · ' + name);
  const details = [
    ['배정', cast.join(', ') || '—'],
    ['피해자', debug.victim],
    ['질문 분류', [debug.kind, ...(debug.intents ?? [])].filter(Boolean).join(', ')],
    ['새로 해금된 사실', (debug.unlocked ?? []).join(', ') || '없음'],
    ['답변 초안', debug.draft],
    ['판정', debug.verdict],
    ['판정 이유', debug.reason],
    ['재생성', debug.regenerated ? '예' : '아니요'],
    ['검증 생략', debug.skippedVerify ? '예' : '아니요']
  ];
  for (const [label, value] of details) {
    const line = el('p');
    line.append(el('strong', null, label + ' · '), document.createTextNode(String(value ?? '—')));
    body.appendChild(line);
  }
  if (debug.calls?.length) {
    const wrapper = el('div', 'trace-table');
    const table = el('table');
    const head = table.createTHead().insertRow();
    for (const label of ['작업', '모델', '시간(ms)', '입력 토큰', '출력 토큰', '캐시 토큰']) {
      const cell = el('th', null, label);
      cell.scope = 'col';
      head.appendChild(cell);
    }
    const rows = table.createTBody();
    for (const call of debug.calls) {
      const row = rows.insertRow();
      for (const value of [call.task, call.model, call.ms, call.inputTokens, call.outputTokens, call.cachedTokens]) {
        row.appendChild(el('td', null, value ?? '—'));
      }
    }
    wrapper.appendChild(table);
    body.appendChild(wrapper);
  }
  const storedState = el('details');
  storedState.append(el('summary', null, 'NPC 상태'), el('pre', null, JSON.stringify(debug.state ?? {}, null, 2)));
  body.appendChild(storedState);
}

async function onAsk(ev) {
  ev.preventDefault();
  if (state.busy || state.result || state.remaining <= 0) return;
  const question = $('question').value.trim();
  if (!question) { $('ask-status').textContent = '질문을 입력하세요.'; return; }
  const body = { npc: state.current, question };
  const attachment = $('attachment').value;
  if (attachment) {
    const separator = attachment.indexOf(':');
    body.attach = { type: attachment.slice(0, separator), id: attachment.slice(separator + 1) };
  }

  // 같은 내용을 네트워크 오류 후 재시도하면 같은 requestId 를 써서 중복 차감을 막는다.
  const sig = JSON.stringify(body);
  if (!state.pending || state.pending.sig !== sig) state.pending = { sig, id: newId() };
  body.requestId = state.pending.id;

  state.busy = true;
  updateEnabled();
  $('ask-status').textContent = '답변을 기다리는 중…';
  showBanner('');
  try {
    const r = await api('POST', '/api/question', body);
    state.pending = null;
    if (typeof r.remaining === 'number') state.remaining = r.remaining;
    showDebug(r.debug);
    if (r.status === 'accepted' && r.turn) {
      if (!state.turns.some((turn) => turn.id === r.turn.id)) state.turns.push(r.turn);
      $('question').value = '';
      $('attachment').value = '';
      $('ask-status').textContent = '';
    } else {
      // rejected / clarify: 질문 내용은 남겨두어 고쳐 쓸 수 있게 한다.
      const label = r.status === 'clarify' ? '더 구체적으로 질문해 주세요. ' : '질문이 받아들여지지 않았습니다. ';
      $('ask-status').textContent = label + (r.message || '');
    }
  } catch (e) {
    if (!e.network) state.pending = null;
    $('ask-status').textContent = e.message;
  } finally {
    state.busy = false;
    renderAll();
  }
}

async function onFinal(ev) {
  ev.preventDefault();
  if (state.busy || state.result) return;
  const npc = $('final-npc').value;
  const motive = $('motive').value.trim();
  if (!motive) { $('final-status').textContent = '동기를 입력하세요.'; return; }
  const ok = window.confirm(
    '최종 제출하면 게임이 끝나고 되돌릴 수 없습니다.\n\n범인: ' + npcName(npc) + '\n동기: ' + motive + '\n\n제출할까요?'
  );
  if (!ok) return;

  const sig = JSON.stringify({ npc, motive });
  if (!state.pending || state.pending.sig !== sig) state.pending = { sig, id: newId() };

  state.busy = true;
  updateEnabled();
  $('final-status').textContent = '제출 중…';
  try {
    const r = await api('POST', '/api/submit', { npc, motive, requestId: state.pending.id });
    state.pending = null;
    state.result = r.result;
    $('final-status').textContent = '';
  } catch (e) {
    if (!e.network) state.pending = null;
    $('final-status').textContent = e.message;
  } finally {
    state.busy = false;
    renderAll();
  }
}

async function onReset() {
  if (state.busy) return;
  if (!window.confirm('새 게임을 시작할까요?')) return;
  state.busy = true;
  updateEnabled();
  try {
    loadSession(await api('POST', '/api/reset'));
    showBanner('');
  } catch (e) {
    showBanner(e.message);
  } finally {
    state.busy = false;
    renderAll();
  }
}

async function init() {
  $('ask-form').addEventListener('submit', onAsk);
  $('final-form').addEventListener('submit', onFinal);
  $('reset-btn').addEventListener('click', onReset);
  try {
    loadSession(await api('GET', '/api/session'));
  } catch (e) {
    showBanner('세션을 불러오지 못했습니다: ' + e.message);
  }
}

init();
