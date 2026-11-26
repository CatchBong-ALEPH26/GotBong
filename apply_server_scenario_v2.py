#!/usr/bin/env python3
"""Apply Ghost Keyboard v2 contradiction tracking to a local GotBong checkout.

Usage:
  python apply_ghost_v2.py /path/to/GotBong --check
  python apply_ghost_v2.py /path/to/GotBong --apply

This is deliberately strict: no matching anchor means no files are written.
Writes only source/tests on your local disk. No git push, D1 migration or AI call.
"""
from __future__ import annotations
import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

class PatchError(Exception):
    pass


def once(s: str, old: str, new: str, file: str) -> str:
    n = s.count(old)
    if n != 1:
        raise PatchError(f"{file}: 예상한 코드 조각이 정확히 1개여야 합니다 (현재 {n}개): {old[:100]!r}")
    return s.replace(old, new, 1)


def require(s: str, old: str, file: str):
    if old not in s:
        raise PatchError(f"{file}: 기반 코드가 예상과 다릅니다: {old[:80]!r}")


def modify_case(s: str, p: str) -> str:
    s = once(s, '네 사람 모두 "{victim} 컴퓨터는 건드린 적 없다"고 말한다.', '네 사람 모두 "{victim}의 룰렛 프로그램은 없앤 적 없다"고 말한다.', p)
    s = once(s, "    id: 'chat', title: '단체 대화방 (09:30)',\n    detail: '{chatlog}'\n  }\n];",
    "    id: 'chat', title: '단체 대화방 (09:30)',\n    detail: '{chatlog}'\n  },\n  {\n    id: 'c_front_usb', title: '앞쪽 USB의 충전선',\n    detail: '{victim}의 본체 앞쪽 USB 포트에 약 30cm 길이의 짧은 휴대폰 충전선이 연결돼 있다. 본체 뒤쪽에서 발견된 무선 키보드 수신기와는 위치도 종류도 다르다.'\n  }\n];", p)
    s = once(s,
       "화면만 보고 금방 나왔고 아무것도 만지지 않았다.' },",
       "실행 중인 룰렛 화면을 사진 한 장 찍고 금방 나왔다. 아무것도 만지지는 않았다.' },", p)
    s = once(s, "      { id: 'a_receipt', tier: 'normal', after: ['a_testimony'],",
    "      { id: 'a_photo', tier: 'normal', after: ['a_testimony'],\n        elements: ['언제: 09:53', '무엇을: 피해자 모니터의 룰렛 실행 장면 사진', '무엇을: 삭제 장면은 아님'],\n        basis: '교실에 들어왔던 A에게 그때 화면을 사진으로 남겼는지 묻는 질문',\n        keywords: ['사진', '찍었', '모니터'],\n        say: '09:53에 룰렛이 켜진 화면을 찍은 사진이 있다. 삭제 순간을 찍은 건 아니다.' },\n      { id: 'a_receipt', tier: 'normal', after: ['a_testimony'],", p)
    s = once(s, "      { id: 'b_typing', tier: 'important', after: [],",
    "      { id: 'b_compare', tier: 'normal', after: ['b_source'],\n        elements: ['무엇을: 피해자 코드와 자신의 코드를 비교', '결과: 표절이라는 확실한 근거는 찾지 못함'],\n        basis: '소스 열람을 인정한 B에게 코드 비교 결과를 구체적으로 물음',\n        needs: 'clue:source',\n        keywords: ['비교', '표절', '공통'],\n        say: '두 코드를 비교해 봤지만 공통 예제와 비슷한 부분 말고, 베꼈다고 단정할 만한 증거는 없었다. 허락 없이 열어 본 건 잘못했다.' },\n      { id: 'b_typing', tier: 'important', after: [],", p)
    s = once(s, "elements: ['무엇을: 충전 케이블이 엉킨 적 없음', '누가: 케이블을 정리해 줬다는 사람', '언제: 정수기에 다녀온 동안'],",
      "elements: ['무엇을: 짧은 충전선을 본체 앞쪽 USB에 연결', '무엇을: 본체 뒤쪽까지 닿지 않음', '무엇을: 충전 케이블이 엉킨 적 없음'],", p)
    s = once(s, "say: '케이블은 엉킨 적 없다. 정수기에 다녀왔을 때 꽂아 둔 그대로였다. 정수기에 간 동안은 자리에 없었으니, 누가 그때 내 케이블을 정리해 줬다는 말은 말이 안 된다.' }",
      "say: '그건 짧은 충전선이라 본체 앞쪽 USB에 꽂았어요. 뒤쪽까지 닿지도 않는데 뒤에서 엉켰다니 이상하잖아요. 정수기에 다녀왔을 때도 그대로였어요.' },\n      { id: 'c_usb_distinction', tier: 'important', after: ['c_cable'],\n        elements: ['무엇을: 앞쪽 휴대폰 충전선과 뒤쪽 무선 수신기는 다른 장치', '어디서: 서로 다른 USB 포트'],\n        basis: 'C의 앞쪽 충전선과 뒤쪽 수신기 단서를 모두 제시하고 두 장치가 같은 것인지 따져 묻는 질문',\n        needs: { all: ['clue:c_front_usb', 'clue:receiver'] },\n        requiredEvidence: { all: ['clue:c_front_usb', 'clue:receiver'] },\n        keywords: ['앞쪽', '뒤쪽', '수신기', 'USB'],\n        say: '제가 꽂은 건 앞쪽 휴대폰 충전선이에요. 뒤쪽의 무선 키보드 수신기는 제 충전선과 다른 장치예요. 누가 거기 꽂았는지는 못 봤어요.' }", p)
    s = once(s, "      { id: 'd_cable_excuse', tier: 'normal', after: [],",
     "      { id: 'd_no_typing_claim', start: true, revokedBy: ['d_delete'],\n        say: '빌드가 시작된 뒤에는 키보드를 건드리지도 않았다. (거짓말이다)' },\n      { id: 'd_cable_excuse', tier: 'normal', after: [],", p)
    s = once(s, "needs: 'cite:a_testimony',\n        keywords: ['본체 뒤',", "needs: 'cite:a_testimony',\n        requiredEvidence: 'cite:a_testimony',\n        keywords: ['본체 뒤',", p)
    s = once(s, "needs: { all: ['cite:c_cable', 'clue:receiver'] },\n        keywords:", "needs: { all: ['cite:c_cable', 'clue:receiver'] },\n        requiredEvidence: { all: ['cite:c_cable', 'clue:receiver'] },\n        keywords:", p)
    s = once(s, "needs: { all: [{ any: ['cite:b_typing', 'clue:build'] }, 'clue:trash'] },\n        keywords:", "needs: { all: [{ any: ['cite:b_typing', 'clue:build'] }, 'clue:trash'] },\n        requiredEvidence: { all: ['cite:b_typing', 'clue:trash'] },\n        keywords:", p)
    s = once(s, "needs: 'clue:chat',\n        keywords: ['왜 그랬'", "needs: 'clue:chat',\n        requiredEvidence: 'clue:chat',\n        keywords: ['왜 그랬'", p)
    s = once(s, "  '본체', '키보드', '쉬는 시간'", "  '사진', '비교', '충전선', '앞쪽', '뒤쪽', '본체', '키보드', '쉬는 시간'", p)
    return s


