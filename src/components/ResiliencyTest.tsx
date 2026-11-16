"use client";

import { useState, useCallback } from "react";
import { combine, type Share } from "@/lib/shamir";
import { extractShare } from "@/lib/steganography";
import { unwrapPayload, uint8Equal, subsets } from "@/lib/utils";

interface ResiliencyTestProps {
  pngBlobs: { x: number; blob: Blob }[];
  threshold: number;
}

interface TestResult {
  indices: number[];
  success: boolean;
  error?: string;
}

export default function ResiliencyTest({ pngBlobs, threshold }: ResiliencyTestProps) {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  const runTest = useCallback(async () => {
    setLoading(true);
    setResults(null);
    setProgress("Mengekstrak semua bagian...");

    try {
      // Ekstrak semua bagian dulu
      const extracted: { x: number; data: Uint8Array; setId: Uint8Array; k: number; n: number }[] = [];
      for (const { x, blob } of pngBlobs) {
        const r = await extractShare(blob);
        if (!r) throw new Error(`Gagal ekstrak bagian ${x}`);
        extracted.push({ x, data: r.shareData, setId: r.header.setId, k: r.header.k, n: r.header.n });
      }

      const allResults: TestResult[] = [];
      const n = pngBlobs.length;

      // Uji semua subset dari ukuran 1 hingga n
      for (let size = 1; size <= n; size++) {
        const combos = subsets(extracted, size);
        setProgress(`Menguji kombinasi ukuran ${size}/${n} (${combos.length} kombinasi)...`);

        for (const combo of combos) {
          const indices = combo.map((c) => c.x);
          try {
            // Validasi set ID
            const ref = combo[0];
            for (const c of combo.slice(1)) {
              if (!uint8Equal(c.setId, ref.setId)) throw new Error("Set ID berbeda");
            }

            if (combo.length < ref.k) {
              allResults.push({ indices, success: false, error: `Butuh ${ref.k}, hanya ${combo.length}` });
              continue;
            }

            const shares: Share[] = combo.map((c) => ({ x: c.x, y: c.data }));
            const payload = combine(shares);
            const { meta } = unwrapPayload(payload);
            if (!meta.type) throw new Error("Payload tidak valid");

            allResults.push({ indices, success: true });
          } catch (e) {
            allResults.push({ indices, success: false, error: e instanceof Error ? e.message : String(e) });
          }
        }
      }

      setResults(allResults);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setProgress("");
    }
  }, [pngBlobs, threshold]);

  if (pngBlobs.length === 0) return null;

  const successes = results?.filter((r) => r.success).length ?? 0;
  const failures = results?.filter((r) => !r.success).length ?? 0;

  // Kelompokkan per ukuran
  const bySize: Map<number, TestResult[]> = new Map();
  if (results) {
    for (const r of results) {
      const sz = r.indices.length;
      if (!bySize.has(sz)) bySize.set(sz, []);
      bySize.get(sz)!.push(r);
    }
  }

  return (
    <div className="border border-dashed border-purple-300 bg-purple-50 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-purple-800">🧪 Uji Ketahanan Semua Kombinasi</h3>
          <p className="text-xs text-purple-600 mt-0.5">
            Menguji {Math.pow(2, pngBlobs.length) - 1} kombinasi — sesuai prosedur Lampiran 1 proposal
          </p>
        </div>
        <button
          onClick={runTest}
          disabled={loading}
          className="text-sm bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? "Menguji..." : "Jalankan Uji"}
        </button>
      </div>

      {progress && (
        <p className="text-xs text-purple-700 font-mono">{progress}</p>
      )}

      {results && (
        <div className="space-y-3">
          {/* Ringkasan */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-100 border border-green-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{successes}</p>
              <p className="text-xs text-green-600">Kombinasi Berhasil</p>
            </div>
            <div className="bg-red-100 border border-red-200 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{failures}</p>
              <p className="text-xs text-red-600">Kombinasi Gagal (diharapkan)</p>
            </div>
          </div>

          {/* Tabel per ukuran */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-purple-100 text-purple-800">
                  <th className="border border-purple-200 px-3 py-1.5 text-left">Jumlah bagian</th>
                  <th className="border border-purple-200 px-3 py-1.5 text-center">Total</th>
                  <th className="border border-purple-200 px-3 py-1.5 text-center">Berhasil</th>
                  <th className="border border-purple-200 px-3 py-1.5 text-center">Gagal</th>
                  <th className="border border-purple-200 px-3 py-1.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(bySize.entries()).sort(([a], [b]) => a - b).map(([size, rows]) => {
                  const ok = rows.filter((r) => r.success).length;
                  const fail = rows.filter((r) => !r.success).length;
                  const isAboveThreshold = size >= threshold;
                  const statusOk = isAboveThreshold ? ok === rows.length : fail === rows.length;
                  return (
                    <tr key={size} className={statusOk ? "bg-white" : "bg-orange-50"}>
                      <td className="border border-gray-200 px-3 py-1.5 font-mono">
                        {size} {size >= threshold ? <span className="text-green-600">≥ K</span> : <span className="text-red-500">{"< K"}</span>}
                      </td>
                      <td className="border border-gray-200 px-3 py-1.5 text-center">{rows.length}</td>
                      <td className="border border-gray-200 px-3 py-1.5 text-center text-green-700">{ok}</td>
                      <td className="border border-gray-200 px-3 py-1.5 text-center text-red-600">{fail}</td>
                      <td className="border border-gray-200 px-3 py-1.5 text-center">
                        {statusOk ? "✅" : "❌"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
