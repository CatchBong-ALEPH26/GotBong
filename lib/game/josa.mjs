// 한국어 조사 처리. 이름이 게임마다 바뀌므로 받침 유무로 조사를 고른다.

const PAIRS = {
  '이/가': ['이', '가'],
  '을/를': ['을', '를'],
  '은/는': ['은', '는'],
  '과/와': ['과', '와'],
  '이랑/랑': ['이랑', '랑'],
  '아/야': ['아', '야'],
  '으로/로': ['으로', '로'],
  '이에요/예요': ['이에요', '예요'],
  '이었/였': ['이었', '였']
};

// 숫자를 한국어로 읽었을 때의 종성 (영 일 이 삼 사 오 육 칠 팔 구). ㄹ = 8.
const DIGIT_JONG = { 0: 21, 1: 8, 2: 0, 3: 16, 4: 0, 5: 0, 6: 1, 7: 8, 8: 8, 9: 0 };

/**
 * 마지막 글자의 종성 인덱스 (0 = 받침 없음, 8 = ㄹ). 판단할 수 없으면 null.
 * 끝의 공백·괄호·문장부호는 건너뛰고, 숫자는 읽는 소리로 판단한다.
 */
export function finalConsonant(word) {
  const last = String(word).replace(/[\s.,!?~'"()[\]{}<>「」『』…·-]+$/u, '').slice(-1);
  if (/[0-9]/.test(last)) return DIGIT_JONG[last];
  const code = last.charCodeAt(0);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return null;
  return (code - 0xac00) % 28;
}

export function josa(word, pair) {
  const forms = PAIRS[pair];
  if (!forms) throw new Error('지원하지 않는 조사: ' + pair);
  const jong = finalConsonant(word);
  // 영문 등 받침을 알 수 없으면 두 형태를 함께 쓴다 (예: Kim이(가))
  if (jong === null) return word + forms[0] + '(' + forms[1] + ')';
  // '으로/로'는 ㄹ 받침 뒤에서도 '로'
  const withBatchim = jong !== 0 && !(pair === '으로/로' && jong === 8);
  return word + (withBatchim ? forms[0] : forms[1]);
}

/**
 * 템플릿 치환. `{key}` → 값, `{key|이/가}` → 값+조사.
 * 정의되지 않은 키는 오류로 처리해 오타를 조기에 잡는다.
 */
export function fill(template, vars) {
  return template.replace(/\{(\w+)(?:\|([^}]+))?\}/g, (_, key, pair) => {
    if (!(key in vars)) throw new Error('템플릿 변수 없음: ' + key);
    return pair ? josa(vars[key], pair) : vars[key];
  });
}

/** 성을 뺀 이름. 한 글자 이름(닉네임)은 그대로. */
export function givenName(fullName) {
  return fullName.length >= 3 ? fullName.slice(1) : fullName;
}