def modify_game(s: str, p: str) -> str:
    s = once(s,
      "export function clueAtSpot(game, spot) {\n  const m = /^monitor-([a-z0-9_-]{1,40})$/.exec(spot);\n  if (!m) return null;\n  return game.cast[scenario.culprit] === m[1] ? 'build' : null;\n}",
      "export const STATIC_CLUE_SPOTS = {\n  'desk-folder': 'trash', 'desk-trash': 'trash', 'desk-recent': 'source',\n  'desk-chat': 'chat', receiver: 'receiver', board: 'receiver',\n  'front-usb': 'c_front_usb'\n};\n\nexport function clueAtSpot(game, spot) {\n  if (Object.hasOwn(STATIC_CLUE_SPOTS, spot)) return STATIC_CLUE_SPOTS[spot];\n  const m = /^monitor-([a-z0-9_-]{1,40})$/.exec(spot);\n  if (!m) return null;\n  return game.cast[scenario.culprit] === m[1] ? 'build' : null;\n}", p)
    s = once(s,
       "export function initialState() {\n  return Object.fromEntries(roleIds.map(r => [r, {\n    unlocked: roles[r].facts.filter(f => f.start).map(f => f.id),\n    evidence: []\n  }]));\n}",
       "export function initialState() {\n  const charactersState = Object.fromEntries(roleIds.map(r => [r, {\n    unlocked: roles[r].facts.filter(f => f.start).map(f => f.id),\n    evidence: []\n  }]));\n  return { ...charactersState, investigation: { discoveredClues: [], solvedContradictions: [] } };\n}", p)
    s = once(s,
       "const status = f.start ? 'start'\n      : state.unlocked.includes(f.id) ? 'opened'\n      : (f.after ?? []).every(id => state.unlocked.includes(id)) ? 'available' : 'blocked';",
       "const requiredMet = evaluate(f.requiredEvidence, shown);\n    const status = f.start ? 'start'\n      : state.unlocked.includes(f.id) ? 'opened'\n      : (f.after ?? []).every(id => state.unlocked.includes(id)) && requiredMet ? 'available' : 'blocked';", p)
    s = once(s,
      "missingAfter: (f.after ?? []).filter(id => !state.unlocked.includes(id))",
      "missingAfter: [...(f.after ?? []).filter(id => !state.unlocked.includes(id)), ...(requiredMet ? [] : ['필수 근거 제시'])]", p)
    return s


