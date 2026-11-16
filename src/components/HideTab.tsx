"use client";

import { useState, useCallback } from "react";
import {
  FileText,
  Image as ImageIcon,
  Shield,
  Download,
  Archive,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  UploadCloud,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { split, combine, type Share } from "@/lib/shamir";
import { embedShare, extractShare } from "@/lib/steganography";
import {
  wrapPayload,
  unwrapPayload,
  generateSetId,
  formatBytes,
  formatSetId,
  createZipFromShares,
  downloadBlob,
  type PayloadMeta,
} from "@/lib/utils";
import ShareCard from "./ShareCard";
import ResiliencyTest from "./ResiliencyTest";

interface ShareResult {
  x: number;
  blob: Blob;
  url: string;
}

export default function HideTab() {
  const [secretType, setSecretType] = useState<"text" | "image">("text");
  const [secretText, setSecretText] = useState("");
  const [secretFile, setSecretFile] = useState<File | null>(null);
  const [showCoverOption, setShowCoverOption] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  // Parameter Shamir
  const [n, setN] = useState(5);
  const [k, setK] = useState(3);

  // States proses
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  // Hasil
  const [results, setResults] = useState<ShareResult[]>([]);
  const [currentSetId, setCurrentSetId] = useState<string>("");
  const [lostIndices, setLostIndices] = useState<Set<number>>(new Set());

  // Simulasi pemulihan cepat in-memory
  const [testResult, setTestResult] = useState<{
    status: "success" | "error";
    message: string;
    content?: string;
  } | null>(null);

  const MAX_BYTES = 256 * 1024; // 256 KB

  // Presets cepat untuk UX sederhana
  const applyPreset = (presetN: number, presetK: number) => {
    setN(presetN);
    setK(presetK);
  };

  const handleToggleLost = (index: number) => {
    setLostIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
    setTestResult(null);
  };

  const handleHide = useCallback(async () => {
    setError("");
    setResults([]);
    setLostIndices(new Set());
    setTestResult(null);
    setLoading(true);

    try {
      let rawData: Uint8Array;
      let meta: PayloadMeta;

      if (secretType === "text") {
        if (!secretText.trim()) throw new Error("Masukkan teks rahasia terlebih dahulu.");
        rawData = new TextEncoder().encode(secretText);
        meta = { type: "text" };
      } else {
        if (!secretFile) throw new Error("Pilih berkas gambar rahasia.");
        const buf = await secretFile.arrayBuffer();
        rawData = new Uint8Array(buf);
        meta = { type: "image", filename: secretFile.name, mimeType: secretFile.type };
      }

      const payload = wrapPayload(meta, rawData);
      if (payload.length > MAX_BYTES) {
        throw new Error(
          `Ukuran payload (${formatBytes(payload.length)}) melebihi batas 256 KB.`
        );
      }

      setProgress("Memecah rahasia dengan polinomial Shamir GF(256)...");
      const shares = split(payload, n, k);

      const setId = generateSetId();
      setCurrentSetId(formatSetId(setId));

      const coverBlob =
        showCoverOption && coverFile
          ? new Blob([await coverFile.arrayBuffer()], { type: coverFile.type })
          : null;

      const shareResults: ShareResult[] = [];
      for (let i = 0; i < shares.length; i++) {
        setProgress(`Menyisipkan LSB ke gambar ${i + 1} dari ${n}...`);
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
  }, [secretType, secretText, secretFile, showCoverOption, coverFile, n, k]);

  // Unduh semua gambar sebagai ZIP
  const handleDownloadAllZip = async () => {
    if (results.length === 0) return;
    const fileList = results.map((r) => ({
      filename: `share_${r.x}_of_${n}_k${k}.png`,
      blob: r.blob,
    }));
    const zipBlob = await createZipFromShares(fileList);
    downloadBlob(zipBlob, `split-key-set-${currentSetId || "shares"}.zip`);
  };

  // Uji pemulihan langsung dari gambar yang tidak ditandai hilang
  const handleDirectTest = async () => {
    setTestResult(null);
    const activeResults = results.filter((r) => !lostIndices.has(r.x));

    if (activeResults.length < k) {
      setTestResult({
        status: "error",
        message: `GAGAL dengan ${activeResults.length} gambar tersisa: Butuh minimal ${k} bagian unik, hanya tersedia ${activeResults.length}.`,
      });
      return;
    }

    try {
      const extractedShares: Share[] = [];
      for (const r of activeResults.slice(0, k)) {
        const ext = await extractShare(r.blob);
        if (!ext) throw new Error(`Gambar #${r.x} tidak terbaca`);
        extractedShares.push({ x: ext.header.x, y: ext.shareData });
      }

      const recoveredPayload = combine(extractedShares);
      const { meta, data } = unwrapPayload(recoveredPayload);

      let textPreview = "";
      if (meta.type === "text") {
        textPreview = new TextDecoder().decode(data);
      } else {
        textPreview = `[Gambar: ${meta.filename || "file"} - ${formatBytes(data.length)}]`;
      }

      setTestResult({
        status: "success",
        message: `BERHASIL: ${activeResults.length} dari ${n} gambar tersisa (${lostIndices.size} hilang). Butuh minimal ${k}.`,
        content: textPreview,
      });
    } catch (e) {
      setTestResult({
        status: "error",
        message: `Uji gagal: ${e instanceof Error ? e.message : "Kesalahan dekripsi"}`,
      });
    }
  };

  const textBytesCount = new TextEncoder().encode(secretText).length;

  return (
    <div className="space-y-6">
      {/* 1. Masukan Rahasia */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-700">
            Data Rahasia
          </label>
          {/* Segmented Switch Teks / Gambar */}
          <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setSecretType("text")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-all ${
                secretType === "text"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Teks</span>
            </button>
            <button
              type="button"
              onClick={() => setSecretType("image")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-all ${
                secretType === "image"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span>Gambar</span>
            </button>
          </div>
        </div>

        {secretType === "text" ? (
          <div className="relative">
            <textarea
              value={secretText}
              onChange={(e) => setSecretText(e.target.value)}
              rows={4}
              placeholder="Ketik rahasia, kunci privat, password akun, atau pesan penting..."
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 p-3.5 text-sm text-zinc-900 placeholder-zinc-400 font-mono transition-colors focus:border-zinc-900 focus:bg-white focus:outline-none"
            />
            <div className="mt-1 flex justify-between text-[11px] text-zinc-400">
              <span>Maksimum 256 KB</span>
              <span className={textBytesCount > MAX_BYTES ? "text-red-500 font-semibold" : ""}>
                {formatBytes(textBytesCount)} / 256 KB
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-5 text-center transition-colors hover:border-zinc-300">
            <input
              type="file"
              accept="image/*"
              id="secret-file-input"
              className="hidden"
              onChange={(e) => setSecretFile(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor="secret-file-input"
              className="flex flex-col items-center justify-center cursor-pointer space-y-2"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-800">
                  {secretFile ? secretFile.name : "Pilih gambar rahasia (PNG / JPEG / WebP)"}
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  {secretFile
                    ? `${formatBytes(secretFile.size)} · Siap dienkripsi`
                    : "Maksimal 256 KB"}
                </p>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Konfigurasi Pembagian Rahasia (N & K) */}
      <div className="space-y-3 pt-1 border-t border-zinc-100">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-zinc-700">
            Ambang Pemulihan (K dari N)
          </label>
          {/* Preset Buttons */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => applyPreset(5, 3)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                n === 5 && k === 3
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              3 dari 5
            </button>
            <button
              type="button"
              onClick={() => applyPreset(3, 2)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                n === 3 && k === 2
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              2 dari 3
            </button>
            <button
              type="button"
              onClick={() => applyPreset(7, 4)}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                n === 7 && k === 4
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              4 dari 7
            </button>
          </div>
        </div>

        {/* Form N & K */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span>Total Bagian (N)</span>
              <span className="font-mono font-bold text-zinc-900 text-sm">{n}</span>
            </div>
            <input
              type="range"
              min={2}
              max={15}
              value={n}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setN(val);
                if (k > val) setK(val);
              }}
              className="w-full accent-zinc-900 cursor-pointer"
            />
            <p className="text-[10px] text-zinc-400 mt-1">Jumlah gambar PNG yang dihasilkan</p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span>Ambang Pulih (K)</span>
              <span className="font-mono font-bold text-emerald-700 text-sm">{k}</span>
            </div>
            <input
              type="range"
              min={2}
              max={n}
              value={k}
              onChange={(e) => setK(parseInt(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <p className="text-[10px] text-zinc-400 mt-1">Minimal gambar untuk membuka rahasia</p>
          </div>
        </div>

        {/* Visual Threshold Indicator */}
        <div className="rounded-xl bg-zinc-50 border border-zinc-200/80 p-3">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-zinc-600 font-medium">Toleransi Kehilangan:</span>
            <span className="font-semibold text-emerald-700">
              Hingga {n - k} gambar boleh hilang
            </span>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: n }).map((_, i) => {
              const isRequired = i < k;
              return (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full transition-all ${
                    isRequired ? "bg-emerald-600" : "bg-zinc-200"
                  }`}
                  title={isRequired ? "Dibutuhkan (K)" : "Cadangan toleransi (N-K)"}
                />
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-600 inline-block" />
              {k} Gambar Dibutuhkan
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-zinc-300 inline-block" />
              {n - k} Gambar Cadangan
            </span>
          </div>
        </div>
      </div>

      {/* Opsi Sampul Kustom (Collapsible) */}
      <div className="border-t border-zinc-100 pt-1">
        <button
          type="button"
          onClick={() => setShowCoverOption(!showCoverOption)}
          className="flex items-center justify-between w-full py-1.5 text-xs text-zinc-500 hover:text-zinc-800 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Gunakan gambar sampul sendiri (opsional)</span>
          </span>
          {showCoverOption ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showCoverOption && (
          <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-3 space-y-2">
            <p className="text-xs text-zinc-500">
              Pilih berkas gambar untuk dijadikan sampul PNG:
            </p>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200"
            />
          </div>
        )}
      </div>

      {/* Error alert */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tombol Utama */}
      <button
        type="button"
        onClick={handleHide}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3.5 px-4 text-sm font-medium text-white shadow-sm transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-50"
      >
        {loading ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>{progress || "Memproses..."}</span>
          </>
        ) : (
          <>
            <Shield className="h-4 w-4" />
            <span>Pecah & Sembunyikan ke {n} Gambar PNG</span>
          </>
        )}
      </button>

      {/* 4. Hasil Gambar & Fitur Uji Ketahanan */}
      {results.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-zinc-200">
          {/* Header Hasil */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-zinc-900">
                  {results.length} Gambar Bagian Berhasil Dibuat
                </h3>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Set ID: <span className="font-mono text-zinc-700">#{currentSetId}</span> · Cukup {k} gambar untuk pemulihan
              </p>
            </div>

            {/* Tombol Unduh Semua */}
            <button
              type="button"
              onClick={handleDownloadAllZip}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50"
            >
              <Archive className="h-3.5 w-3.5 text-zinc-500" />
              <span>Unduh Semua (.ZIP)</span>
            </button>
          </div>

          {/* Grid Kartu Bagian */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            {results.map((r) => (
              <ShareCard
                key={r.x}
                index={r.x}
                total={n}
                threshold={k}
                url={r.url}
                blob={r.blob}
                isLost={lostIndices.has(r.x)}
                onToggleLost={handleToggleLost}
              />
            ))}
          </div>

          {/* Panel Simulasi Kehilangan & Pemulihan Langsung */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-zinc-900">
                  Simulasi Kehilangan
                </h4>
                <p className="text-[11px] text-zinc-500">
                  Tandai gambar sebagai &quot;Hilang&quot; di atas untuk mensimulasikan foto hilang.
                </p>
              </div>
              <span className="rounded-full bg-zinc-200/80 px-2 py-0.5 text-[11px] font-mono font-medium text-zinc-700">
                {results.length - lostIndices.size} / {n} Tersisa (Butuh {k})
              </span>
            </div>

            <button
              type="button"
              onClick={handleDirectTest}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-2.5 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Uji Pemulihan Langsung</span>
            </button>

            {/* Hasil Uji Langsung */}
            {testResult && (
              <div
                className={`rounded-lg border p-3 text-xs transition-all ${
                  testResult.status === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold">
                  {testResult.status === "success" ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span>{testResult.message}</span>
                </div>
                {testResult.content && (
                  <pre className="mt-2 rounded bg-white/80 p-2 font-mono text-[11px] text-zinc-800 break-words whitespace-pre-wrap border border-emerald-200/60 max-h-32 overflow-auto">
                    {testResult.content}
                  </pre>
                )}
              </div>
            )}
          </div>

          {/* Uji Ketahanan Lengkap Semua Kombinasi */}
          <ResiliencyTest
            pngBlobs={results.map((r) => ({ x: r.x, blob: r.blob }))}
            threshold={k}
          />
        </div>
      )}
    </div>
  );
}
