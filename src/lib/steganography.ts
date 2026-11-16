/**
 * Steganografi LSB pada gambar PNG menggunakan Canvas API.
 *
 * Kapasitas: piksel × 3 bit (kanal R, G, B — alfa dilewati).
 * Header: 13 byte pertama berisi metadata bagian.
 */

import { type Share } from "./shamir";
import { buildHeader, parseHeader, type EmbedHeader } from "./utils";

/** Hasil ekstraksi dari satu gambar PNG */
export interface ExtractResult {
  header: EmbedHeader;
  shareData: Uint8Array;
}

/** Menulis bit ke stream bit LSB (R,G,B per piksel) */
function writeBits(pixels: Uint8ClampedArray, bitOffset: number, data: Uint8Array): void {
  let bit = bitOffset;
  for (let i = 0; i < data.length; i++) {
    for (let b = 7; b >= 0; b--) {
      const pixelIdx = Math.floor(bit / 3);
      const channelIdx = bit % 3; // 0=R, 1=G, 2=B
      const baseIdx = pixelIdx * 4 + channelIdx;
      const dataBit = (data[i] >> b) & 1;
      pixels[baseIdx] = (pixels[baseIdx] & 0xfe) | dataBit;
      bit++;
    }
  }
}

/** Membaca bit dari stream bit LSB (R,G,B per piksel) */
function readBits(pixels: Uint8ClampedArray, bitOffset: number, byteCount: number): Uint8Array {
  const result = new Uint8Array(byteCount);
  let bit = bitOffset;
  for (let i = 0; i < byteCount; i++) {
    let byte = 0;
    for (let b = 7; b >= 0; b--) {
      const pixelIdx = Math.floor(bit / 3);
      const channelIdx = bit % 3;
      const baseIdx = pixelIdx * 4 + channelIdx;
      const dataBit = pixels[baseIdx] & 1;
      byte |= dataBit << b;
      bit++;
    }
    result[i] = byte;
  }
  return result;
}

/** Membuat gambar sampul gradien otomatis jika tidak ada sampul */
function createGradientCover(width: number, height: number): ImageData {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, `hsl(${Math.random() * 360},70%,70%)`);
  grad.addColorStop(1, `hsl(${Math.random() * 360},70%,50%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Menyisipkan satu bagian (share) ke dalam gambar PNG.
 *
 * @param coverBlob  Blob gambar sampul (PNG/JPEG) atau null untuk sampul otomatis
 * @param share      Bagian hasil split Shamir
 * @param n          Jumlah total bagian
 * @param k          Ambang pemulihan
 * @param setId      ID set acak (4 byte)
 * @returns          Blob PNG hasil penyisipan
 */
export async function embedShare(
  coverBlob: Blob | null,
  share: Share,
  n: number,
  k: number,
  setId: Uint8Array
): Promise<Blob> {
  // Hitung kebutuhan kapasitas
  const header = buildHeader(setId, n, k, share.x, share.y.length);
  const totalBytes = header.length + share.y.length;
  const totalBitsNeeded = totalBytes * 8;
  const pixelsNeeded = Math.ceil(totalBitsNeeded / 3);

  let imageData: ImageData;

  if (coverBlob) {
    // Muat gambar sampul
    const bitmap = await createImageBitmap(coverBlob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    // Latar putih untuk tangani piksel transparan
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();

    if (bitmap.width * bitmap.height < pixelsNeeded) {
      throw new Error(
        `Gambar sampul terlalu kecil. Butuh minimal ${pixelsNeeded} piksel, gambar memiliki ${bitmap.width * bitmap.height} piksel.`
      );
    }
  } else {
    // Buat sampul gradien otomatis
    const side = Math.ceil(Math.sqrt(pixelsNeeded)) + 10;
    imageData = createGradientCover(side, side);
  }

  const pixels = imageData.data;

  // Tulis header lalu data bagian
  writeBits(pixels, 0, header);
  writeBits(pixels, header.length * 8, share.y);

  // Isi sisa LSB dengan bit acak agar tampak seragam
  const usedBits = totalBitsNeeded;
  const totalBitsAvail = (imageData.width * imageData.height) * 3;
  if (usedBits < totalBitsAvail) {
    const paddingBytes = Math.ceil((totalBitsAvail - usedBits) / 8);
    const padding = new Uint8Array(paddingBytes);
    crypto.getRandomValues(padding);
    writeBits(pixels, usedBits, padding);
  }

  // Export PNG
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

/**
 * Mengekstrak bagian (share) dari gambar PNG.
 *
 * @param pngBlob  Blob gambar PNG yang mengandung bagian tersembunyi
 * @returns        Header dan data bagian, atau null jika bukan gambar valid
 */
export async function extractShare(pngBlob: Blob): Promise<ExtractResult | null> {
  const bitmap = await createImageBitmap(pngBlob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  // Baca 13 byte header
  const headerBytes = readBits(pixels, 0, 13);
  const header = parseHeader(headerBytes);
  if (!header) return null; // Bukan gambar yang valid

  // Baca data bagian
  const shareData = readBits(pixels, 13 * 8, header.dataLength);

  return { header, shareData };
}

