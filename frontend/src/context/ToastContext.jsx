import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const TOAST_STYLES = {
  success: {
    container: 'bg-zinc-900/95 border-emerald-500/40 text-emerald-50 shadow-emerald-950/50',
    iconWrap: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    bar: 'bg-emerald-500',
    Icon: CheckCircle2,
  },
  error: {
    container: 'bg-zinc-900/95 border-rose-500/40 text-rose-50 shadow-rose-950/50',
    iconWrap: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    bar: 'bg-rose-500',
    Icon: AlertCircle,
  },
  warning: {
    container: 'bg-zinc-900/95 border-amber-500/40 text-amber-50 shadow-amber-950/50',
    iconWrap: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    bar: 'bg-amber-500',
    Icon: AlertTriangle,
  },
  info: {
    container: 'bg-zinc-900/95 border-blue-500/40 text-blue-50 shadow-blue-950/50',
    iconWrap: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    bar: 'bg-blue-500',
    Icon: Info,
  },
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message, type = 'info', durationMs = 4200) => {
    if (!message) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-4), { id, message: String(message), type }]);

    if (durationMs > 0) {
      setTimeout(() => {
        dismiss(id);
      }, durationMs);
    }
    return id;
  }, [dismiss]);

  const toast = useMemo(() => ({
    show,
    dismiss,
    success: (msg, ms) => show(msg, 'success', ms),
    error: (msg, ms) => show(msg, 'error', ms ?? 5500),
    warning: (msg, ms) => show(msg, 'warning', ms ?? 4800),
    info: (msg, ms) => show(msg, 'info', ms),
  }), [show, dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Contenedor flotante no bloqueante */}
      <div
        className="fixed bottom-4 right-4 z-[10000] flex flex-col gap-2.5 max-w-md w-[calc(100vw-2rem)] sm:w-auto pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((item) => {
          const style = TOAST_STYLES[item.type] || TOAST_STYLES.info;
          const IconComponent = style.Icon;
          return (
            <div
              key={item.id}
              className={`pointer-events-auto relative overflow-hidden rounded-xl border backdrop-blur-md shadow-2xl px-3.5 py-3 flex items-start gap-3 animate-in slide-in-from-right-4 fade-in duration-200 ${style.container}`}
            >
              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${style.iconWrap}`}>
                <IconComponent size={16} />
              </div>
              <p className="text-xs sm:text-sm font-medium leading-snug flex-1 pr-2 break-words">
                {item.message}
              </p>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/70 transition-colors shrink-0 cursor-pointer"
                aria-label="Cerrar notificación"
              >
                <X size={14} />
              </button>
              <span className={`absolute bottom-0 left-0 right-0 h-0.5 opacity-60 ${style.bar}`} />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      show: () => {},
      dismiss: () => {},
      success: () => {},
      error: () => {},
      warning: () => {},
      info: () => {},
    };
  }
  return ctx;
};
