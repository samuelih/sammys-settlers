import { useCallback, useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import styles from './Dialog.module.css';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Footer area, typically action buttons. */
  footer?: ReactNode;
  /** Hide the header close (×) button. */
  hideCloseButton?: boolean;
  /** When false, clicking the backdrop does not close. Default true. */
  closeOnOverlayClick?: boolean;
  children?: ReactNode;
}

/**
 * Accessible modal dialog (role="dialog", aria-modal). Renders into a portal
 * on document.body. Closes on Escape and (optionally) backdrop click, traps
 * focus loosely by moving initial focus into the dialog, and restores focus
 * to the previously focused element on close.
 */
export function Dialog({
  open,
  onClose,
  title,
  footer,
  hideCloseButton = false,
  closeOnOverlayClick = true,
  children,
}: DialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Escape to close.
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Move focus in on open, restore on close.
  useEffect(() => {
    if (!open) {
      return;
    }
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  const onOverlayMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (closeOnOverlayClick && event.target === event.currentTarget) {
        onClose();
      }
    },
    [closeOnOverlayClick, onClose],
  );

  if (!open) {
    return null; // <--- Early return: nothing rendered when closed ---
  }

  return createPortal(
    <div className={styles.overlay} onMouseDown={onOverlayMouseDown}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        tabIndex={-1}
      >
        {(title != null || !hideCloseButton) && (
          <header className={styles.header}>
            {title != null ? (
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
            ) : (
              <span />
            )}
            {!hideCloseButton && (
              <button
                type="button"
                className={styles.close}
                aria-label="Close dialog"
                onClick={onClose}
              >
                &times;
              </button>
            )}
          </header>
        )}
        <div className={styles.body}>{children}</div>
        {footer != null && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// Alias for callers preferring the "Modal" name.
export const Modal = Dialog;
