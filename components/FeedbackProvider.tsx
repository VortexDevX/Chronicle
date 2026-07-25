"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: ToastTone };
type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
};
type ConfirmState = ConfirmOptions & { resolve: (value: boolean) => void };

type FeedbackContextValue = {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmState | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, tone }].slice(-4));
    window.setTimeout(
      () => setToasts((current) => current.filter((item) => item.id !== id)),
      4200,
    );
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setConfirmation({ ...options, resolve });
      }),
    [],
  );

  const closeConfirmation = (result: boolean) => {
    confirmation?.resolve(result);
    setConfirmation(null);
  };

  const value = useMemo(() => ({ toast, confirm }), [confirm, toast]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((item) => {
          const Icon =
            item.tone === "success"
              ? Check
              : item.tone === "error"
                ? AlertTriangle
                : Info;
          return (
            <div className="product-toast" data-tone={item.tone} key={item.id}>
              <Icon size={17} />
              <span>{item.message}</span>
              <button
                onClick={() =>
                  setToasts((current) =>
                    current.filter((candidate) => candidate.id !== item.id),
                  )
                }
                aria-label="Dismiss notification"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
      {confirmation && (
        <div
          className="modal-overlay product-confirm-backdrop"
          onMouseDown={() => closeConfirmation(false)}
        >
          <section
            className="product-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="product-confirm-icon">
              <AlertTriangle size={21} />
            </span>
            <h2 id="confirm-title">{confirmation.title}</h2>
            <p>{confirmation.message}</p>
            <div>
              <button className="btn-ghost" onClick={() => closeConfirmation(false)}>
                Cancel
              </button>
              <button
                className={confirmation.danger ? "btn-danger" : "btn-primary"}
                onClick={() => closeConfirmation(true)}
                autoFocus
              >
                {confirmation.confirmLabel || "Confirm"}
              </button>
            </div>
          </section>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error("useFeedback must be used inside FeedbackProvider");
  }
  return context;
}
