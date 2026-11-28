// 방과후 탐정단 v3.6 — 랜섬웨어 사건. 화면과 진상 모두 게임용 가상 서술이다.
// 공통 캐릭터를 유지하기 위해 엔진 내부 ID는 A=자랑, B=초조, C=심부름, D=불씨로 고정한다.
// 각 세션에서 ID에 배정되는 사람은 무작위이며 alibi는 A/B 두 갈래다.
export const SCENARIO_VERSION = 'ransomware-v3.6';
export const ROLE_NAMES = Object.freeze({ A: '자랑', B: '초조', C: '심부름', D: '불씨' });
export const ALIBIS = Object.freeze(['A', 'B']);
export const FIXED_VICTIM = '홍정민 강사님';

export const intro = [
  '점심시간이 끝난 오후 2시쯤, 식사를 마치고 강의실로 돌아온 홍정민 강사님은 다음 강의를 준비하려고 늘 하던 대로 바탕화면의 크롬 아이콘을 눌렀습니다.',
  '그런데 화면이 한 번 깜빡이더니 파일 이름 뒤에 낯선 글자가 줄줄이 붙기 시작했습니다. 아이콘은 하나둘 흰 빈 문서로 바뀌었고, 바탕화면에는 누군가 장난처럼 남긴 안내문 파일이 생겼습니다.',
  '강사님은 점심시간(1시~2시) 내내 자리를 비웠습니다. 그 사이 누군가 강사님 컴퓨터에 손을 댄 것이 분명합니다. 그날 학원에 있던 수강생은 네 명입니다. 현장을 살펴보고 네 사람에게 질문해서 범인과 그 동기를 밝혀 주세요.',
  '질문은 20번까지 할 수 있고, 현장 조사는 질문 횟수에 포함되지 않습니다.'
].join('\n');

export const clues = [
  {id:'shortcut', title:'크롬 바로가기 속성', form:'window', spot:'pc-chrome', detail:"이름: Chrome\n실행 경로: 크롬 설치 폴더가 아닌 '공용 문서' 폴더의 파일\n바로가기 만든 날짜: 오늘 1시 10분쯤\n그 파일의 속성: 만든 날짜 오늘 1시 10분쯤 / 복사해 온 곳 'PowerBank'"},
  {id:'usblog', title:'USB 접속 기록', form:'window', spot:'pc-devices', detail:'① {C}의 USB / 저장장치 / 32GB / 오늘 10시쯤 연결, 10시 반쯤 해제\n② PowerBank / 저장장치 / 1TB / 오늘 1시 5분쯤 연결, 1시 20분쯤 해제'},
  {id:'mentoring', title:'멘토링 신청표', form:'paper', spot:'mentoring-sheet', detail:'전날 3시: {A}\n전날 4시 반: {D}\n나머지 두 명은 다른 날'},
  {id:'usb', title:'키보드 옆 32GB USB', form:'object', spot:'desk-usb', detail:'32GB USB\n뒷면 이름 스티커: {C}\n파일이 하나도 없다.'},
  {id:'message', title:'스마트폰의 푸념 메시지', form:'phone', spot:null, detail:'전날 밤 9시쯤\n{D} → {A}: 포폴 이렇게 할 거면 딴 거 알아보래. 사람들 다 듣는 데서. 그냥은 못 넘어가.'},
];
export const clueIds = clues.map(c=>c.id);
export const SPOT_TO_CLUE = Object.freeze(Object.fromEntries(clues.filter(c=>c.spot).map(c=>[c.spot,c.id])));
export const culprit = 'D';
export const chatMessages = { victim: '', A: '', B: '', C: '' };
export const materials = {
  receipt: {role:'A',form:'paper',title:'식당 영수증',factIds:['a_receipt_a','a_receipt_b'], text:{A:'주문 1시쯤 2인분\n추가 주문 1시 40분쯤 1인분\n결제 1시 50분쯤',B:'주문 1시쯤 2인분\n결제 1시 50분쯤'}},
  studylog: {role:'B',form:'paper',title:'자습실 이용 기록',factIds:['b_studylog'],text:'{B} 12시 40분쯤 입실\n1시 반쯤 외출\n1시 40분쯤 재입실'},
  submit: {role:'B',form:'phone',title:'제출 완료 알림',factIds:['b_submit'],text:'방어전 자료 1시 25분쯤 제출 완료'},
  savelog: {role:'D',form:'files',title:'포폴 저장 기록',branch:'B',factIds:['d_savelog_b'],text:'포폴_최종.pptx / 12시 55분쯤 저장\n포폴_최종.pptx / 1시 50분쯤 저장'}
};