def modify_question(s: str, p: str) -> str:
    s = once(s, 'import { runQuestion } from "../../../lib/ai/pipeline.mjs";',
      'import { runQuestion } from "../../../lib/ai/pipeline.mjs";\nimport { hasDiscoveredClue, recordContradictions, publicInvestigation } from "../../../lib/game/contradictions.mjs";', p)
    s = once(s,
      '    if (!clueIds.includes(attach.id)) {\n      throw new GameHttpError(400, "없는 단서입니다.");\n    }',
      '    if (!clueIds.includes(attach.id)) {\n      throw new GameHttpError(400, "없는 단서입니다.");\n    }\n    if (!hasDiscoveredClue(game.state, attach.id)) {\n      throw new GameHttpError(400, "아직 현장에서 발견하지 않은 단서입니다.");\n    }', p)
    s = once(s,
      '    // 9. NPC 대화 데이터 생성\n    const turn = {',
      '    // 9. 검증된 이번 공개 사실과 NPC에게 실제로 제시한 증거로만 공식 모순 해결\n    const nextState = { ...game.state, [roleId]: answer.state };\n    const progress = recordContradictions(nextState, answer.disclosed);\n\n    // 10. NPC 대화 데이터 생성\n    const turn = {', p)
    s = once(s, '      ...(thought ? { thought } : {}),\n    };',
      '      ...(thought ? { thought } : {}),\n      ...(progress.newlySolved.length ? { newlySolved: progress.newlySolved } : {}),\n      investigation: publicInvestigation(progress.state),\n    };', p)
    s = once(s,
      '        state: {\n          ...game.state,\n          [roleId]: answer.state,\n        },',
      '        state: progress.state,', p)
    return s


def modify_session(s: str, p: str) -> str:
    s = once(s, 'import { publicCase } from "../../../lib/game/game.mjs";',
       'import { publicCase } from "../../../lib/game/game.mjs";\nimport { publicInvestigation } from "../../../lib/game/contradictions.mjs";', p)
    s = once(s, '      ...publicCase(game),\n      mode,',
       '      ...publicCase(game),\n      investigation: publicInvestigation(game.state),\n      mode,', p)
    return s


def modify_reset(s: str, p: str) -> str:
    s = once(s, 'import { publicCase } from "../../../lib/game/game.mjs";',
      'import { publicCase } from "../../../lib/game/game.mjs";\nimport { publicInvestigation } from "../../../lib/game/contradictions.mjs";', p)
    s = once(s, '      ...publicCase(game),\n      mode,',
       '      ...publicCase(game),\n      investigation: publicInvestigation(game.state),\n      mode,', p)
    return s


