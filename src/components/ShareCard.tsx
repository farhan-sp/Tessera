"use client";

import { Download, EyeOff, RotateCcw } from "lucide-react";
import { downloadBlob } from "@/lib/utils";

interface ShareCardProps {
  index: number;
  total: number;
  threshold: number;
  url: string;
  blob: Blob;
  isLost: boolean;
  onToggleLost: (index: number) => void;
}

export default function ShareCard({
  index,
  total,
  threshold,
  url,
  blob,
  isLost,
  onToggleLost,
}: ShareCardProps) {
  const filename = `share_${index}_of_${total}_k${threshold}.png`;
  const sizeKb = (blob.size / 1024).toFixed(1);

  return (
    <div
      className={`group relative rounded-xl border p-3.5 transition-all duration-200 ${
        isLost
          ? "border-dashed border-red-300 bg-red-50/50 opacity-60"
          : "border-zinc-200/90 bg-white hover:border-zinc-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-center gap-3.5">
        {/* Preview Gambar */}
        <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-zinc-200/70 bg-zinc-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Bagian ${index}`}
            className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              isLost ? "grayscale" : ""
            }`}
          />
          {isLost && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-900/30">
              <EyeOff className="h-4 w-4 text-white" />
            </div>
          )}
        </div>

        {/* Informasi Bagian */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${
                isLost
                  ? "bg-red-100 text-red-700"
                  : "bg-zinc-100 text-zinc-800"
              }`}
            >
              #{index}
            </span>
            <p className="truncate text-xs font-medium text-zinc-900">
              {filename}
            </p>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {sizeKb} KB · PNG Lossless
            {isLost && (
              <span className="ml-1.5 font-medium text-red-600">
                (Disimulasikan Hilang)
              </span>
            )}
          </p>
        </div>

        {/* Tombol Aksi */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => onToggleLost(index)}
            title={isLost ? "Batalkan simulasi hilang" : "Tandai sebagai hilang (uji ketahanan)"}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              isLost
                ? "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            {isLost ? (
              <>
                <RotateCcw className="h-3.5 w-3.5 text-zinc-500" />
                <span>Pulihkan</span>
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5 text-zinc-400" />
                <span>Hilangkan</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => downloadBlob(blob, filename)}
            title="Unduh gambar PNG ini"
            className="flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 active:scale-95"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Unduh</span>
          </button>
        </div>
      </div>
    </div>
  );
}