// 기존 해금 파이프라인과 호환되는 fact 구조. branch 태그가 있는 사실은 같은 알리바이 세션에서만 유효하다.
const fact=(id, say, x={})=>({id,say,...(x.start?{}:{after:[]}),...x});
export const roles = {
  A: {
    title:'칭찬받은 사람',
    publicMotive:'멘토링에서 칭찬을 받았다고 자랑한다.',
    situation:'전날 3시 멘토링을 받았다. 점심에는 {C}와 식당에 있었다.',
    unknown:['강사님 PC에서 무슨 일이 있었는지','PowerBank의 소유자와 쓰임'],
    never:['{D}의 범행을 직접 목격했다고 말하지 않는다.', '멘토링 신청표를 보여 주기 전에는 받은 푸념 메시지 내용을 누설하지 않는다.', '다른 알리바이 분기의 사실을 이야기하지 않는다.'],
    facts:[
      fact('a_praise','강사님이 내 포폴을 잘했다고 칭찬하셨다.',{start:true}),
      fact('a_lunch_a','{C}와 식당으로 갔다. {D}도 식당 앞까지 왔지만 충전기를 두고 왔다며 돌아가 1시 40분쯤 왔다.',{branch:'A',start:true}),
      fact('a_lunch_b','{C}와 식당으로 갔다. {D}는 포폴을 고친다며 식당에 오지 않았다.',{branch:'B',start:true}),
      fact('a_receipt_a','영수증에는 1시 2인분, 1시 40분 1인분 추가 주문, 1시 50분 결제가 적혀 있다.',{branch:'A',start:true,elements:['식당 영수증','1시 40분 추가 주문'],basis:'점심 행적이나 영수증을 직접 물으면 보여 준다.',keywords:['영수증','식당','점심'],sayMaterial:'receipt'}),
      fact('a_receipt_b','영수증에는 1시 2인분, 1시 50분 결제가 적혀 있다. 추가 주문은 없다.',{branch:'B',start:true,elements:['식당 영수증','1시 2인분'],basis:'점심 행적이나 영수증을 직접 물으면 보여 준다.',keywords:['영수증','식당','점심'],sayMaterial:'receipt'}),
      fact('a_correction','사실 칭찬 뒤에 여기는 고치세요라는 지적도 들었다. {D}는 자기 멘토링 뒤 한참 말이 없었다.',{tier:'important',needs:'clue:mentoring',elements:['멘토링 신청표','지적과 반응'],basis:'멘토링 신청표를 제시하고 당시의 멘토링을 물어야 한다.',keywords:['멘토링','신청표','지적'],hint:'칭찬과 함께 받은 지적 및 {D}의 반응'}),
      fact('a_message','{D}가 전날 밤 9시쯤 푸념 메시지를 보냈다. 자신의 포폴이 모욕당했고 그냥은 못 넘어가겠다고 했다. 자기 스마트폰의 개인 메신저 화면을 보여 준다.',{tier:'important',needs:'clue:mentoring',elements:['{D}의 밤 메시지','스마트폰'],basis:'멘토링을 물으며 신청표를 제시한 뒤 메시지를 보여 달라고 물으면 공개한다.',keywords:['메시지','푸념','폰'],hint:'{D}가 자기 스마트폰에 보낸 메시지'})
    ]
  },
  B: {
    title:'배탈 난 사람',publicMotive:'방어전 자료 제출 때문에 점심을 걸렀다.',situation:'12시 40분부터 강의실과 떨어진 자습실에 있었다.',
    unknown:['가방 든 뒷모습의 주인이 누구인지','강사님 자리에서 무슨 일이 있었는지'],
    never:['가방을 든 사람이 {D}였다고 단정하지 않는다.','강사님 자리에서 범행을 봤다고 말하지 않는다.'],
    facts:[
      fact('b_study','점심엔 방어전 자료 제출 때문에 강의실과 떨어진 자습실에 있었다.',{start:true}),
      fact('b_studylog','자습실 이용 기록에는 12시 40분 입실, 1시 30분 외출, 1시 40분 재입실이라고 적혀 있다.',{start:true,elements:['자습실 기록','입실과 외출 시간'],basis:'점심 때 어디 있었는지 묻거나 자습실 이용 기록을 보여 달라고 한다.',keywords:['자습실','기록','점심'],sayMaterial:'studylog'}),
      fact('b_submit','방어전 자료는 1시 25분쯤 제출했고 휴대폰으로 제출 완료 알림을 받았다.',{start:true,elements:['방어전 제출','1시 25분'],basis:'점심을 거른 이유나 자료 제출을 물으면 말한다.',keywords:['제출','방어전'],sayMaterial:'submit'}),
      fact('b_witness','배탈 때문에 1시 반쯤 화장실에 가다가 가방을 들고 계단 쪽으로 가는 누군가의 뒷모습을 봤다. 1시 40분 전쯤 강의실을 들여다보니 {D}의 자리가 비어 있었다. 가방 든 사람의 신원은 모른다.',{tier:'important',after:['b_studylog'],elements:['화장실 동선','{D}의 빈자리'],basis:'자습실 기록의 외출 시간에 어디 갔는지 다시 물으면 말한다.',keywords:['외출','화장실','자리','봤'],hint:'화장실에 갈 때 본 뒷모습과 빈자리'})
    ]
  },
  C: {
    title:'USB를 두고 온 사람',publicMotive:'오전에 강사님 부탁으로 USB로 자료를 옮겼다.',situation:'오전에 강사님 PC에 자신의 USB를 연결한 뒤 두고 왔다. 점심엔 {A}와 식당에서 먹었다.',
    unknown:['강사님 PC에서 누가 무엇을 변경했는지'],
    never:['보조배터리처럼 보인 장치를 자신이 꽂았다고 말하지 않는다.','털어놓은 목격 내용보다 더 많이 본 것처럼 말하지 않는다.'],
    facts:[
      fact('c_usb_morning','오전 10시쯤 강사님 부탁으로 내 32GB USB를 연결해 자료를 옮겼다. 끝난 뒤 비웠다.',{start:true}),
      fact('c_lunch','1시부터 {A}와 식당에 있었다. 점심엔 계속 식당에 있었다.',{start:true,revokedBy:['c_witness_a','c_witness_b']}),
      fact('c_witness_a','USB를 찾으려고 1시 15분 넘어서 돌아갔다가 강사님 의자에서 {D}와 마주쳤다. {D}가 충전 중이라고 했고, 본체에 검은 보조배터리처럼 생긴 물건이 있었다. 당황해 USB는 못 가져왔다.',{branch:'A',tier:'important',needs:{any:['clue:usblog','clue:usb']},elements:['강사님 의자','{D}의 얼굴과 장치'],basis:'USB 접속 기록이나 빈 USB를 내밀며 점심에 되찾으러 갔는지 물어야 한다.',keywords:['USB','가져','찾','점심'],hint:'USB를 찾으러 갔다가 마주친 사람'}),
      fact('c_witness_b','USB를 찾으려고 1시 15분 넘어서 돌아갔다가 강사님 의자에 앉은 우리 반 학생의 뒷모습을 봤다. 누군지는 모른다. 본체에 검은 보조배터리 같은 것이 꽂혀 있었다.',{branch:'B',tier:'important',needs:{any:['clue:usblog','clue:usb']},elements:['강사님 의자','뒷모습과 장치'],basis:'USB 접속 기록이나 빈 USB를 내밀며 점심에 되찾으러 갔는지 물어야 한다.',keywords:['USB','찾','자리','점심'],hint:'USB를 찾으러 갔다가 본 학생의 뒷모습'}),
      fact('c_usb_reason','오전 내 USB는 자료를 옮긴 뒤 비운 것이다. 챙겨 가라는 강사님 말씀을 잊었고, 혼날까 봐 뒤늦게 찾으러 갔다.',{tier:'normal',needs:{all:['clue:usblog','clue:usb']},elements:['USB가 빈 이유','오전 자료 전달'],basis:'USB와 접속 기록을 비교해 두 자료가 왜 다른지 물으면 인정한다.',keywords:['USB','비었','기록','오전'],hint:'두고 온 USB가 비어 있는 이유'})
    ]
  },
  D: {
    title:'범인',publicMotive:'전날 강사님과 포트폴리오 멘토링을 받았다.',situation:'자존심이 강하고 모욕감을 숨긴다. 사실을 인정할수록 답이 짧아진다.',
    unknown:['{B}가 자습실에 남아 있던 것'],
    never:['범행이 입증되기 전에 누가 범인인지 실토하지 않는다.', '모욕감을 느꼈다는 사실만으로 범행을 시인하지 않는다.', '실제 악성코드 제작·배포 방법을 설명하지 않는다.', '다른 갈래의 사실을 말하지 않는다.'],
    facts:[
      fact('d_alibi_a','점심시간에는 처음부터 {A}, {C}와 같이 식당에서 밥을 먹었다.',{branch:'A',start:true,revokedBy:['d_stage1_a','d_stage2_a','d_stage3_a']}),
      fact('d_alibi_b','점심시간 내내 내 자리에서 포폴을 고쳤다. 저장 기록도 있다.',{branch:'B',start:true,revokedBy:['d_stage1_b','d_stage2_b','d_stage3_b']}),
      fact('d_mood','멘토링은 평범했다. 크게 신경 쓰지 않았다.',{start:true,revokedBy:['d_motive_a','d_motive_b']}),
      fact('d_savelog_b','포폴 파일을 12시 55분과 1시 50분에 저장했다. 그 사이엔 저장 기록이 없다.',{branch:'B',tier:'normal',elements:['포폴 저장 기록','두 저장 시각'],basis:'포폴 파일 저장 기록을 보여 달라고 직접 물으면 보여 준다.',keywords:['저장','기록','포폴'],sayMaterial:'savelog'}),
      fact('d_stage1_a','사실 1시에 충전기를 찾으려고 식당에서 혼자 돌아갔다. 처음부터 같이 밥 먹은 건 아니다.',{branch:'A',tier:'important',needs:{any:['cite:a_lunch_a','cite:a_receipt_a']},elements:['1시 충전기 핑계','1시 40분 식당 복귀'],basis:'식당 영수증의 추가 주문 또는 {A}의 점심 증언을 제시하며 물으면 인정한다.',keywords:['식당','영수증','추가 주문','돌아'],hint:'식당에서 잠깐 혼자 빠졌던 사실'}),
      fact('d_stage1_b','사실 포폴 저장 두 번 사이에는 자리를 비웠다. 내내 자리에서 작업한 것은 아니다.',{branch:'B',tier:'important',after:['d_savelog_b'],needs:'cite:b_witness',elements:['1시 40분 전 빈자리','저장 기록 사이 공백'],basis:'포폴 저장 기록과 {B}의 빈자리 목격을 함께 제시하며 물으면 인정한다.',keywords:['저장','공백','빈자리'],hint:'저장 기록 사이에 자리를 비운 사실'}),
      fact('d_stage2_a','강사님 자리에도 갔다. {C}가 봤다는 사람이 나다. 보조배터리가 다 달아서 강사님 컴퓨터에 잠깐 꽂아 충전했을 뿐이다.',{branch:'A',tier:'important',revokedBy:['d_stage3_a'],needs:'cite:c_witness_a',elements:['강사님 자리','{C}의 얼굴 목격'],basis:'{C}가 자신을 직접 봤다는 증언을 제시하며 따지면 인정한다.',keywords:['강사님 자리','목격','충전'],hint:'강사님 자리에 있었던 사실'}),
      fact('d_stage2_b','화장실에만 다녀온 게 아니다. 그 시간에 강사님 자리에도 갔었다. 보조배터리가 다 달아서 강사님 컴퓨터에 잠깐 꽂아 충전했을 뿐이다.',{branch:'B',tier:'important',revokedBy:['d_stage3_b'],after:['d_savelog_b'],needs:{all:['cite:c_witness_b',{any:['cite:a_lunch_b','cite:a_receipt_b']},'cite:b_studylog','cite:b_witness']},elements:['강사님 자리','뒷모습과 다른 사람의 알리바이'],basis:'뒷모습 목격과 나머지 사람들의 위치가 기록으로 확인되는 상황에서 따지면 인정한다.',keywords:['뒷모습','알리바이','강사님 자리'],hint:'강사님 자리에 있었던 사실'}),
      fact('d_stage3_a','PowerBank는 보조배터리가 아닌 저장장치다. 내가 그 장치에서 가져온 파일과 가짜 크롬 바로가기로 사건을 일으켰다.',{branch:'A',tier:'core',needs:{all:['clue:shortcut','clue:usblog','cite:c_witness_a']},elements:['PowerBank의 기록','가짜 바로가기 속성'],basis:'강사님 자리 목격과 1TB 저장장치 및 바로가기 속성을 연결해 추궁하면 인정한다.',keywords:['PowerBank','저장장치','바로가기'],hint:'보조배터리라는 마지막 거짓말'}),
      fact('d_stage3_b','PowerBank는 보조배터리가 아닌 저장장치다. 내가 그 장치에서 가져온 파일과 가짜 크롬 바로가기로 사건을 일으켰다.',{branch:'B',tier:'core',after:['d_savelog_b'],needs:{all:['clue:shortcut','clue:usblog','cite:c_witness_b',{any:['cite:a_lunch_b','cite:a_receipt_b']},'cite:b_studylog','cite:b_witness']},elements:['PowerBank의 기록','가짜 바로가기 속성'],basis:'강사님 자리의 목격, 나머지 사람들의 알리바이, 저장장치와 바로가기 속성을 연결하면 인정한다.',keywords:['PowerBank','저장장치','바로가기'],hint:'보조배터리라는 마지막 거짓말'}),
      fact('d_motive_a','사람들 앞에서 포폴을 무시당해서 화가 났다. 강사님도 당해 보라고 복수했다. 이제는 그 정도로 할 일은 아니었다고 생각한다.',{branch:'A',tier:'core',after:['d_stage3_a'],needs:{all:['clue:mentoring','clue:message']},elements:['멘토링 공개 모욕','복수 동기'],basis:'범행 인정 뒤 멘토링 신청표와 푸념 메시지를 제시하고 이유를 물으면 말한다.',keywords:['멘토링','메시지','복수'],hint:'공개 모욕에 대한 복수의 동기'}),
      fact('d_motive_b','사람들 앞에서 포폴을 무시당해서 화가 났다. 강사님도 당해 보라고 복수했다. 이제는 그 정도로 할 일은 아니었다고 생각한다.',{branch:'B',tier:'core',after:['d_stage3_b'],needs:{all:['clue:mentoring','clue:message']},elements:['멘토링 공개 모욕','복수 동기'],basis:'범행 인정 뒤 멘토링 신청표와 푸념 메시지를 제시하고 이유를 물으면 말한다.',keywords:['멘토링','메시지','복수'],hint:'공개 모욕에 대한 복수의 동기'})
    ]
  }
};
export const roleIds = Object.keys(roles);
export const contradictions = [
  {id:'M01-A',branch:'A',fact:'d_stage1_a',title:'식당 알리바이의 빈틈'},
  {id:'M01-B',branch:'B',fact:'d_stage1_b',title:'포폴 저장 기록의 공백'},
  {id:'M02',branch:'A',fact:'d_stage2_a',title:'강사님 자리 목격'},
  {id:'M02',branch:'B',fact:'d_stage2_b',title:'강사님 자리 목격'},
  {id:'M03',branch:'A',fact:'d_stage3_a',title:'PowerBank의 정체'},
  {id:'M03',branch:'B',fact:'d_stage3_b',title:'PowerBank의 정체'},
  {id:'M04',branch:'A',fact:'d_motive_a',title:'모욕과 복수'},
  {id:'M04',branch:'B',fact:'d_motive_b',title:'모욕과 복수'},
  {id:'O01',fact:'c_usb_reason',title:'오전 USB의 주인'},
  {id:'O02',fact:'b_witness',title:'초조의 화장실 동선'}
];
export const motive = '홍정민 강사님에게 공개 멘토링에서 포트폴리오를 모욕당한 것이 원인이며, 그에 대한 복수로 사건을 일으켰다.';
export const truth = [
  '범인은 {D}입니다. 피해자는 홍정민 강사님입니다.',
  '전날 {A}는 오후 3시 멘토링에서 칭찬과 수정 의견을 함께 들었지만 칭찬만 자랑했습니다. 오후 4시 반 {D}는 여러 사람 앞에서 포트폴리오를 심하게 지적받아 모욕감을 느꼈습니다. {A}는 멍하니 있던 {D}를 봤고 밤 9시에 푸념 메시지를 받았습니다.',
  '그날 밤 {D}는 보조배터리처럼 보이지만 실제로는 1TB 저장장치인 PowerBank를 준비했습니다.',
  '당일 오전 {C}는 강사님 부탁으로 자료 전달용 USB를 연결했다가 키보드 옆에 두고 갔습니다. {B}는 12시 40분부터 자습실에서 자료를 제출하고 있었습니다.',
  '{D}는 점심시간인 1시 5분쯤 강사님 PC에 PowerBank를 연결했고 1시 10분쯤 바로가기가 변경되었습니다. 1시 20분쯤 장치를 뽑았습니다. {C}는 1시 18분쯤 강사님 자리에서 사람과 장치를 목격했습니다.',
  '{branchTruth}',
  '2시 강사님이 바탕화면의 크롬 바로가기를 클릭한 뒤 파일의 모습이 변하고 사건이 발생했습니다. {D}는 공개 멘토링에서 받은 모욕감을 복수의 이유로 삼았습니다.',
  '다른 사람들도 각자의 행동을 숨겼지만 사건을 일으킨 것은 {D}뿐입니다.'
].join('\n\n');
export const caseKeywords = ['PowerBank','USB','멘토링','포폴','크롬','식당','자습실','1시','저장','모욕','랜섬웨어'];

