/* 한국어 조사 고르기: 앞말의 받침에 따라 을/를, 이/가, 은/는, 과/와, 으로/로.
   받침을 알 수 없는 끝 글자(영문 소문자, 기호 등)는 '을(를)'처럼 둘 다 적는다. 브라우저 기능은 쓰지 않는다. */

// 숫자는 읽는 소리로: 영 일 이 삼 사 오 육 칠 팔 구. 끝이 0이면 영·십·백·천·만 모두 받침이 있다 (ㄹ 아님).
const DIGIT = ['final', 'rieul', 'none', 'final', 'none', 'none', 'final', 'rieul', 'rieul', 'none'];
// 영문 대문자는 알파벳 이름으로 읽는다 (KPI → 케이피아이). 받침이 있는 것: L(엘) M(엠) N(엔) R(알)
const LETTER = { L: 'rieul', M: 'final', N: 'final', R: 'rieul' };
const SYMBOL = { '%': 'none' };  // 퍼센트

const PAIRS = [['을', '를'], ['이', '가'], ['은', '는'], ['과', '와'], ['으로', '로']];

/** 끝 글자의 받침: 'none' 없음, 'final' 있음(ㄹ 아님), 'rieul' ㄹ, null 알 수 없음 */
export function finalSound(word) {
  const text = String(word ?? '').replace(/[\s)\]}'"’”」』.,!?…]+$/u, '');
  const ch = text.slice(-1);
  if (!ch) return null;
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const index = (code - 0xac00) % 28;
    return index === 0 ? 'none' : index === 8 ? 'rieul' : 'final';
  }
  if (ch >= '0' && ch <= '9') return DIGIT[Number(ch)];
  if (ch >= 'A' && ch <= 'Z') return LETTER[ch] || 'none';
  return SYMBOL[ch] || null;
}

/** 낱말 + 알맞은 조사. 예) josa('목표', '을') → '목표를', josa('시작일', '이') → '시작일이' */
export function josa(word, particle) {
  const pair = PAIRS.find((p) => p.includes(particle));
  if (!pair) throw new Error(`모르는 조사입니다: ${particle}`);
  const sound = finalSound(word);
  if (pair[0] === '으로') {
    if (sound === null) return `${word}(으)로`;
    return word + (sound === 'final' ? '으로' : '로');
  }
  if (sound === null) return `${word}${pair[0]}(${pair[1]})`;
  return word + (sound === 'none' ? pair[1] : pair[0]);
}
