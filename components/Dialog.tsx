"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

let scrollLocks = 0;
let previousOverflow = "";

/** Native modal semantics keep keyboard focus and pointer interaction in the top dialog. */
export function Dialog({ children, labelledBy, onClose, beforeClose, busy = false, className = "", role = "dialog" }: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  beforeClose?: () => boolean | Promise<boolean>;
  busy?: boolean;
  className?: string;
  role?: "dialog" | "alertdialog";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  const beforeCloseRef = useRef(beforeClose);
  const checking = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => { beforeCloseRef.current = beforeClose; }, [beforeClose]);

  const dismiss = useCallback(async () => {
    if (busy || timer.current || checking.current) return;
    checking.current = true;
    try {
      if (beforeCloseRef.current && !await beforeCloseRef.current()) return;
    } finally { checking.current = false; }
    setClosing(true);
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 160;
    timer.current = setTimeout(() => closeRef.current(), duration);
  }, [busy]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    const viewport = window.visualViewport;
    const sizeToViewport = () => {
      dialog.style.setProperty("--dialog-height", `${viewport?.height || window.innerHeight}px`);
      dialog.style.setProperty("--dialog-top", `${viewport?.offsetTop || 0}px`);
    };
    sizeToViewport();
    viewport?.addEventListener("resize",sizeToViewport);
    viewport?.addEventListener("scroll",sizeToViewport);
    const initial = dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]")
      || document.getElementById(labelledBy);
    if (initial) {
      initial.tabIndex = -1;
      initial.focus({ preventScroll: true });
    }
    if (scrollLocks++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      viewport?.removeEventListener("resize",sizeToViewport);
      viewport?.removeEventListener("scroll",sizeToViewport);
      if (timer.current) clearTimeout(timer.current);
      dialog.close();
      if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [labelledBy]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog
      ref={ref}
      className={`app-dialog ${className}`}
      role={role}
      aria-labelledby={labelledBy}
      data-closing={closing || undefined}
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'))
          .filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); event.currentTarget.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement as HTMLElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }}
      onClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest("[data-dialog-close]")) {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      <div className="modal-overlay" onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}>
        {children}
      </div>
    </dialog>, document.body,
  );
}
