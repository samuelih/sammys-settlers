import type { HTMLAttributes, ReactNode } from 'react';

import styles from './Panel.module.css';

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Optional heading shown in the panel header bar. */
  title?: ReactNode;
  /** Optional actions rendered at the right of the header. */
  headerActions?: ReactNode;
  elevation?: 'flat' | 'default' | 'raised';
  /** Remove the default body padding (e.g. for lists/tables). */
  flushBody?: boolean;
}

/**
 * Generic surface container with an optional header. Used to group lobby /
 * game UI sections. Themed via tokens.
 */
export function Panel({
  title,
  headerActions,
  elevation = 'default',
  flushBody = false,
  className,
  children,
  ...rest
}: PanelProps): JSX.Element {
  const elevationClass =
    elevation === 'flat' ? styles.flat : elevation === 'raised' ? styles.raised : '';
  const classes = [styles.panel, elevationClass, className ?? ''].filter(Boolean).join(' ');

  return (
    <section className={classes} {...rest}>
      {(title != null || headerActions != null) && (
        <header className={styles.header}>
          {title != null && <h2 className={styles.title}>{title}</h2>}
          {headerActions != null && <div>{headerActions}</div>}
        </header>
      )}
      <div className={flushBody ? styles.bodyFlush : styles.body}>{children}</div>
    </section>
  );
}
