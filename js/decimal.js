/* 정확한 십진 계산. 숫자를 BigInt 분수(분자/분모)로 들고 다녀서 0.1 + 0.2 같은 오차가 없다.
   반올림은 파이썬 Decimal 의 ROUND_HALF_UP 과 같다 (0.5는 0에서 먼 쪽으로). */

function gcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

const TEN = 10n;
const NUMBER_TEXT = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

export class Dec {
  constructor(n, d = 1n) {
    if (d === 0n) throw new RangeError('0으로 나눌 수 없습니다');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }

  static parse(text) {
    if (text instanceof Dec) return text;
    if (typeof text === 'bigint') return new Dec(text);
    if (typeof text === 'number') {
      if (!Number.isFinite(text)) return null;
      text = String(text);
    }
    if (typeof text !== 'string') return null;
    const clean = text.replace(/[,\s]/g, '');
    if (!NUMBER_TEXT.test(clean)) return null;
    const negative = clean[0] === '-';
    const body = clean.replace(/^[+-]/, '');
    const [whole, fraction = ''] = body.split('.');
    const digits = BigInt((whole || '0') + fraction || '0');
    return new Dec(negative ? -digits : digits, TEN ** BigInt(fraction.length));
  }

  add(o) { o = D(o); return new Dec(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { o = D(o); return new Dec(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { o = D(o); return new Dec(this.n * o.n, this.d * o.d); }
  div(o) { o = D(o); return new Dec(this.n * o.d, this.d * o.n); }
  cmp(o) {
    o = D(o);
    const left = this.n * o.d;
    const right = o.n * this.d;
    return left < right ? -1 : left > right ? 1 : 0;
  }
  sign() { return this.n < 0n ? -1 : this.n > 0n ? 1 : 0; }
  isZero() { return this.n === 0n; }

  /** 소수 places 자리로 반올림 (ROUND_HALF_UP). */
  round(places) {
    const scale = TEN ** BigInt(places);
    const negative = this.n < 0n;
    const numerator = (negative ? -this.n : this.n) * scale;
    let quotient = numerator / this.d;
    const remainder = numerator % this.d;
    if (remainder * 2n >= this.d) quotient += 1n;
    return new Dec(negative ? -quotient : quotient, scale);
  }

  /** 소수 places 자리 문자열 (반올림). 예) toFixed(2) → '106.50' */
  toFixed(places) {
    const rounded = this.round(places);
    const scale = TEN ** BigInt(places);
    let n = rounded.n * (scale / rounded.d);
    const negative = n < 0n;
    if (negative) n = -n;
    let text = n.toString().padStart(places + 1, '0');
    if (places > 0) text = text.slice(0, -places) + '.' + text.slice(-places);
    return (negative && n !== 0n ? '-' : '') + text;
  }

  /** 끝의 0을 뺀 문자열 (최대 places 자리). 예) 1250.50 → '1250.5' */
  toPlain(places = 2) {
    const text = this.toFixed(places);
    return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
  }

  /** 소수 자릿수 (정확히 끝나는 수일 때). 2·5 말고 다른 인수가 분모에 있으면 Infinity. */
  decimals() {
    let d = this.d;
    let count2 = 0;
    let count5 = 0;
    while (d % 2n === 0n) { d /= 2n; count2 += 1; }
    while (d % 5n === 0n) { d /= 5n; count5 += 1; }
    return d === 1n ? Math.max(count2, count5) : Infinity;
  }

  toString() { return this.toPlain(10); }
}

/** 문자열·숫자·Dec 를 Dec 로. 잘못된 값이면 오류. */
export function D(value) {
  const parsed = Dec.parse(value);
  if (parsed === null) throw new TypeError('숫자가 아닙니다: ' + value);
  return parsed;
}

export function decMin(a, b) { return D(a).cmp(b) <= 0 ? D(a) : D(b); }
export function decMax(a, b) { return D(a).cmp(b) >= 0 ? D(a) : D(b); }

export const ZERO = new Dec(0n);
export const HUNDRED = new Dec(100n);

/** 화면용: 천 단위 쉼표. places 가 있으면 그 자리까지 고정, 없으면 끝의 0을 뺀다(최대 2자리). */
export function formatNumber(value, places = null) {
  if (value === null || value === undefined || value === '') return '';
  const dec = D(value);
  const text = places === null ? dec.toPlain(2) : dec.toFixed(places);
  const negative = text.startsWith('-');
  const [whole, fraction] = text.replace('-', '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (negative ? '-' : '') + grouped + (fraction !== undefined ? '.' + fraction : '');
}