def modify_scene(s: str, p: str) -> str:
    s = once(s, '  chat: { icon: icon(8), place: "{victim}의 메신저", order: 930, timeLabel: "09:30" },',
      '  chat: { icon: icon(8), place: "{victim}의 메신저", order: 930, timeLabel: "09:30" },\n  c_front_usb: { icon: icon(3), place: "{victim} 본체 앞쪽 USB", order: null },', p)
    s = once(s, '  "desk-chat": "chat",\n  receiver: "receiver",',
      '  "desk-chat": "chat",\n  "front-usb": "c_front_usb",\n  receiver: "receiver",', p)
    s = once(s, 'export const HINT_ORDER = ["trash", "receiver", "source", "chat", "build"];',
      'export const HINT_ORDER = ["trash", "receiver", "source", "chat", "build", "c_front_usb"];', p)
    return s


def modify_types(s: str, p: str) -> str:
    s = once(s, '  contradictions: Contradiction[];\n  report: ReportView | null;',
       '  contradictions: Contradiction[];\n  investigation: { solved: { id: string; title: string; tier: "core" | "optional" }[]; core: number; optional: number };\n  report: ReportView | null;', p)
    return s


def modify_usegame(s: str, p: str) -> str:
    # Minimal API adapter only. GameScreen/Notebook and the AI pipeline remain unchanged.
    s = once(s, 'SPOT_TO_CLUE, ', '', p)
    s = once(s, 'type ServerTurn = { id: string; npc: string; question: string; reply: string; emotion: string; attach: ServerAttach };',
      'type ServerTurn = { id: string; npc: string; question: string; reply: string; emotion: string; attach: ServerAttach };\ntype ServerInvestigation = { discoveredClues: string[]; solved: { id: string; tier: "core" | "optional"; title: string }[]; core: number; optional: number };', p)
    s = once(s, '  clues: { id: string; title: string; detail: string }[];\n  npcs:',
      '  clues: { id: string; title: string; detail: string }[];\n  investigation?: ServerInvestigation;\n  npcs:', p)
    s = once(s, '    setLocal(loadLocal(keyRef.current));',
      '    const saved = loadLocal(keyRef.current);\n    for (const id of s.investigation?.discoveredClues ?? []) {\n      if (!(id in saved.found)) saved.found[id] = Date.now();\n    }\n    setLocal(saved);\n    saveLocal(keyRef.current, saved);', p)
    s = once(s, '    const clues = Object.entries(local.found).flatMap(([id, at]) => clueEvidence(session, id, at, local.spots[id]) ?? []);',
      '    const discovered = new Set(session.investigation?.discoveredClues ?? Object.keys(local.found));\n    const clues = Object.entries(local.found).filter(([id]) => discovered.has(id)).flatMap(([id, at]) => clueEvidence(session, id, at, local.spots[id]) ?? []);', p)
    s = once(s,
      '      clues: session.clues.map((c) => ({ id: c.id, title: c.title, found: c.id in local.found, icon: CLUE_META[c.id]?.icon ?? TESTIMONY_ICON, timeLabel: CLUE_META[c.id]?.timeLabel })),',
      '      clues: session.clues.map((c) => ({ id: c.id, title: c.title, found: discovered.has(c.id), icon: CLUE_META[c.id]?.icon ?? TESTIMONY_ICON, timeLabel: CLUE_META[c.id]?.timeLabel })),', p)
    old = '''      let clueId = SPOT_TO_CLUE[spotId];
      let text = SPOT_TEXT[spotId];
      if (spotId.startsWith("monitor-")) {
        // 어느 사람의 모니터에 단서가 있는지는 범인을 알아야 정할 수 있어서 서버가 판정한다.
        const r = await api<{ clue: { id: string } | null }>("/api/investigate", { spot: spotId });
        if (r.clue) clueId = r.clue.id;
        else text = SPOT_TEXT.monitor;
      }'''
    new = '''      // The server validates every clue spot and persists discovery before it can be attached.
      const fingerprint = JSON.stringify(["i", spotId]);
      const response = await api<{ clue: { id: string } | null; investigation?: ServerInvestigation }>(
        "/api/investigate", { spot: spotId, requestId: requestId(fingerprint) }
      ).catch(markClosed);
      pending.current.delete(fingerprint);
      setSession((prev) => prev && response.investigation ? { ...prev, investigation: response.investigation } : prev);
      const clueId = response.clue?.id;
      const text = clueId ? undefined : spotId.startsWith("monitor-") ? SPOT_TEXT.monitor : SPOT_TEXT[spotId];'''
    s = once(s, old, new, p)
    s = once(s, '      const at = local.found[clueId] ?? Date.now();',
      '      const at = (clueId ? local.found[clueId] : undefined) ?? Date.now();', p)
    s = once(s, '    [local.found, local.spots, update],', '    [local.found, local.spots, update, markClosed],', p)
    s = once(s, 'const r = await api<{ status: "accepted" | "clarify" | "rejected"; turn?: ServerTurn; message?: string; remaining: number; used?: number; thought?: string }>("/api/question", body).catch(markClosed);',
      'const r = await api<{ status: "accepted" | "clarify" | "rejected"; turn?: ServerTurn; message?: string; remaining: number; used?: number; thought?: string; investigation?: ServerInvestigation }>("/api/question", body).catch(markClosed);', p)
    s = once(s, 'setSession((s) => s && { ...s, remaining: r.remaining, turns: s.turns.some((t) => t.id === turn.id) ? s.turns : [...s.turns, turn] });',
      'setSession((s) => s && { ...s, remaining: r.remaining, investigation: r.investigation ?? s.investigation, turns: s.turns.some((t) => t.id === turn.id) ? s.turns : [...s.turns, turn] });', p)
    return s

