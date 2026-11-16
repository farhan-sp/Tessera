/**
 * Utilitas: format header 13 byte dan payload wrapper.
 */

// --- Header 13 byte ---
// [0-1]  : Penanda "HX" (0x48 0x58)
// [2-5]  : ID set acak (4 byte)
// [6]    : N (jumlah bagian)
// [7]    : K (ambang pemulihan)
// [8]    : x (indeks bagian, 1..N)
// [9-12] : panjang data bagian (uint32 big-endian)

export interface EmbedHeader {
  setId: Uint8Array;   // 4 byte
  n: number;
  k: number;
  x: number;
  dataLength: number;
}

export function buildHeader(
  setId: Uint8Array,
  n: number,
  k: number,
  x: number,
  dataLength: number
): Uint8Array {
  const buf = new Uint8Array(13);
  buf[0] = 0x48; // 'H'
  buf[1] = 0x58; // 'X'
  buf[2] = setId[0];
  buf[3] = setId[1];
  buf[4] = setId[2];
  buf[5] = setId[3];
  buf[6] = n;
  buf[7] = k;
  buf[8] = x;
  // panjang data: big-endian uint32
  buf[9]  = (dataLength >>> 24) & 0xff;
  buf[10] = (dataLength >>> 16) & 0xff;
  buf[11] = (dataLength >>> 8)  & 0xff;
  buf[12] = dataLength & 0xff;
  return buf;
}

export function parseHeader(bytes: Uint8Array): EmbedHeader | null {
  if (bytes.length < 13) return null;
  if (bytes[0] !== 0x48 || bytes[1] !== 0x58) return null; // bukan "HX"

  const setId = bytes.slice(2, 6);
  const n = bytes[6];
  const k = bytes[7];
  const x = bytes[8];
  const dataLength =
    (bytes[9] << 24) | (bytes[10] << 16) | (bytes[11] << 8) | bytes[12];

  if (n < 2 || k < 2 || k > n || x < 1 || x > n || dataLength <= 0) return null;

  return { setId, n, k, x, dataLength };
}

/** Membuat ID set acak 4 byte */
export function generateSetId(): Uint8Array {
  const id = new Uint8Array(4);
  crypto.getRandomValues(id);
  return id;
}

/** Membandingkan dua Uint8Array byte per byte */
export function uint8Equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// --- Payload Wrapper ---

export interface PayloadMeta {
  type: "text" | "image";
  filename?: string;
  mimeType?: string;
}

/** Membungkus metadata + data menjadi satu payload byte array */
export function wrapPayload(meta: PayloadMeta, data: Uint8Array): Uint8Array {
  const metaJson = JSON.stringify(meta);
  const metaBytes = new TextEncoder().encode(metaJson);
  const buf = new Uint8Array(4 + metaBytes.length + data.length);
  const view = new DataView(buf.buffer);
  view.setUint32(0, metaBytes.length, false); // big-endian
  buf.set(metaBytes, 4);
  buf.set(data, 4 + metaBytes.length);
  return buf;
}

/** Membuka payload menjadi metadata + data */
export function unwrapPayload(payload: Uint8Array): { meta: PayloadMeta; data: Uint8Array } {
  const view = new DataView(payload.buffer);
  const metaLen = view.getUint32(0, false);
  const metaBytes = payload.slice(4, 4 + metaLen);
  const meta: PayloadMeta = JSON.parse(new TextDecoder().decode(metaBytes));
  const data = payload.slice(4 + metaLen);
  return { meta, data };
}

/** Format bytes menjadi string yang mudah dibaca */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Menghitung semua subset dengan ukuran tertentu (untuk uji ketahanan) */
export function subsets<T>(arr: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (arr.length < size) return [];
  const [first, ...rest] = arr;
  const withFirst = subsets(rest, size - 1).map((s) => [first, ...s]);
  const withoutFirst = subsets(rest, size);
  return [...withFirst, ...withoutFirst];
}
