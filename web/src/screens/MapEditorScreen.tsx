import { useMemo, useState } from 'react';

import { Button, Panel } from '../components';
import { useUiStore } from '../store/uiStore';
import {
  type CustomMap,
  type HexTypeName,
  type PortTypeName,
  type FacingName,
  emptyMap,
  parseCoord,
  validate,
} from '../map-editor';
import {
  placeHex,
  clearHex,
  setHexDice,
  placePort,
  clearPort,
  toggleRobber,
  togglePirate,
  setName,
  setDescription,
  togglePlayerCount,
  setPlayerCounts,
  setShuffle,
  indexOfHexAt,
} from '../map-editor/editorActions';
import { SAMPLE_MAP_JSON } from '../map-editor/sampleMapData';
import { EditorCanvas, type EditorTool } from '../map-editor/components/EditorCanvas';
import { EditorPalette } from '../map-editor/components/EditorPalette';
import { ValidationPanel } from '../map-editor/components/ValidationPanel';
import { ImportExportPanel } from '../map-editor/components/ImportExportPanel';
import styles from './MapEditorScreen.module.css';

/**
 * Standalone visual board/map editor (Phase 5).
 *
 * Composes the map-editor data layer (`src/map-editor/`: schema, validation,
 * mutation actions) with an interactive SVG canvas, a tool palette, a live
 * validation panel, and import/export of `.map.json`. The exported document is
 * byte-compatible with the Java `soc.server.CustomMapValidator` (proven by the
 * Playwright round-trip in `web/e2e/map-editor.spec.ts`).
 *
 * The "Back" action returns to the lobby/connect flow via the UI store's appView.
 */
export function MapEditorScreen(): JSX.Element {
  const setAppView = useUiStore((s) => s.setAppView);

  const [map, setMap] = useState<CustomMap>(() => emptyMap());

  // Palette selections (what the next click paints).
  const [tool, setTool] = useState<EditorTool>('hex');
  const [hexType, setHexType] = useState<HexTypeName>('clay');
  const [diceNum, setDiceNum] = useState<number>(6);
  const [landArea, setLandArea] = useState<number>(1);
  const [portType, setPortType] = useState<PortTypeName>('misc');
  const [portFacing, setPortFacing] = useState<FacingName>('SE');
  const [showCoordinates, setShowCoordinates] = useState<boolean>(false);

  // Live validation, recomputed whenever the map changes.
  const issues = useMemo(() => validate(map), [map]);
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

  // --- Canvas interaction handlers ---------------------------------------
  const handleHexClick = (coord: number, alt: boolean): void => {
    switch (tool) {
      case 'hex':
        setMap((m) => (alt ? clearHex(m, coord) : placeHex(m, coord, hexType, landArea)));
        break;
      case 'dice':
        // Dice tool only applies to a placed hex; clicking empty does nothing.
        setMap((m) =>
          indexOfHexAt(m, coord) >= 0 ? setHexDice(m, coord, alt ? 0 : diceNum) : m,
        );
        break;
      case 'robber':
        setMap((m) => (alt ? clearRobberAt(m, coord) : toggleRobber(m, coord)));
        break;
      case 'pirate':
        setMap((m) => (alt ? clearPirateAt(m, coord) : togglePirate(m, coord)));
        break;
      case 'port':
        // In port mode a hex click is ignored; ports go on edges.
        break;
      default:
        break;
    }
  };

  const handlePortClick = (edge: number, alt: boolean): void => {
    if (tool !== 'port') {
      return;
    }
    setMap((m) => (alt ? clearPort(m, edge) : placePort(m, edge, portType, portFacing)));
  };

  // --- Metadata + IO handlers --------------------------------------------
  const loadMap = (next: CustomMap): void => setMap(next);

  const handleNew = (): void => {
    if (
      map.landHexes.length === 0 ||
      // eslint-disable-next-line no-alert
      window.confirm('Start a new empty map? Unsaved changes will be lost.')
    ) {
      setMap(emptyMap());
    }
  };

  return (
    <div className={styles.wrap} data-testid="map-editor-screen">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h2 className={styles.title}>Map Editor</h2>
          <p className={styles.subtitle}>
            Design a custom board and export it as a <code>.map.json</code> file.
          </p>
        </div>
        <span className={styles.headerSpacer} />
        <Button variant="secondary" size="sm" data-testid="editor-new" onClick={handleNew}>
          New map
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="map-editor-back"
          onClick={() => setAppView('lobby')}
        >
          ← Back to lobby
        </Button>
      </header>

      <div className={styles.layout}>
        <EditorPalette
          map={map}
          tool={tool}
          onToolChange={setTool}
          hexType={hexType}
          onHexTypeChange={setHexType}
          diceNum={diceNum}
          onDiceNumChange={setDiceNum}
          landArea={landArea}
          onLandAreaChange={setLandArea}
          portType={portType}
          onPortTypeChange={setPortType}
          portFacing={portFacing}
          onPortFacingChange={setPortFacing}
          onNameChange={(name) => setMap((m) => setName(m, name))}
          onDescriptionChange={(d) => setMap((m) => setDescription(m, d))}
          onTogglePlayerCount={(c) => setMap((m) => togglePlayerCount(m, c))}
          onPlayerCountsChange={(counts) => setMap((m) => setPlayerCounts(m, counts))}
          onShuffleChange={(b) => setMap((m) => setShuffle(m, b))}
        />

        <div className={styles.rightColumn}>
          <Panel
            title="Board"
            flushBody
            className={styles.canvasPanel}
            data-testid="editor-board"
            headerActions={
              <div className={styles.boardActions}>
                <span className={styles.statusReadout} data-testid="editor-map-stats">
                  {map.landHexes.length} hexes · {(map.ports ?? []).length} ports · {errorCount} errors
                  {warningCount > 0 ? ` · ${warningCount} warnings` : ''}
                </span>
                <label className={styles.viewToggle}>
                  <input
                    type="checkbox"
                    checked={showCoordinates}
                    onChange={(e) => setShowCoordinates(e.target.checked)}
                  />
                  Coords
                </label>
              </div>
            }
          >
            <EditorCanvas
              map={map}
              tool={tool}
              showCoordinates={showCoordinates}
              onHexClick={handleHexClick}
              onPortClick={handlePortClick}
            />
          </Panel>

          <ValidationPanel issues={issues} />

          <ImportExportPanel map={map} issues={issues} onLoad={loadMap} sampleJson={SAMPLE_MAP_JSON} />
        </div>
      </div>
    </div>
  );
}

/** Clear the robber only if it currently sits on `coord`. */
function clearRobberAt(map: CustomMap, coord: number): CustomMap {
  if (parseCoord(map.robberHex) !== coord) {
    return map;
  }
  const next = { ...map };
  delete next.robberHex;
  return next;
}

/** Clear the pirate only if it currently sits on `coord`. */
function clearPirateAt(map: CustomMap, coord: number): CustomMap {
  if (parseCoord(map.pirateHex) !== coord) {
    return map;
  }
  const next = { ...map };
  delete next.pirateHex;
  return next;
}

export default MapEditorScreen;
