import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import styles from './Toast.module.css';

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms. Use 0 to keep until dismissed. Default 5000. */
  duration?: number;
}

interface ToastItem extends Required<ToastOptions> {
  id: number;
  message: ReactNode;
}

interface ToastContextValue {
  showToast: (message: ReactNode, options?: ToastOptions) => number;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Single Toast item — styled by variant.
 */
function Toast({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}): JSX.Element {
  const variantClass = styles[item.variant];
  return (
    <div className={`${styles.toast} ${variantClass}`} role="status">
      <span className={styles.message}>{item.message}</span>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss notification"
        onClick={() => onDismiss(item.id)}
      >
        &times;
      </button>
    </div>
  );
}

/**
 * Provides the toast API and renders the live region of active toasts. Wrap the
 * app (or a subtree) in <ToastProvider> and call useToast() to raise toasts.
 */
export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: ReactNode, options?: ToastOptions): number => {
      const id = nextId.current++;
      const duration = options?.duration ?? 5000;
      const item: ToastItem = {
        id,
        message,
        variant: options?.variant ?? 'info',
        duration,
      };
      setItems((prev) => [...prev, item]);
      if (duration > 0) {
        window.setTimeout(() => dismissToast(id), duration);
      }
      return id;
    },
    [dismissToast],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={styles.region}
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {items.map((item) => (
          <Toast key={item.id} item={item} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Access the toast API. Must be called within a <ToastProvider>.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx == null) {
    throw new Error('useToast must be used within a <ToastProvider>');
  }
  return ctx;
}
