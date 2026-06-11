import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Left-aligned icon / adornment, rendered before the children. */
  leadingIcon?: ReactNode;
}

/**
 * Themed, accessible button primitive. Renders a native <button> so keyboard
 * activation and disabled semantics come for free. Colors come from theme
 * tokens — no hard-coded values.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    leadingIcon,
    className,
    type = 'button',
    children,
    ...rest
  },
  ref,
) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    // eslint-disable-next-line react/button-has-type
    <button ref={ref} type={type} className={classes} {...rest}>
      {leadingIcon != null && (
        <span aria-hidden="true" className={styles.icon}>
          {leadingIcon}
        </span>
      )}
      {children}
    </button>
  );
});