def modify_notebook(s: str, p: str) -> str:
    s = once(s, '      <h2 className="hand-title">사건 순서</h2>', '''      <h2 className="hand-title">사건 순서</h2>
      <div className="clue-detail" role="region" aria-label="공식 모순 해결 현황">
        <div>
          <b>모순 해결 현황</b>
          <p className="pencil small">핵심 {view.investigation.core}/4 · 선택 {view.investigation.optional}/2</p>
          {view.investigation.solved.length > 0 ? (
            <ul className="memo-list">
              {view.investigation.solved.map((c) => <li key={c.id}><PixelIcon name="pencil" size={12} /> {c.title} · 해결</li>)}
            </ul>
          ) : <p className="pencil small">아직 밝혀낸 모순이 없다. 증거를 내밀고 진술을 확인하자.</p>}
          <p className="pencil small">아래 연필 연결은 개인 메모이고, 이 현황만 서버 검증 결과다.</p>
        </div>
      </div>''', p)
    return s


def modify_gamescreen(s: str, p: str) -> str:
    s = once(s,
      '      setDialog({ kind: "answer", messageId: r.message.id, animate: true, used: r.used, thought: r.thought });',
      '      setDialog({ kind: "answer", messageId: r.message.id, animate: true, used: r.used, thought: r.thought });\n      if (r.newlySolved?.length) {\n        play("found");\n        say(`모순 발견! ${r.newlySolved.map((c) => c.title).join(", ")}`);\n      }', p)
    return s


def modify_api_test(s: str, p: str) -> str:
    s = once(s, 'assert.equal(data.clues.length, 5);', 'assert.equal(data.clues.length, 6);', p)
    s = once(s, "  await ask('hwangyc', '이 기록 설명해 주세요', { type: 'clue', id: 'source' });",
      "  assert.equal((await ask('hwangyc', '이 기록 설명해 주세요', { type: 'clue', id: 'source' })).code, 400, '미발견 단서 첨부 불가');\n  assert.equal((await request('investigate', { spot: 'desk-recent' })).data.clue.id, 'source');\n  await ask('hwangyc', '이 기록 설명해 주세요', { type: 'clue', id: 'source' });", p)
    return s


def modify_game_test(s: str, p: str) -> str:
    # The existing regression test asserts an exact role-fact tier map.
    s = once(s,
      "    a_testimony: 'important', a_receipt: 'normal', b_source: 'normal', b_record: 'normal', b_typing: 'important',",
      "    a_testimony: 'important', a_photo: 'normal', a_receipt: 'normal', b_source: 'normal', b_record: 'normal', b_compare: 'normal', b_typing: 'important',", p)
    s = once(s,
      "    c_why: 'normal', c_roulette: 'normal', c_cable: 'important',",
      "    c_why: 'normal', c_roulette: 'normal', c_cable: 'important', c_usb_distinction: 'important',", p)
    return s


