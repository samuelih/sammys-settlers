import type { JSX } from 'react';

import { Panel } from '../../components';
import { type ValidationIssue } from '../validation';
import styles from '../../screens/MapEditorScreen.module.css';

export interface ValidationPanelProps {
  issues: ValidationIssue[];
}

/**
 * Live validation readout. Lists every {@link ValidationIssue} from
 * {@link validate} (errors first, then warnings) and shows a clear "valid" state
 * when there are no error-severity issues. Errors mean the Java
 * `CustomMapValidator` would reject the map; warnings are editor heuristics the
 * server does not enforce.
 */
export function ValidationPanel({ issues }: ValidationPanelProps): JSX.Element {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const ordered = [...errors, ...warnings];
  const hasErrors = errors.length > 0;

  const headerActions = (
    <span className={styles.statusReadout} data-testid="editor-validation-summary">
      {errors.length} error{errors.length === 1 ? '' : 's'}, {warnings.length} warning
      {warnings.length === 1 ? '' : 's'}
    </span>
  );

  return (
    <Panel title="Validation" headerActions={headerActions} data-testid="editor-validation">
      {!hasErrors && (
        <div className={styles.validOk} data-testid="editor-valid" role="status">
          <span aria-hidden="true">✓</span>
          <span>
            Valid — the server would accept this map
            {warnings.length > 0 ? ` (with ${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''}.
          </span>
        </div>
      )}
      {ordered.length > 0 && (
        <ul className={styles.validList} data-testid="editor-validation-list">
          {ordered.map((issue, i) => (
            <li
              key={`${issue.severity}-${issue.field ?? ''}-${i}`}
              data-testid={`editor-issue-${issue.severity}`}
              data-severity={issue.severity}
              className={`${styles.issue} ${issue.severity === 'error' ? styles.issueError : styles.issueWarning}`}
            >
              <span className={styles.issueBadge}>{issue.severity}</span>
              <span>
                {issue.message}
                {issue.field !== undefined && (
                  <>
                    {' '}
                    <span className={styles.issueField}>[{issue.field}]</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default ValidationPanel;
