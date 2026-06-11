import type { JSX } from 'react';
import { useRef, useState } from 'react';

import { Button, Panel } from '../../components';
import { type CustomMap, parseMapJson, serializeMapJson } from '../mapSchema';
import styles from '../../screens/MapEditorScreen.module.css';

export interface ImportExportPanelProps {
  map: CustomMap;
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
export function ImportExportPanel({ map, onLoad, sampleJson }: ImportExportPanelProps): JSX.Element {
  const [importText, setImportText] = useState('');
  const [exportText, setExportText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleDownload = (): void => {
    const json = exportText.length > 0 ? exportText : serializeMapJson(map);
    if (exportText.length === 0) {
      setExportText(json);
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBaseName(map.name)}.map.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Panel title="Import / Export" data-testid="editor-io">
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
          <Button size="sm" data-testid="editor-export" onClick={handleExport}>
            Export to JSON
          </Button>
          <Button size="sm" variant="secondary" data-testid="editor-download" onClick={handleDownload}>
            Download .map.json
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

export default ImportExportPanel;
