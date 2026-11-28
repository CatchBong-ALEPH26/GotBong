import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIO_VERSION, ROLE_NAMES, ALIBIS, FIXED_VICTIM, clues, clueIds, SPOT_TO_CLUE,
  contradictions, roles, availableFacts, getMaterial, scoreGrade, truth, intro, materials,
} from '../lib/game/data/ransomware.mjs';

const roster=['kim','won','hwangyc','hwanggh'];
function* perm(a,p=[]){if(a.length===0){yield p;return;}for(let i=0;i<a.length;i++)yield*perm(a.filter((_,j)=>i!==j),[...p,a[i]]);}
const casts=[...perm(roster)];

test('v3.6 is named consistently and contains no solution in the player intro',()=>{
  assert.equal(SCENARIO_VERSION,'ransomware-v3.6');
  assert.equal(FIXED_VICTIM,'홍정민 강사님');
  assert.match(intro,/질문은 20번/);
  assert.doesNotMatch(intro,/PowerBank|불씨|자랑|초조|심부름|멘토링/);
  assert.match(truth,/PowerBank/);
});

test('all 48 casts exist without person duplication or role disclosure',()=>{
  const states=new Set();
  for(const branch of ALIBIS) for(const p of casts){
    const cast={A:p[0],B:p[1],C:p[2],D:p[3],_alibi:branch};
    assert.equal(new Set(Object.values(cast).filter(x=>roster.includes(x))).size,4);
    states.add(JSON.stringify(cast));
  }
  assert.equal(states.size,48);
  assert.deepEqual(Object.keys(ROLE_NAMES),['A','B','C','D']);
});

test('four physical scene clues plus one private messenger clue',()=>{
  assert.equal(clues.length,5);
  assert.equal(new Set(clueIds).size,5);
  assert.deepEqual(Object.keys(SPOT_TO_CLUE).sort(),['desk-usb','mentoring-sheet','pc-chrome','pc-devices']);
  assert.equal(clues.find(c=>c.id==='message').spot,null);
  assert.equal(clues.find(c=>c.id==='message').form,'phone');
  assert.equal(clues.find(c=>c.id==='usb').form,'object');
  assert.equal(clues.find(c=>c.id==='mentoring').form,'paper');
});

test('branch A/B never shares branch-exclusive alibis or witness knowledge',()=>{
  for(const [branch,notBranch] of [['A','B'],['B','A']])for(const id of ['A','B','C','D']){
    const facts=availableFacts(id,branch);
    assert.ok(facts.length);
    assert.ok(facts.every(f=>!f.branch||f.branch===branch));
    assert.ok(facts.every(f=>f.branch!==notBranch));
  }
  assert.match(availableFacts('C','A').find(f=>f.id==='c_witness_a').say,/\{D\}/);
  assert.doesNotMatch(availableFacts('C','B').find(f=>f.id==='c_witness_b').say,/목격한 사람이 \{D\}/);
});

test('branch-specific M01, M02, M03, M04 plus O01 and O02 (six scoring units)',()=>{
  for(const b of ALIBIS){
    const ids=contradictions.filter(x=>!x.branch||x.branch===b).map(x=>x.id);
    assert.equal(ids.length,6);
    assert.equal(new Set(ids).size,6);
    assert.ok(ids.includes(`M01-${b}`));
    for(const id of ['M02','M03','M04','O01','O02']) assert.ok(ids.includes(id));
  }
});

test('motive is gated by proof of action and both clue cards',()=>{
  for(const b of ['a','b']){
    const fact=roles.D.facts.find(f=>f.id===`d_motive_${b}`);
    assert.deepEqual(fact.after,[`d_stage3_${b}`]);
    assert.deepEqual(fact.needs.all,['clue:mentoring','clue:message']);
  }
});

test('witness face is branch A only and branch B relies on exclusion',()=>{
  const a=roles.C.facts.find(f=>f.id==='c_witness_a');
  const b=roles.C.facts.find(f=>f.id==='c_witness_b');
  assert.match(a.say,/\{D\}/);
  assert.doesNotMatch(b.say,/\{D\}/);
  assert.ok(roles.D.facts.find(f=>f.id==='d_stage2_b').needs.all.includes('cite:b_studylog'));
});

test('materials are conversation-only, not additional cards; B has savelog',()=>{
  assert.deepEqual(Object.keys(materials),['receipt','studylog','submit','savelog']);
  const f=(t,v)=>t.replace(/\{([ABCD])\}/g,(_,id)=>v[id]);
  const vars={A:'수강생1',B:'수강생2',C:'수강생3',D:'수강생4'};
  assert.match(getMaterial(['a_receipt_a'],'A',vars,f).text,/추가 주문/);
  assert.doesNotMatch(getMaterial(['a_receipt_b'],'B',vars,f).text,/추가 주문/);
  assert.equal(getMaterial(['d_savelog_b'],'A',vars,f),null);
  assert.match(getMaterial(['d_savelog_b'],'B',vars,f).text,/1시 50분/);
});

test('grade handles zero core contradictions as B not missing',()=>{
  assert.equal(scoreGrade(false,['M01-A','M02','M03','M04','O01','O02']),'C');
  assert.equal(scoreGrade(true,[]),'B');
  assert.equal(scoreGrade(true,['M01-A','M02','M03','M04']),'A');
  assert.equal(scoreGrade(true,['M01-B','M02','M03','M04','O01','O02']),'S');
});
