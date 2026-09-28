"use client";

import { useEffect, useState } from "react";
import type { ToastDetail } from "@/lib/client";

interface Item extends ToastDetail {
  id: number;
}

/** Listens for toast() calls and shows short messages above the tab bar. */
export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let next = 0;
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      const id = ++next;
      // the same message twice in a row replaces the old one instead of stacking
      setItems((list) => [...list.filter((t) => t.message !== detail.message).slice(-1), { ...detail, id }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), detail.tone === "error" ? 6000 : 3000);
    };
    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(148px+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto max-w-md rounded-full px-4 py-2.5 text-sm font-medium shadow-lg ${
            t.tone === "error" ? "bg-critical text-white" : "bg-ink text-page"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
