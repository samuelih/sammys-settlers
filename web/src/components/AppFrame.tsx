import type { ReactNode } from 'react';

import { useTheme } from '../theme/useTheme';
import styles from './AppFrame.module.css';

export interface AppFrameProps {
  /** App title shown in the header. Defaults to "JSettlers". */
  title?: ReactNode;
  /** Optional content rendered in the header between the title and actions. */
  headerSlot?: ReactNode;
  /** Optional extra header actions placed before the theme toggle. */
  headerActions?: ReactNode;
  /** Main page content. */
  children?: ReactNode;
}

/**
 * Top-level chrome: a sticky header (title + a flexible slot + theme toggle)
 * over a main content area. The theme toggle flips light/dark by setting
 * `data-theme` on the document root (see useTheme / tokens.css).
 */
export function AppFrame({
  title = 'JSettlers',
  headerSlot,
  headerActions,
  children,
}: AppFrameProps): JSX.Element {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className={styles.frame} data-testid="app-shell">
      <header className={styles.header}>
        <div className={styles.brand}>
          <h1 className={styles.title}>{title}</h1>
        </div>
        {headerSlot != null && <div className={styles.headerSlot}>{headerSlot}</div>}
        <div className={styles.actions}>
          {headerActions}
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
