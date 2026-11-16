/**
 * Shamir Secret Sharing di GF(256)
 * Polinomial tak tereduksi: x^8 + x^4 + x^3 + x + 1  = 0x11b
 *
 * Referensi: Shamir, A. (1979). "How to share a secret."
 */

const POLY = 0x11b;

// --- Aritmetika GF(256) ---

function gfAdd(a: number, b: number): number {
  return a ^ b;
}

function gfMul(a: number, b: number): number {
  let p = 0;
  let hi: number;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= POLY & 0xff;
    b >>= 1;
  }
  return p;
}

function gfPow(base: number, exp: number): number {
  let result = 1;
  for (let i = 0; i < exp; i++) result = gfMul(result, base);
  return result;
}

function gfInv(a: number): number {
  if (a === 0) throw new Error("GF invers dari 0 tidak terdefinisi");
  return gfPow(a, 254); // Fermat: a^(2^8 - 2) = a^-1 di GF(256)
}

function gfDiv(a: number, b: number): number {
  return gfMul(a, gfInv(b));
}

// Evaluasi polinom di titik x
function evalPoly(coeffs: Uint8Array, x: number): number {
  let result = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = gfAdd(gfMul(result, x), coeffs[i]);
  }
  return result;
}

// --- Publik API ---

export interface Share {
  x: number;         // indeks (1..N)
  y: Uint8Array;     // nilai evaluasi polinom per byte
}

/**
 * Memecah `secret` menjadi N bagian dengan ambang K.
 * Minimal K bagian dibutuhkan untuk memulihkan rahasia.
 */
export function split(secret: Uint8Array, n: number, k: number): Share[] {
  if (k < 2 || n < k || n > 255) {
    throw new Error(`Parameter tidak valid: 2 ≤ K (${k}) ≤ N (${n}) ≤ 255`);
  }

  const len = secret.length;
  const shares: Share[] = Array.from({ length: n }, (_, i) => ({
    x: i + 1,
    y: new Uint8Array(len),
  }));

  const coeffBuf = new Uint8Array(k - 1);

  for (let byteIdx = 0; byteIdx < len; byteIdx++) {
    // Koefisien acak kriptografis
    crypto.getRandomValues(coeffBuf);
    // coeffs[0] = byte rahasia, coeffs[1..k-1] = acak
    const coeffs = new Uint8Array(k);
    coeffs[0] = secret[byteIdx];
    for (let i = 1; i < k; i++) coeffs[i] = coeffBuf[i - 1];

    for (let si = 0; si < n; si++) {
      shares[si].y[byteIdx] = evalPoly(coeffs, shares[si].x);
    }
  }

  return shares;
}

/**
 * Memulihkan rahasia dari minimal K bagian menggunakan interpolasi Lagrange di x=0.
 */
export function combine(shares: Share[]): Uint8Array {
  if (shares.length === 0) throw new Error("Tidak ada bagian yang diberikan");

  const len = shares[0].y.length;
  const secret = new Uint8Array(len);

  for (let byteIdx = 0; byteIdx < len; byteIdx++) {
    // Interpolasi Lagrange di x=0
    let value = 0;
    for (let i = 0; i < shares.length; i++) {
      let num = shares[i].y[byteIdx];
      let den = 1;
      for (let j = 0; j < shares.length; j++) {
        if (i === j) continue;
        // num *= (0 - x_j) = x_j  (di GF(256), -x = x)
        num = gfMul(num, shares[j].x);
        // den *= (x_i - x_j)
        den = gfMul(den, gfAdd(shares[i].x, shares[j].x));
      }
      value = gfAdd(value, gfDiv(num, den));
    }
    secret[byteIdx] = value;
  }

  return secret;
}

