"use client";

import { useState } from "react";
import { KeyRound, Lock, Unlock } from "lucide-react";
import HideTab from "@/components/HideTab";
import RecoverTab from "@/components/RecoverTab";

type Tab = "hide" | "recover";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("hide");

  return (
    <div className="min-h-screen bg-[#fafafa] text-zinc-900 font-sans selection:bg-zinc-900 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-zinc-200/80 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white">
              <KeyRound className="h-4 w-4" />
            </div>
            <span className="font-semibold text-base tracking-tight text-zinc-900">
              Tessera
            </span>
          </div>

          {/* Segmented Tabs di Navbar / Header */}
          <div className="inline-flex rounded-lg bg-zinc-100 p-1 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("hide")}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium transition-all ${
                activeTab === "hide"
                  ? "bg-white text-zinc-900 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Sembunyikan</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("recover")}
              className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 font-medium transition-all ${
                activeTab === "recover"
                  ? "bg-white text-zinc-900 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <Unlock className="h-3.5 w-3.5" />
              <span>Pulihkan</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Card */}
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-zinc-200/90 bg-white p-5 sm:p-6 shadow-xs">
          {activeTab === "hide" ? <HideTab /> : <RecoverTab />}
        </div>
      </main>
    </div>
  );
}
