"use client";

import { useEffect, useId, useRef } from "react";
import { CloseIcon } from "./icons";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /**
   * Tap outside to close. Turn it off while the sheet holds unsaved input,
   * so a stray tap on the dimmed page doesn't throw away what was typed.
   * The close button, Esc and the back gesture still work.
   */
  dismissible?: boolean;
}

/**
 * Modal built on the native <dialog>: focus trapping, Esc and the Android back gesture
 * come for free. closedby="any" adds tap-outside-to-close; Safari gets a small fallback.
 */
export function Sheet({ open, onClose, title, children, dismissible = true }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const dismissibleRef = useRef(dismissible);
  const titleId = useId();

  useEffect(() => {
    dismissibleRef.current = dismissible;
    ref.current?.setAttribute("closedby", dismissible ? "any" : "closerequest");
  }, [dismissible]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;
    // Fallback light-dismiss for browsers without closedby (Safari)
    const onClick = (event: MouseEvent) => {
      if (event.target !== dialog || !dismissibleRef.current) return;
      const r = dialog.getBoundingClientRect();
      const inside = r.top <= event.clientY && event.clientY <= r.bottom && r.left <= event.clientX && event.clientX <= r.right;
      if (!inside) dialog.close();
    };
    dialog.addEventListener("click", onClick);
    return () => dialog.removeEventListener("click", onClick);
  }, []);

  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId} onClose={onClose}>
      <header className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <button type="button" className="icon-btn -mr-2" onClick={() => ref.current?.close()} aria-label="Close">
          <CloseIcon />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{open ? children : null}</div>
    </dialog>
  );
}
