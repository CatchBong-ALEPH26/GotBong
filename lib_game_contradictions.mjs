// Official contradiction tracking for Ghost Keyboard v2.
// The AI may draft dialogue, but only verified, disclosed server facts advance these records.
// Keep the player's pencil links in localStorage separate from official solved records.

export const CONTRADICTIONS = Object.freeze([
  { id: 'core_01', tier: 'core', title: '사라진 30초', role: 'D', fact: 'd_cable_excuse', after: [], evidence: ['cite:a_testimony'] },
  { id: 'core_02', tier: 'core', title: '존재하지 않는 케이블', role: 'D', fact: 'd_receiver', after: ['core_01'], evidence: ['cite:c_cable', 'clue:receiver'] },
  { id: 'core_03', tier: 'core', title: '빌드 중의 키보드', role: 'D', fact: 'd_delete', after: ['core_02'], evidence: ['cite:b_typing', 'clue:trash'] },
  { id: 'core_04', tier: 'core', title: '되갚아 주고 싶었다', role: 'D', fact: 'd_motive', after: ['core_03'], evidence: ['clue:chat'] },
  { id: 'optional_05', tier: 'optional', title: '표절의 진실', role: 'B', fact: 'b_compare', after: [], evidence: ['clue:source'] },
  { id: 'optional_06', tier: 'optional', title: 'USB는 모두 같은가?', role: 'C', fact: 'c_usb_distinction', after: [], evidence: ['clue:c_front_usb', 'clue:receiver'] }
]);

const empty = () => ({ discoveredClues: [], solvedContradictions: [] });
export const investigationOf = state => ({ ...empty(), ...(state?.investigation ?? {}) });
export const hasDiscoveredClue = (state, clueId) => investigationOf(state).discoveredClues.includes(clueId);

export function discoverClue(state, clueId) {
  const old = investigationOf(state);
  if (old.discoveredClues.includes(clueId)) return state;
  return {
    ...state,
    investigation: { ...old, discoveredClues: [...old.discoveredClues, clueId] }
  };
}

/** Only a checked, successful NPC answer can mark an official contradiction as solved. */
export function recordContradictions(state, disclosed = []) {
  const old = investigationOf(state);
  // Use previously solved contradictions for prerequisites. Do not chain stages in one answer.
  const known = new Set(old.solvedContradictions);
  const newlySolved = [];
  for (const rule of CONTRADICTIONS) {
    if (known.has(rule.id) || !disclosed.includes(rule.fact)) continue;
    if (!rule.after.every(id => known.has(id))) continue;
    const npc = state[rule.role];
    if (!npc?.unlocked.includes(rule.fact)) continue;
    if (!rule.evidence.every(id => npc.evidence.includes(id))) continue;
    newlySolved.push({ id: rule.id, tier: rule.tier, title: rule.title });
  }
  if (!newlySolved.length) return { state, newlySolved };
  return {
    state: {
      ...state,
      investigation: {
        ...old,
        solvedContradictions: [...old.solvedContradictions, ...newlySolved.map(x => x.id)]
      }
    },
    newlySolved
  };
}

/** Safe public projection. Never expose an NPC's role or a hidden fact ID. */
export function publicInvestigation(state) {
  const current = investigationOf(state);
  const solved = CONTRADICTIONS.filter(x => current.solvedContradictions.includes(x.id))
    .map(({ id, tier, title }) => ({ id, tier, title }));
  return {
    discoveredClues: [...current.discoveredClues],
    solved,
    core: solved.filter(x => x.tier === 'core').length,
    optional: solved.filter(x => x.tier === 'optional').length
  };
}
