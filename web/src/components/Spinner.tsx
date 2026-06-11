import type { ReactNode } from 'react';

import styles from './Spinner.module.css';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** Accessible label; also rendered as visible text when `label` is shown. */
  label?: ReactNode;
  /** Show the label text next to the spinner. */
  showLabel?: boolean;
  className?: string;
}

/**
 * Indeterminate loading spinner. Uses role="status" with an accessible label
 * so screen readers announce the loading state.
 */
export function Spinner({
  size = 'md',
  label = 'Loading',
  showLabel = false,
  className,
}: SpinnerProps): JSX.Element {
  const spinner = (
    <span
      className={`${styles.spinner} ${styles[size]} ${className ?? ''}`.trim()}
      aria-hidden="true"
    />
  );

  if (showLabel) {
    return (
      <span className={styles.wrapper} role="status">
        {spinner}
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span className={styles.wrapper} role="status" aria-label={typeof label === 'string' ? label : 'Loading'}>
      {spinner}
    </span>
  );
}
