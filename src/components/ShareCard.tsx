"use client";

import { useState } from "react";

interface ShareCardProps {
  index: number;
  total: number;
  threshold: number;
  url: string;
  blob: Blob;
}

export default function ShareCard({ index, total, threshold, url, blob }: ShareCardProps) {
  const [markedLost, setMarkedLost] = useState(false);

  const filename = `share_${index}_of_${total}_k${threshold}.png`;
  const sizekb = (blob.size / 1024).toFixed(1);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  return (
    <div
      className={`border rounded-xl p-4 flex items-center gap-4 transition-all ${
        markedLost
          ? "border-red-200 bg-red-50 opacity-60"
          : "border-gray-200 bg-white hover:border-indigo-200"
      }`}
    >
      {/* Preview gambar */}
      <div className="flex-shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`Bagian ${index}`}
          className={`w-16 h-16 object-cover rounded-lg border ${markedLost ? "grayscale" : ""}`}
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm font-semibold text-gray-800">
          Bagian {index} / {total}
        </p>
        <p className="text-xs text-gray-400">{filename} · {sizekb} KB</p>
        {markedLost && (
          <span className="inline-block mt-1 text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
            Dianggap Hilang
          </span>
        )}
      </div>

      {/* Aksi */}
      <div className="flex flex-col gap-2 flex-shrink-0">
        <button
          onClick={handleDownload}
          className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          ⬇ Unduh
        </button>
        <button
          onClick={() => setMarkedLost((v) => !v)}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            markedLost
              ? "bg-green-50 hover:bg-green-100 text-green-700"
              : "bg-red-50 hover:bg-red-100 text-red-700"
          }`}
        >
          {markedLost ? "✓ Pulihkan" : "✗ Hilangkan"}
        </button>
      </div>
    </div>
  );
}
