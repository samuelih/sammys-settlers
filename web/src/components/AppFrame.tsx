import type { ReactNode } from 'react';

import { useTheme } from '../theme/useTheme';
import styles from './AppFrame.module.css';

export interface AppFrameProps {
  /** App title shown in the header. Defaults to "Sammy's Settlers". */
  title?: ReactNode;
  /** Optional content rendered in the header between the title and actions. */
  headerSlot?: ReactNode;
  /** Optional extra header actions placed before the theme toggle. */
  headerActions?: ReactNode;
  /**
   * Immersive mode (in-game): hide the app bar and let the content own the
   * full viewport, with no max-width and no page scroll.
   */
  immersive?: boolean;
  /** Main page content. */
  children?: ReactNode;
}

/**
 * Top-level chrome: a sticky app bar (brand mark + title, a flexible slot, the
 * navigation actions, and a theme toggle) over a scrollable main content area.
 * The theme toggle flips light/dark by setting `data-theme` on the document
 * root (see useTheme / tokens.css).
 */
export function AppFrame({
  title = "Sammy's Settlers",
  headerSlot,
  headerActions,
  immersive = false,
  children,
}: AppFrameProps): JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  if (immersive) {
    return (
      <div className={`${styles.frame} ${styles.frameImmersive}`} data-testid="app-shell">
        <main className={styles.mainImmersive}>{children}</main>
      </div>
    );
  }

  return (
    <div className={styles.frame} data-testid="app-shell">
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            <span className={styles.markHex} />
          </span>
          <h1 className={styles.title}>{title}</h1>
        </div>
        {headerSlot != null && <div className={styles.headerSlot}>{headerSlot}</div>}
        <div className={styles.actions}>
          {headerActions != null && <nav className={styles.nav}>{headerActions}</nav>}
          <span className={styles.divider} aria-hidden="true" />
          <button
            type="button"
            className={styles.themeToggle}
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-pressed={isDark}
            title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
            data-testid="theme-toggle"
          >
            <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
          </button>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