export const normalizeAlibi = value => ALIBIS.includes(value) ? value : 'A';
export function availableFacts(roleId, branch) {
  if (!ALIBIS.includes(branch)) throw new Error('알리바이 값 오류');
  return roles[roleId].facts.filter(f=>!f.branch||f.branch===branch);
}
// shown: 이 NPC가 이미 보여 준 자료 id. 같은 자료를 매번 다시 띄우지 않고, 한 답에 둘이 나오면 다음 답에서 나머지를 보여 준다.
export function getMaterial(factIds, branch, vars, replace, shown = []) {
  const found=Object.entries(materials).find(([id,x])=>!shown.includes(id)&&(!x.branch||x.branch===branch)&&x.factIds.some(f=>factIds.includes(f)));
  if(!found) return null;
  const [id,m]=found;
  return {id,form:m.form,title:m.title,text:replace(typeof m.text==='string'?m.text:m.text[branch],vars)};
}
export function scoreGrade(correct, solvedIds) {
  if(!correct)return 'C';
  const solved=new Set(solvedIds);
  const core=['M01','M02','M03','M04'];
  const all=core.every(k=>[...solved].some(s=>s===k||s.startsWith(k+'-')));
  if(!all)return 'B';
  return ['O01','O02'].every(k=>solved.has(k))?'S':'A';
}
