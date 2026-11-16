"use client";

import { useState, useCallback, useEffect } from "react";
import {
  UploadCloud,
  FileCheck2,
  FileX,
  LockOpen,
  Copy,
  Check,
  Download,
  AlertCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { combine, type Share } from "@/lib/shamir";
import { extractShare } from "@/lib/steganography";
import {
  unwrapPayload,
  uint8Equal,
  formatBytes,
  formatSetId,
  downloadBlob,
} from "@/lib/utils";

interface InspectedFile {
  file: File;
  valid: boolean;
  x?: number;
  n?: number;
  k?: number;
  setId?: Uint8Array;
  data?: Uint8Array;
  error?: string;
}

export default function RecoverTab() {
  const [files, setFiles] = useState<File[]>([]);
  const [inspected, setInspected] = useState<InspectedFile[]>([]);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Hasil pemulihan
  const [result, setResult] = useState<{
    type: "text" | "image";
    content: string;
    blob?: Blob;
    filename?: string;
  } | null>(null);

  // Inspeksi otomatis setiap kali berkas dipilih/dijatuhkan
  useEffect(() => {
    if (files.length === 0) {
      setInspected([]);
      return;
    }

    let isMounted = true;
    setIsInspecting(true);

    const inspectAll = async () => {
      const results: InspectedFile[] = [];

      for (const file of files) {
        try {
          const blob = new Blob([await file.arrayBuffer()], { type: file.type });
          const res = await extractShare(blob);
          if (res) {
            results.push({
              file,
              valid: true,
              x: res.header.x,
              n: res.header.n,
              k: res.header.k,
              setId: res.header.setId,
              data: res.shareData,
            });
          } else {
            results.push({
              file,
              valid: false,
              error: "Bukan gambar Tessera yang valid",
            });
          }
        } catch {
          results.push({
            file,
            valid: false,
            error: "Gagal membaca berkas",
          });
        }
      }

      if (isMounted) {
        setInspected(results);
        setIsInspecting(false);
      }
    };

    inspectAll();

    return () => {
      isMounted = false;
    };
  }, [files]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      const newFiles = Array.from(e.dataTransfer.files).filter(
        (f) => f.type === "image/png" || f.name.endsWith(".png")
      );
      if (newFiles.length === 0) {
        setError("Silakan masukkan berkas berekstensi .PNG");
        return;
      }
      setFiles(newFiles);
      setResult(null);
      setError("");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      setFiles(Array.from(e.target.files));
      setResult(null);
      setError("");
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
  };

  // Validasi status saat ini
  const validShares = inspected.filter((f) => f.valid && f.data && f.x && f.setId);
  const firstShare = validShares[0];
  const requiredK = firstShare?.k ?? 0;
  const totalN = firstShare?.n ?? 0;
  const currentSetIdStr = firstShare?.setId ? formatSetId(firstShare.setId) : "";

  // Cek konsistensi Set ID
  const isSetConsistent = validShares.every(
    (s) => s.setId && firstShare?.setId && uint8Equal(s.setId, firstShare.setId)
  );

  // Cek keunikan x
  const uniqueXCount = new Set(validShares.map((s) => s.x)).size;
  const hasEnoughShares = isSetConsistent && uniqueXCount >= requiredK && requiredK > 0;

  const handleRecover = useCallback(async () => {
    setError("");
    setResult(null);
    setLoading(true);

    try {
      if (!isSetConsistent) {
        throw new Error(
          "Berkas gambar berasal dari set rahasia yang berbeda. Pastikan semua gambar berasal dari pembagian yang sama."
        );
      }

      if (uniqueXCount < requiredK) {
        throw new Error(
          `Baru ${uniqueXCount} bagian unik terkumpul. Dibutuhkan minimal ${requiredK} bagian untuk membuka rahasia.`
        );
      }

      // Ambil K bagian pertama yang unik
      const seenX = new Set<number>();
      const sharesToUse: Share[] = [];

      for (const item of validShares) {
        if (!seenX.has(item.x!) && item.data) {
          seenX.add(item.x!);
          sharesToUse.push({ x: item.x!, y: item.data });
        }
        if (sharesToUse.length === requiredK) break;
      }

      // Rekonstruksi Shamir
      const payload = combine(sharesToUse);
      const { meta, data } = unwrapPayload(payload);

      if (meta.type === "text") {
        const text = new TextDecoder().decode(data);
        setResult({ type: "text", content: text });
      } else {
        const blob = new Blob([data as unknown as BlobPart], { type: meta.mimeType ?? "image/png" });
        const url = URL.createObjectURL(blob);
        setResult({
          type: "image",
          content: url,
          blob,
          filename: meta.filename ?? "recovered-image.png",
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [validShares, isSetConsistent, uniqueXCount, requiredK]);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Dropzone Upload */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 border-dashed p-6 text-center transition-all ${
          isDragging
            ? "border-zinc-900 bg-zinc-100"
            : "border-zinc-200 bg-zinc-50/50 hover:border-zinc-300"
        }`}
      >
        <input
          type="file"
          accept="image/png"
          multiple
          id="recover-file-input"
          className="hidden"
          onChange={handleFileChange}
        />
        <label
          htmlFor="recover-file-input"
          className="flex flex-col items-center justify-center cursor-pointer space-y-2"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-zinc-700 shadow-sm border border-zinc-200/80">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900">
              Tarik & Lepas gambar PNG ke sini
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              atau klik untuk memilih beberapa berkas PNG sekaligus
            </p>
          </div>
          <span className="text-[11px] text-zinc-400">
            Hanya berkas asli PNG tanpa kompresi JPEG
          </span>
        </label>
      </div>

      {/* Daftar Berkas Terinspeksi */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-zinc-500">
              Berkas Terdeteksi ({validShares.length} / {files.length} Valid)
            </span>
            {isInspecting && (
              <span className="flex items-center gap-1 text-zinc-400">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Mengekstrak bit LSB...
              </span>
            )}
          </div>

          <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white overflow-hidden">
            {inspected.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 text-xs hover:bg-zinc-50/50"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.valid ? (
                    <FileCheck2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <FileX className="h-4 w-4 text-red-500 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">
                      {item.file.name}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {item.valid ? (
                        <>
                          Bagian <strong className="text-zinc-800">#{item.x}</strong> dari {item.n} · Set{" "}
                          <span className="font-mono font-medium">#{formatSetId(item.setId!)}</span> ·{" "}
                          {formatBytes(item.file.size)}
                        </>
                      ) : (
                        <span className="text-red-600">{item.error}</span>
                      )}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveFile(idx)}
                  className="p-1 text-zinc-400 hover:text-red-600 transition-colors"
                  title="Hapus gambar ini"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Status Ambang K */}
          {firstShare && (
            <div
              className={`rounded-xl border p-3 text-xs flex items-center justify-between ${
                hasEnoughShares
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <div>
                <span className="font-semibold">
                  {hasEnoughShares ? "✓ Syarat Ambang Terpenuhi" : "⏳ Menunggu Bagian Tambahan"}
                </span>
                <p className="text-[11px] mt-0.5 opacity-80">
                  Tersedia <strong className="font-mono">{uniqueXCount}</strong> bagian unik dari syarat minimal{" "}
                  <strong className="font-mono">{requiredK}</strong> bagian (Skema {requiredK} dari {totalN}).
                </p>
              </div>
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-white/70 shadow-2xs">
                {uniqueXCount} / {requiredK}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error alert */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tombol Pulihkan */}
      <button
        type="button"
        onClick={handleRecover}
        disabled={loading || !hasEnoughShares}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3.5 px-4 text-sm font-medium text-white shadow-sm transition-all hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-40"
      >
        {loading ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Rekonstruksi Lagrange GF(256)...</span>
          </>
        ) : (
          <>
            <LockOpen className="h-4 w-4" />
            <span>Buka & Pulihkan Rahasia</span>
          </>
        )}
      </button>

      {/* Hasil Pemulihan */}
      {result && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                <Check className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-900">
                Rahasia Berhasil Terbuka
              </h3>
            </div>
            {result.type === "text" && (
              <button
                type="button"
                onClick={() => copyText(result.content)}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-50"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-zinc-500" />
                    <span>Salin</span>
                  </>
                )}
              </button>
            )}
          </div>

          {result.type === "text" ? (
            <div className="relative">
              <pre className="max-h-56 overflow-auto rounded-xl border border-emerald-200/80 bg-white p-3.5 font-mono text-xs text-zinc-900 whitespace-pre-wrap break-words leading-relaxed">
                {result.content}
              </pre>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.content}
                  alt="Gambar terpulihkan"
                  className="max-h-64 w-full rounded-lg object-contain"
                />
              </div>
              <button
                type="button"
                onClick={() => downloadBlob(result.blob!, result.filename!)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Unduh {result.filename}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
