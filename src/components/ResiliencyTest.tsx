"use client";

import { useState, useCallback } from "react";
import { CheckCircle2, XCircle, Play, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
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
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  const runTest = useCallback(async () => {
    setLoading(true);
    setResults(null);
    setProgress("Mengekstrak data dari PNG...");

    try {
      const extracted: { x: number; data: Uint8Array; setId: Uint8Array; k: number; n: number }[] = [];
      for (const { x, blob } of pngBlobs) {
        const r = await extractShare(blob);
        if (!r) throw new Error(`Gagal ekstrak bagian #${x}`);
        extracted.push({ x, data: r.shareData, setId: r.header.setId, k: r.header.k, n: r.header.n });
      }

      const allResults: TestResult[] = [];
      const n = pngBlobs.length;

      for (let size = 1; size <= n; size++) {
        const combos = subsets(extracted, size);
        setProgress(`Menguji kombinasi subset (${size}/${n})...`);

        for (const combo of combos) {
          const indices = combo.map((c) => c.x);
          try {
            const ref = combo[0];
            for (const c of combo.slice(1)) {
              if (!uint8Equal(c.setId, ref.setId)) throw new Error("ID set tidak cocok");
            }

            if (combo.length < ref.k) {
              allResults.push({
                indices,
                success: false,
                error: `Bagian kurang (${combo.length}/${ref.k})`,
              });
              continue;
            }

            const shares: Share[] = combo.map((c) => ({ x: c.x, y: c.data }));
            const payload = combine(shares);
            const { meta } = unwrapPayload(payload);
            if (!meta.type) throw new Error("Format payload rusak");

            allResults.push({ indices, success: true });
          } catch (e) {
            allResults.push({
              indices,
              success: false,
              error: e instanceof Error ? e.message : String(e),
            });
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
  }, [pngBlobs]);

  if (pngBlobs.length === 0) return null;

  const totalCombinations = Math.pow(2, pngBlobs.length) - 1;
  const successes = results?.filter((r) => r.success).length ?? 0;
  const failures = results?.filter((r) => !r.success).length ?? 0;

  // Kelompokkan per ukuran bagian yang tersisa
  const bySize: Map<number, TestResult[]> = new Map();
  if (results) {
    for (const r of results) {
      const sz = r.indices.length;
      if (!bySize.has(sz)) bySize.set(sz, []);
      bySize.get(sz)!.push(r);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-zinc-100/60"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-200/80 text-zinc-700">
            <span className="text-xs font-mono font-semibold">2ⁿ</span>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-900">
              Uji Semua Kombinasi ({totalCombinations} Subset)
            </h4>
            <p className="text-[11px] text-zinc-500">
              Verifikasi apakah rahasia pulih saat ≥ {threshold} bagian dan terkunci saat &lt; {threshold} bagian
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-zinc-400">
          <span className="text-xs">{isOpen ? "Tutup" : "Buka"}</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-zinc-200/80 p-4 space-y-4 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-zinc-600 leading-relaxed max-w-md">
              Sistem mengekstrak bit LSB langsung dari gambar PNG hasil, lalu menguji apakah setiap
              kombinasi $\ge K$ pulih sempurna dan $&lt; K$ gagal total.
            </p>
            <button
              type="button"
              onClick={runTest}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white transition-all hover:bg-zinc-800 disabled:opacity-50 flex-shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{progress || "Menguji..."}</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Mulai Pengujian</span>
                </>
              )}
            </button>
          </div>

          {results && (
            <div className="space-y-3 pt-2">
              {/* Ringkasan Skor */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-lg font-bold">{successes}</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 font-medium mt-0.5">
                    Kombinasi Berhasil (≥ {threshold} bagian)
                  </p>
                </div>

                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-zinc-700">
                    <XCircle className="h-4 w-4 text-zinc-400" />
                    <span className="text-lg font-bold">{failures}</span>
                  </div>
                  <p className="text-[11px] text-zinc-600 font-medium mt-0.5">
                    Kombinasi Ditolak (&lt; {threshold} bagian)
                  </p>
                </div>
              </div>

              {/* Tabel Replikasi Hasil Proposal (Tabel 3 & Gambar 5) */}
              <div className="overflow-hidden rounded-lg border border-zinc-200 text-xs">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 text-zinc-600 border-b border-zinc-200 text-[11px] uppercase tracking-wider font-semibold">
                      <th className="px-3 py-2 text-left">Bagian Tersisa</th>
                      <th className="px-3 py-2 text-center">Hilang</th>
                      <th className="px-3 py-2 text-center">Kombinasi</th>
                      <th className="px-3 py-2 text-center">Hasil</th>
                      <th className="px-3 py-2 text-center">Teori</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {Array.from(bySize.entries())
                      .sort(([a], [b]) => b - a)
                      .map(([size, rows]) => {
                        const ok = rows.filter((r) => r.success).length;
                        const isSufficient = size >= threshold;
                        const matchedTheory = isSufficient ? ok === rows.length : ok === 0;

                        return (
                          <tr key={size} className="hover:bg-zinc-50/50">
                            <td className="px-3 py-2 font-mono font-medium text-zinc-900">
                              {size} {isSufficient ? (
                                <span className="text-[10px] text-emerald-600 ml-1 font-sans font-semibold">
                                  (≥ K)
                                </span>
                              ) : (
                                <span className="text-[10px] text-zinc-400 ml-1 font-sans">
                                  (&lt; K)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center text-zinc-500 font-mono">
                              {pngBlobs.length - size}
                            </td>
                            <td className="px-3 py-2 text-center text-zinc-600 font-mono">
                              {rows.length}
                            </td>
                            <td className="px-3 py-2 text-center font-mono">
                              <span
                                className={`font-semibold ${
                                  isSufficient ? "text-emerald-600" : "text-zinc-500"
                                }`}
                              >
                                {ok} / {rows.length}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              {matchedTheory ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                  <CheckCircle2 className="h-3 w-3" />
                                  100% Sesuai
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                                  <XCircle className="h-3 w-3" />
                                  Penyimpangan
                                </span>
                              )}
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
      )}
    </div>
  );
}