def run(target: Path, apply: bool):
    if not (target / 'AGENTS.md').is_file() or not (target / 'lib/game/data/case.mjs').is_file():
        raise PatchError(f'GotBong 저장소 경로를 확인하세요: {target}')
    if apply:
        try:
            branch = subprocess.check_output(['git', '-C', str(target), 'branch', '--show-current'], text=True, stderr=subprocess.DEVNULL).strip()
            dirty = subprocess.check_output(['git', '-C', str(target), 'status', '--porcelain'], text=True, stderr=subprocess.DEVNULL).strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            raise PatchError('Git 저장소를 지정하고 새 작업 브랜치를 만든 뒤 적용해 주세요.')
        if branch in ('main', 'master', ''):
            raise PatchError('main/master에는 적용하지 않습니다. git switch -c feat/ghost-keyboard-v2-contradictions 후 다시 실행해 주세요.')
        if dirty:
            raise PatchError('미커밋 변경이 있습니다. 변경 내용을 먼저 커밋하거나 임시 보관(stash)해 주세요.')
    edits = {
      'lib/game/data/case.mjs': modify_case,
      'lib/game/game.mjs': modify_game,
      'app/api/question/route.js': modify_question,
      'app/api/session/route.js': modify_session,
      'app/api/reset/route.js': modify_reset,
      'lib/scene/classroom.ts': modify_scene,
      'lib/api/useGame.ts': modify_usegame,
      'test/api.test.mjs': modify_api_test,
      'test/game.test.mjs': modify_game_test
    }
    outputs = {}
    for name, callback in edits.items():
        path = target / name
        if not path.is_file():
            raise PatchError(f'대상 파일 없음: {name}')
        original = path.read_bytes()
        nl = '\r\n' if b'\r\n' in original else '\n'
        source = original.decode('utf-8').replace('\r\n', '\n')
        modified = callback(source, name)
        if modified == source:
            raise PatchError(f'{name}: 변경이 없습니다')
        outputs[name] = modified.replace('\n', nl).encode('utf-8')
    newfiles = {
      'lib/game/contradictions.mjs': ROOT.joinpath('lib_game_contradictions.mjs').read_bytes(),
      'app/api/investigate/route.js': ROOT.joinpath('app_api_investigate_route.js').read_bytes(),
      'test/contradictions.test.mjs': ROOT.joinpath('test_contradictions.test.mjs').read_bytes(),
    }
    require(target.joinpath('app/api/investigate/route.js').read_text(encoding='utf-8'), 'const clueId = clueAtSpot(game, input.spot);', 'app/api/investigate/route.js')
    if target.joinpath('lib/game/contradictions.mjs').exists() or target.joinpath('test/contradictions.test.mjs').exists():
        raise PatchError('이미 v2 신규 파일이 있습니다. 중복 적용하지 마세요.')
    outputs.update(newfiles)
    print(f'사전 검사 통과: {len(outputs)}개 파일 (기존 9개 변경, 신규 2개)')
    for name in outputs:
        print('  ' + name)
    if not apply:
        print('검사만 수행했습니다. --apply 옵션으로 실제 변경할 수 있습니다.')
        return
    backup = target / '.git' / 'gotbong-v2-backup'
    if backup.exists():
        raise PatchError(f'이전 적용 백업 폴더가 있습니다: {backup}')
    backup.mkdir(parents=True)
    for name in outputs:
        dest = target / name
        if dest.exists():
            original = backup / name
            original.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(dest, original)
    for name, content in outputs.items():
        dest = target / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
    print('로컬 적용 완료. 아래 검증을 실행하세요: npm test && npm run build')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('repo', type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    try:
        run(args.repo.resolve(), args.apply)
    except (PatchError, OSError, UnicodeError) as e:
        print('적용 중단:', e, file=sys.stderr)
        sys.exit(1)
