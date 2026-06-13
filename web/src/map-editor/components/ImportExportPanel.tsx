import type { JSX } from 'react';
import { useRef, useState } from 'react';

import { Button, Panel } from '../../components';
import { type CustomMap, parseMapJson, serializeMapJson } from '../mapSchema';
import type { ValidationIssue } from '../validation';
import styles from '../../screens/MapEditorScreen.module.css';

export interface ImportExportPanelProps {
  map: CustomMap;
  /** Live validation issues from the editor; errors block the one-click download. */
  issues?: ValidationIssue[];
  /** Replace the whole map (used by import / load-sample). */
  onLoad: (map: CustomMap) => void;
  /** Raw JSON text of the bundled sample map, for the "Load sample" button. */
  sampleJson: string;
}

/**
 * Import / export controls for `.map.json`.
 *
 * Import: paste JSON into the textarea (data-testid="editor-import") and click
 * Import, OR pick a file, OR load the bundled sample. Export: serialize the current
 * map to canonical `.map.json` (shown in data-testid="export-json") and offer a
 * download. Parsing errors are surfaced inline; they never throw past this panel.
 */
export function ImportExportPanel({ map, issues, onLoad, sampleJson }: ImportExportPanelProps): JSX.Element {
  const [importText, setImportText] = useState('');
  const [exportText, setExportText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const errorCount = (issues ?? []).filter((issue) => issue.severity === 'error').length;
  const filename = `${fileBaseName(map.name)}.map.json`;
  const scenarioKey = scenarioKeyForFilename(filename);
  const playCommand = [
    'mkdir -p custommaps',
    `cp ~/Downloads/${filename} custommaps/${filename}`,
    'java -Djsettlers.custommaps.dir=custommaps -jar build/libs/JSettlersServer-*.jar',
  ].join('\n');

  const doImport = (text: string): void => {
    try {
      const parsed = parseMapJson(text);
      onLoad(parsed);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleImportClick = (): void => {
    if (importText.trim().length === 0) {
      setError('Paste .map.json text to import (or use Load sample / Choose file).');
      return;
    }
    doImport(importText);
  };

  const handleLoadSample = (): void => {
    setImportText(sampleJson);
    doImport(sampleJson);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setImportText(text);
      doImport(text);
    };
    reader.onerror = () => setError('Could not read the selected file.');
    reader.readAsText(file);
    // Reset so re-selecting the same file fires change again.
    e.target.value = '';
  };

  const handleExport = (): void => {
    const json = serializeMapJson(map);
    setExportText(json);
    setError(null);
  };

  const downloadJson = (json: string): void => {
    if (exportText.length === 0) {
      setExportText(json);
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownload = (): void => {
    downloadJson(exportText.length > 0 ? exportText : serializeMapJson(map));
    setError(null);
  };

  const handleValidatedDownload = (): void => {
    if (errorCount > 0) {
      setError('Fix validation errors before downloading a server-ready map.');
      return;
    }
    const json = serializeMapJson(map);
    setExportText(json);
    downloadJson(json);
    setError(null);
  };

  const copyText = (text: string, label: string): void => {
    if (!navigator.clipboard) {
      setError('Clipboard is not available in this browser context.');
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopyStatus(`${label} copied.`);
        setError(null);
      },
      () => setError(`Could not copy ${label.toLowerCase()}.`),
    );
  };

  return (
    <Panel title="Import / Export" data-testid="editor-io">
      <div className={styles.exportMeta} data-testid="editor-export-meta">
        <div>
          <span className={styles.metaLabel}>File</span>
          <code>{filename}</code>
        </div>
        <div>
          <span className={styles.metaLabel}>Scenario</span>
          <code>{scenarioKey}</code>
        </div>
        <div>
          <span className={styles.metaLabel}>Server</span>
          <code>custommaps/</code>
        </div>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Import</span>
        <div className={styles.ioActions}>
          <Button size="sm" variant="secondary" data-testid="editor-load-sample" onClick={handleLoadSample}>
            Load sample
          </Button>
          <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
            Choose file…
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.map.json,application/json"
            data-testid="editor-import-file"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
          <Button size="sm" data-testid="editor-import-apply" onClick={handleImportClick}>
            Import pasted JSON
          </Button>
        </div>
        <textarea
          data-testid="editor-import"
          aria-label="Paste .map.json to import"
          className={styles.textarea}
          value={importText}
          placeholder='Paste a .map.json document here, then click "Import pasted JSON".'
          spellCheck={false}
          onChange={(e) => setImportText(e.target.value)}
        />
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Export</span>
        <div className={styles.ioActions}>
          <Button
            size="sm"
            variant="primary"
            data-testid="editor-validate-download"
            disabled={errorCount > 0}
            onClick={handleValidatedDownload}
          >
            Validate &amp; download
          </Button>
          <Button size="sm" data-testid="editor-export" onClick={handleExport}>
            Export to JSON
          </Button>
          <Button size="sm" variant="secondary" data-testid="editor-download" onClick={handleDownload}>
            Download .map.json
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => copyText(exportText.length > 0 ? exportText : serializeMapJson(map), 'JSON')}
          >
            Copy JSON
          </Button>
        </div>
        <textarea
          data-testid="export-json"
          aria-label="Exported .map.json"
          className={styles.textarea}
          value={exportText}
          readOnly
          spellCheck={false}
          placeholder='Click "Export to JSON" to serialize the current map here.'
        />
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Play</span>
        <div className={styles.ioActions}>
          <Button size="sm" variant="secondary" onClick={() => copyText(playCommand, 'Server command')}>
            Copy server command
          </Button>
          <span className={styles.statusReadout}>Select {scenarioKey} in New Game after restart.</span>
        </div>
        <textarea
          aria-label="Server command for loading this custom map"
          className={styles.textarea}
          value={playCommand}
          readOnly
          spellCheck={false}
        />
      </div>

      {copyStatus !== null && (
        <p className={styles.ioStatus} data-testid="editor-copy-status" role="status">
          {copyStatus}
        </p>
      )}

      {error !== null && (
        <p className={styles.ioError} data-testid="editor-io-error" role="alert">
          {error}
        </p>
      )}
    </Panel>
  );
}

/** Slugify a map name into a safe download filename base; falls back to "custom". */
function fileBaseName(name: string): string {
  const slug = (name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'custom';
}

/** Mirror CustomMapLoader.deriveScenarioKey for the generated download filename. */
function scenarioKeyForFilename(filename: string): string {
  const base = filename.toLowerCase().endsWith('.map.json')
    ? filename.slice(0, -'.map.json'.length)
    : filename;
  const chars = base.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  return `SC_X${chars.length > 0 ? chars : 'CUST'}`;
}

export default ImportExportPanel;
