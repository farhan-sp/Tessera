"use client";

import { useState, useCallback } from "react";
import { combine, type Share } from "@/lib/shamir";
import { extractShare } from "@/lib/steganography";
import { unwrapPayload, uint8Equal } from "@/lib/utils";

interface ExtractedShare {
  filename: string;
  x: number;
  n: number;
  k: number;
  setId: Uint8Array;
  data: Uint8Array;
}

export default function RecoverTab() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ type: "text" | "image"; content: string; filename?: string } | null>(null);

  const handleRecover = useCallback(async () => {
    setError("");
    setResult(null);
    setLoading(true);

    try {
      if (files.length === 0) throw new Error("Pilih minimal satu file PNG.");

      // 1. Ekstrak semua bagian
      const extracted: ExtractedShare[] = [];
      for (let i = 0; i < files.length; i++) {
        setProgress(`Membaca gambar ${i + 1}/${files.length}...`);
        const blob = new Blob([await files[i].arrayBuffer()], { type: files[i].type });
        const result = await extractShare(blob);
        if (!result) {
          throw new Error(`"${files[i].name}" bukan gambar yang mengandung bagian tersembunyi.`);
        }
        extracted.push({
          filename: files[i].name,
          x: result.header.x,
          n: result.header.n,
          k: result.header.k,
          setId: result.header.setId,
          data: result.shareData,
        });
      }

      // 2. Validasi: semua harus dari set yang sama
      const ref = extracted[0];
      for (const s of extracted.slice(1)) {
        if (!uint8Equal(s.setId, ref.setId)) {
          throw new Error(
            `"${s.filename}" berasal dari set yang berbeda — pastikan semua gambar berasal dari satu operasi Sembunyikan yang sama.`
          );
        }
        if (s.n !== ref.n || s.k !== ref.k) {
          throw new Error(`Parameter N atau K tidak konsisten antar file.`);
        }
      }

      // 3. Validasi: tidak ada duplikat x
      const xs = extracted.map((s) => s.x);
      const uniqueXs = new Set(xs);
      if (uniqueXs.size < xs.length) {
        throw new Error("Terdapat bagian duplikat (x yang sama). Gunakan gambar yang berbeda.");
      }

      // 4. Validasi: jumlah bagian unik >= K
      if (uniqueXs.size < ref.k) {
        throw new Error(
          `Hanya ${uniqueXs.size} bagian unik tersedia, sedangkan ${ref.k} dibutuhkan untuk pemulihan.`
        );
      }

      // 5. Combine Shamir
      setProgress("Merekonstruksi rahasia dengan interpolasi Lagrange...");
      const shares: Share[] = extracted.slice(0, ref.k).map((s) => ({ x: s.x, y: s.data }));
      const payload = combine(shares);

      // 6. Unwrap payload
      const { meta, data } = unwrapPayload(payload);

      if (meta.type === "text") {
        const text = new TextDecoder().decode(data);
        setResult({ type: "text", content: text });
      } else {
        const blob = new Blob([data], { type: meta.mimeType ?? "image/png" });
        const url = URL.createObjectURL(blob);
        setResult({ type: "image", content: url, filename: meta.filename });
      }

      setProgress("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [files]);

  return (
    <div className="space-y-6">
      {/* Pilih File */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Pilih File PNG (minimal K file)
        </label>
        <input
          type="file"
          accept="image/png"
          multiple
          onChange={(e) => {
            setFiles(Array.from(e.target.files ?? []));
            setResult(null);
            setError("");
          }}
          className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        />
        {files.length > 0 && (
          <div className="mt-2 space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                <span className="text-indigo-400">📄</span>
                <span className="font-mono">{f.name}</span>
                <span className="text-gray-300">·</span>
                <span>{(f.size / 1024).toFixed(1)} KB</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pesan */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        <span className="font-semibold">Catatan:</span> Gunakan hanya file PNG yang diunduh langsung dari aplikasi ini.
        File yang dikompresi ulang atau dikonversi ke JPEG tidak akan bisa dibaca.
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tombol Pulihkan */}
      <button
        onClick={handleRecover}
        disabled={loading || files.length === 0}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-semibold py-3 rounded-lg transition-colors"
      >
        {loading ? progress || "Memproses..." : "🔓 Pulihkan Rahasia"}
      </button>

      {/* Hasil */}
      {result && (
        <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-emerald-600 text-lg">✅</span>
            <h3 className="font-semibold text-emerald-800">Rahasia Berhasil Dipulihkan</h3>
          </div>

          {result.type === "text" ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Teks rahasia:</label>
              <pre className="bg-white border border-gray-200 rounded-lg p-3 text-sm font-mono whitespace-pre-wrap break-words max-h-64 overflow-auto">
                {result.content}
              </pre>
              <button
                onClick={() => navigator.clipboard.writeText(result.content)}
                className="mt-2 text-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                📋 Salin ke clipboard
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Gambar rahasia {result.filename ? `(${result.filename})` : ""}:
              </label>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.content}
                alt="Gambar rahasia yang dipulihkan"
                className="max-w-full max-h-64 rounded-lg border border-gray-200 object-contain"
              />
              <a
                href={result.content}
                download={result.filename ?? "recovered.png"}
                className="inline-block mt-2 text-xs bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                ⬇ Unduh Gambar
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
