"use client";

import { useState, useCallback } from "react";
import { split } from "@/lib/shamir";
import { embedShare } from "@/lib/steganography";
import {
  wrapPayload,
  generateSetId,
  formatBytes,
  type PayloadMeta,
} from "@/lib/utils";
import ShareCard from "./ShareCard";

interface ShareResult {
  x: number;
  blob: Blob;
  url: string;
}

export default function HideTab() {
  const [secretType, setSecretType] = useState<"text" | "image">("text");
  const [secretText, setSecretText] = useState("");
  const [secretFile, setSecretFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [n, setN] = useState(5);
  const [k, setK] = useState(3);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<ShareResult[]>([]);
  const [error, setError] = useState("");

  const MAX_BYTES = 256 * 1024; // 256 KB

  const handleHide = useCallback(async () => {
    setError("");
    setResults([]);
    setLoading(true);

    try {
      // 1. Siapkan payload
      let rawData: Uint8Array;
      let meta: PayloadMeta;

      if (secretType === "text") {
        if (!secretText.trim()) throw new Error("Masukkan teks rahasia.");
        rawData = new TextEncoder().encode(secretText);
        meta = { type: "text" };
      } else {
        if (!secretFile) throw new Error("Pilih file gambar rahasia.");
        const buf = await secretFile.arrayBuffer();
        rawData = new Uint8Array(buf);
        meta = { type: "image", filename: secretFile.name, mimeType: secretFile.type };
      }

      const payload = wrapPayload(meta, rawData);
      if (payload.length > MAX_BYTES) {
        throw new Error(
          `Payload terlalu besar (${formatBytes(payload.length)}). Maksimal 256 KB.`
        );
      }

      // 2. Split Shamir
      setProgress("Memecah rahasia dengan Shamir GF(256)...");
      const shares = split(payload, n, k);

      // 3. Embed ke gambar
      const setId = generateSetId();
      const coverBlob = coverFile ? new Blob([await coverFile.arrayBuffer()], { type: coverFile.type }) : null;

      const shareResults: ShareResult[] = [];
      for (let i = 0; i < shares.length; i++) {
        setProgress(`Menyisipkan bagian ${i + 1}/${n} ke gambar...`);
        const blob = await embedShare(coverBlob, shares[i], n, k, setId);
        const url = URL.createObjectURL(blob);
        shareResults.push({ x: shares[i].x, blob, url });
      }

      setResults(shareResults);
      setProgress("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [secretType, secretText, secretFile, coverFile, n, k]);

  return (
    <div className="space-y-6">
      {/* Jenis Rahasia */}
      <div className="flex gap-4">
        <button
          onClick={() => setSecretType("text")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            secretType === "text"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Teks
        </button>
        <button
          onClick={() => setSecretType("image")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            secretType === "image"
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Gambar
        </button>
      </div>

      {/* Input Rahasia */}
      {secretType === "text" ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Teks Rahasia
          </label>
          <textarea
            value={secretText}
            onChange={(e) => setSecretText(e.target.value)}
            rows={5}
            placeholder="Masukkan teks, kunci enkripsi, kata sandi, dll..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            {new TextEncoder().encode(secretText).length} / 262144 byte
          </p>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            File Gambar Rahasia
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setSecretFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
          {secretFile && (
            <p className="text-xs text-gray-400 mt-1">
              {secretFile.name} · {formatBytes(secretFile.size)}
            </p>
          )}
        </div>
      )}

      {/* Parameter N dan K */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            N — Jumlah bagian
          </label>
          <input
            type="number"
            min={2}
            max={20}
            value={n}
            onChange={(e) => {
              const val = Math.min(20, Math.max(2, parseInt(e.target.value) || 2));
              setN(val);
              if (k > val) setK(val);
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-400 mt-1">Berapa gambar PNG dihasilkan (2–20)</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            K — Ambang pemulihan
          </label>
          <input
            type="number"
            min={2}
            max={n}
            value={k}
            onChange={(e) => {
              const val = Math.min(n, Math.max(2, parseInt(e.target.value) || 2));
              setK(val);
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-gray-400 mt-1">Minimal gambar untuk pulihkan (2–N)</p>
        </div>
      </div>

      {/* Info threshold */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <span className="font-semibold">{n - k} gambar boleh hilang.</span>{" "}
        Rahasia pulih dari <span className="font-semibold">sembarang {k}</span> dari {n} gambar.
        {k < n && (
          <span> Kurang dari {k} gambar tidak memberikan informasi apapun tentang rahasia.</span>
        )}
      </div>

      {/* Gambar Sampul (Opsional) */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Gambar Sampul (Opsional)
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
        />
        <p className="text-xs text-gray-400 mt-1">
          Jika tidak dipilih, gambar gradien otomatis akan dibuat. Gunakan gambar PNG/JPEG yang cukup besar.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tombol Proses */}
      <button
        onClick={handleHide}
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold py-3 rounded-lg transition-colors"
      >
        {loading ? progress || "Memproses..." : `🔒 Pecah & Sembunyikan (N=${n}, K=${k})`}
      </button>

      {/* Hasil */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-gray-800">
            Hasil — {results.length} Gambar PNG
          </h3>
          <div className="grid gap-3">
            {results.map((r) => (
              <ShareCard key={r.x} index={r.x} total={n} threshold={k} url={r.url} blob={r.blob} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
