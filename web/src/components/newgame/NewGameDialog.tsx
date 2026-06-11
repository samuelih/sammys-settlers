import { useMemo, useState } from 'react';

import type { GameOptionDescriptor } from '../../protocol/gameOptions';
import { Button } from '../Button';
import { Dialog } from '../Dialog';
import { OptionField } from './OptionField';
import styles from './NewGameDialog.module.css';

/** Option keys promoted to the prominent block at the top of the dialog. */
const PROMINENT_KEYS: readonly string[] = ['PL', 'VP'];

export interface NewGameScenario {
  key: string;
  desc: string;
}

export interface NewGameDialogProps {
  /** Whether the dialog is shown. Defaults to true for standalone use. */
  open?: boolean;
  /** Game options to render, one OptionField each. */
  options: GameOptionDescriptor[];
  /** Optional scenario choices; when provided, a scenario <select> is shown. */
  scenarios?: NewGameScenario[];
  /**
   * Create the game with the entered name/nick, the (possibly edited) option
   * descriptors, and the chosen scenario key (when scenarios are offered).
   */
  onCreate: (
    name: string,
    nick: string,
    chosenOptions: GameOptionDescriptor[],
    scenarioKey?: string,
  ) => void;
  /** Dismiss without creating. */
  onCancel: () => void;
}

/** Default nickname pre-filled into the dialog. */
const DEFAULT_NICK = 'WebPlayer';

/**
 * Modal for creating a new game. Presentational only — it holds local edit
 * state for the name, nickname, per-option values and the chosen scenario, and
 * hands them all back via {@link NewGameDialogProps.onCreate}. No network or
 * store access.
 *
 * Common options (PL = number of players, VP = victory points to win) are
 * pulled to a prominent block at the top; the rest scroll in a list below.
 */
export function NewGameDialog({
  open = true,
  options,
  scenarios,
  onCreate,
  onCancel,
}: NewGameDialogProps): JSX.Element {
  const [name, setName] = useState('');
  const [nick, setNick] = useState(DEFAULT_NICK);
  const [scenarioKey, setScenarioKey] = useState<string>(scenarios?.[0]?.key ?? '');

  // Local editable copy of each option keyed by its descriptor key.
  const [values, setValues] = useState<Record<string, GameOptionDescriptor>>(() =>
    Object.fromEntries(options.map((o) => [o.key, o])),
  );

  // Keep a stable ordered view: prominent options first, the rest after.
  const { prominent, rest } = useMemo(() => {
    const prom: GameOptionDescriptor[] = [];
    const others: GameOptionDescriptor[] = [];
    for (const opt of options) {
      (PROMINENT_KEYS.includes(opt.key) ? prom : others).push(opt);
    }
    // Order the prominent block by the PROMINENT_KEYS sequence.
    prom.sort((a, b) => PROMINENT_KEYS.indexOf(a.key) - PROMINENT_KEYS.indexOf(b.key));
    return { prominent: prom, rest: others };
  }, [options]);

  const valueFor = (opt: GameOptionDescriptor): GameOptionDescriptor =>
    values[opt.key] ?? opt;

  const handleOptionChange = (updated: GameOptionDescriptor): void => {
    setValues((prev) => ({ ...prev, [updated.key]: updated }));
  };

  const handleCreate = (): void => {
    const chosen = options.map((o) => values[o.key] ?? o);
    const chosenScenario =
      scenarios != null && scenarios.length > 0 ? scenarioKey || undefined : undefined;
    onCreate(name.trim(), nick.trim() || DEFAULT_NICK, chosen, chosenScenario);
  };

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    handleCreate();
  };

  const footer = (
    <>
      <Button variant="ghost" onClick={onCancel} data-testid="newgame-cancel">
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={handleCreate}
        disabled={name.trim() === ''}
        data-testid="newgame-create"
      >
        Create
      </Button>
    </>
  );

  return (
    <Dialog open={open} onClose={onCancel} title="New game" footer={footer}>
      <form className={styles.form} onSubmit={onSubmit}>
        <label className={styles.field}>
          <span className={styles.label}>Game name</span>
          <input
            className={styles.input}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="newgame-name"
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Nickname</span>
          <input
            className={styles.input}
            type="text"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            data-testid="newgame-nick"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        {scenarios != null && scenarios.length > 0 && (
          <label className={styles.field}>
            <span className={styles.label}>Scenario</span>
            <select
              className={styles.select}
              value={scenarioKey}
              onChange={(e) => setScenarioKey(e.target.value)}
              data-testid="newgame-scenario"
            >
              {scenarios.map((sc) => (
                <option key={sc.key} value={sc.key}>
                  {sc.desc}
                </option>
              ))}
            </select>
          </label>
        )}

        {prominent.length > 0 && (
          <div className={styles.prominent} data-testid="newgame-prominent">
            <h3 className={styles.sectionTitle}>Common options</h3>
            {prominent.map((opt) => (
              <OptionField
                key={opt.key}
                option={valueFor(opt)}
                onChange={handleOptionChange}
              />
            ))}
          </div>
        )}

        <div className={styles.field}>
          <span className={styles.label}>Options</span>
          <div className={styles.optionList} data-testid="newgame-options">
            {rest.length > 0 ? (
              rest.map((opt) => (
                <OptionField
                  key={opt.key}
                  option={valueFor(opt)}
                  onChange={handleOptionChange}
                />
              ))
            ) : (
              <span className={styles.empty}>No additional options.</span>
            )}
          </div>
        </div>

        {/* Hidden submit so Enter in a text field triggers Create. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Dialog>
  );
}
