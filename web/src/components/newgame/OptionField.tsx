import { useId } from 'react';

import type {
  GameOptionDescriptor,
  GameOptType,
} from '../../protocol/gameOptions';
import styles from './OptionField.module.css';

export interface OptionFieldProps {
  /** The option to render. Treated as immutable; edits emit a fresh copy. */
  option: GameOptionDescriptor;
  /** Called with an updated copy whenever the user changes a value. */
  onChange: (updated: GameOptionDescriptor) => void;
}

/**
 * Resolve the effective boolean value of an option, preferring the current
 * chosen value over the server default.
 */
function effectiveBool(opt: GameOptionDescriptor): boolean {
  return opt.curBoolValue ?? opt.defaultBoolValue ?? false;
}

/**
 * Resolve the effective integer value of an option, preferring the current
 * chosen value over the server default, falling back to the min (or 0).
 */
function effectiveInt(opt: GameOptionDescriptor): number {
  return opt.curIntValue ?? opt.defaultIntValue ?? opt.minIntValue ?? 0;
}

/** Resolve the effective string value of an option. */
function effectiveStr(opt: GameOptionDescriptor): string {
  return opt.curStrValue ?? '';
}

/**
 * Clamp an integer to the option's [minIntValue, maxIntValue] range, ignoring
 * NaN (caller keeps the previous value in that case via the `fallback`).
 */
function clampInt(opt: GameOptionDescriptor, raw: number, fallback: number): number {
  if (Number.isNaN(raw)) {
    return fallback; // <--- Early return: keep previous when input is non-numeric ---
  }
  let value = raw;
  if (opt.minIntValue != null && value < opt.minIntValue) {
    value = opt.minIntValue;
  }
  if (opt.maxIntValue != null && value > opt.maxIntValue) {
    value = opt.maxIntValue;
  }
  return value;
}

/**
 * Strip the trailing `#`-marker SOCGameOption uses to indicate the inline int
 * field position, yielding a clean label for the control.
 */
function cleanDesc(desc: string): string {
  return desc.replace(/#/g, '').trim();
}

/**
 * Renders a single {@link GameOptionDescriptor} as the appropriate form
 * control, chosen by its `optType`:
 *  - bool      → labeled checkbox
 *  - int       → number input (clamped to min/max)
 *  - intbool   → checkbox + number input (number disabled when unchecked)
 *  - enum      → select of enumVals
 *  - enumbool  → checkbox + select (select disabled when unchecked)
 *  - str       → text input
 *  - strhide   → password (masked) text input
 *  - unknown   → read-only notice
 *
 * Pure presentation: no network, no store. Edits emit a shallow copy of the
 * descriptor with the mutated `cur*` field via {@link OptionFieldProps.onChange}.
 */
export function OptionField({ option, onChange }: OptionFieldProps): JSX.Element {
  const controlId = useId();
  const testId = `opt-${option.key}`;
  const label = cleanDesc(option.desc);

  const emit = (patch: Partial<GameOptionDescriptor>): void => {
    onChange({ ...option, ...patch });
  };

  switch (option.optType) {
    case 'bool': {
      return (
        <div className={styles.field} data-testid={testId}>
          <label className={styles.checkbox} htmlFor={controlId}>
            <input
              id={controlId}
              type="checkbox"
              checked={effectiveBool(option)}
              onChange={(e) => emit({ curBoolValue: e.target.checked })}
            />
            <span className={styles.labelText}>{label}</span>
          </label>
        </div>
      );
    }

    case 'int': {
      const current = effectiveInt(option);
      return (
        <div className={styles.field} data-testid={testId}>
          <label className={styles.standaloneLabel} htmlFor={controlId}>
            {label}
          </label>
          <input
            id={controlId}
            className={`${styles.input} ${styles.numberInput}`}
            type="number"
            value={current}
            min={option.minIntValue}
            max={option.maxIntValue}
            onChange={(e) =>
              emit({ curIntValue: clampInt(option, e.target.valueAsNumber, current) })
            }
          />
        </div>
      );
    }

    case 'intbool': {
      const checked = effectiveBool(option);
      const current = effectiveInt(option);
      return (
        <div className={styles.field} data-testid={testId}>
          <div className={styles.inline}>
            <label className={styles.checkbox} htmlFor={`${controlId}-bool`}>
              <input
                id={`${controlId}-bool`}
                type="checkbox"
                checked={checked}
                onChange={(e) => emit({ curBoolValue: e.target.checked })}
              />
              <span className={styles.labelText}>{label}</span>
            </label>
            <input
              id={controlId}
              className={`${styles.input} ${styles.numberInput}`}
              type="number"
              aria-label={`${label} value`}
              value={current}
              min={option.minIntValue}
              max={option.maxIntValue}
              disabled={!checked}
              onChange={(e) =>
                emit({ curIntValue: clampInt(option, e.target.valueAsNumber, current) })
              }
            />
          </div>
        </div>
      );
    }

    case 'enum': {
      const current = effectiveInt(option);
      const vals = option.enumVals ?? [];
      return (
        <div className={styles.field} data-testid={testId}>
          <label className={styles.standaloneLabel} htmlFor={controlId}>
            {label}
          </label>
          <select
            id={controlId}
            className={styles.select}
            value={current}
            onChange={(e) => emit({ curIntValue: Number.parseInt(e.target.value, 10) })}
          >
            {vals.map((display, idx) => (
              // enumVals are 1-indexed in the protocol.
              <option key={display + String(idx)} value={idx + 1}>
                {display}
              </option>
            ))}
          </select>
        </div>
      );
    }

    case 'enumbool': {
      const checked = effectiveBool(option);
      const current = effectiveInt(option);
      const vals = option.enumVals ?? [];
      return (
        <div className={styles.field} data-testid={testId}>
          <div className={styles.inline}>
            <label className={styles.checkbox} htmlFor={`${controlId}-bool`}>
              <input
                id={`${controlId}-bool`}
                type="checkbox"
                checked={checked}
                onChange={(e) => emit({ curBoolValue: e.target.checked })}
              />
              <span className={styles.labelText}>{label}</span>
            </label>
            <select
              id={controlId}
              className={styles.select}
              aria-label={`${label} choice`}
              value={current}
              disabled={!checked}
              onChange={(e) => emit({ curIntValue: Number.parseInt(e.target.value, 10) })}
            >
              {vals.map((display, idx) => (
                <option key={display + String(idx)} value={idx + 1}>
                  {display}
                </option>
              ))}
            </select>
          </div>
        </div>
      );
    }

    case 'str':
    case 'strhide': {
      const masked = option.optType === 'strhide';
      return (
        <div className={styles.field} data-testid={testId}>
          <label className={styles.standaloneLabel} htmlFor={controlId}>
            {label}
          </label>
          <input
            id={controlId}
            className={styles.input}
            type={masked ? 'password' : 'text'}
            value={effectiveStr(option)}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => emit({ curStrValue: e.target.value })}
          />
        </div>
      );
    }

    case 'unknown':
    default: {
      // Render a non-interactive notice for option types the client can't use.
      return (
        <div className={styles.field} data-testid={testId}>
          <span className={styles.standaloneLabel}>
            {label} (unsupported option)
          </span>
        </div>
      );
    }
  }
}

// Re-export the descriptor types for callers importing alongside the component.
export type { GameOptionDescriptor, GameOptType };
