import type { JSX } from 'react';

import { Panel } from '../../components';
import {
  type CustomMap,
  type HexTypeName,
  type PortTypeName,
  type FacingName,
  HEX_TYPE_NAMES,
  PORT_TYPE_NAMES,
  FACING_NAMES,
  SUPPORTED_PLAYER_COUNTS,
} from '../mapSchema';
import type { EditorTool } from './EditorCanvas';
import type { HexKind } from '../../board/types';
import { terrainTextureFor } from '../../board/pieces/TerrainTexture';
import styles from '../../screens/MapEditorScreen.module.css';

/** Hex-type -> swatch fill CSS variable, matching the canvas/board theme tokens. */
const HEX_SWATCH_VAR: Record<HexTypeName, string> = {
  clay: 'var(--hex-fill-clay)',
  ore: 'var(--hex-fill-ore)',
  sheep: 'var(--hex-fill-sheep)',
  wheat: 'var(--hex-fill-wheat)',
  wood: 'var(--hex-fill-wood)',
  desert: 'var(--hex-fill-desert)',
  gold: 'var(--hex-fill-gold)',
  water: 'var(--hex-fill-water)',
};

/** Valid dice numbers a resource hex may carry (0 = no number). */
const DICE_CHOICES = [0, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12] as const;

export interface EditorPaletteProps {
  map: CustomMap;
  /** Currently-selected edit tool. */
  tool: EditorTool;
  onToolChange: (tool: EditorTool) => void;

  /** Currently-selected hex type (used by the hex tool). */
  hexType: HexTypeName;
  onHexTypeChange: (t: HexTypeName) => void;

  /** Dice number the dice tool applies on click. */
  diceNum: number;
  onDiceNumChange: (n: number) => void;

  /** Land-area number new hexes are tagged with. */
  landArea: number;
  onLandAreaChange: (n: number) => void;

  /** Port tool selections. */
  portType: PortTypeName;
  onPortTypeChange: (t: PortTypeName) => void;
  portFacing: FacingName;
  onPortFacingChange: (f: FacingName) => void;

  /** Metadata edits. */
  onNameChange: (name: string) => void;
  onDescriptionChange: (d: string) => void;
  onTogglePlayerCount: (c: number) => void;
  onPlayerCountsChange: (counts: readonly number[]) => void;
  onShuffleChange: (b: boolean) => void;
}

/** The selectable editor tools, with labels. */
const TOOLS: ReadonlyArray<{ id: EditorTool; label: string }> = [
  { id: 'hex', label: 'Hex' },
  { id: 'dice', label: 'Dice #' },
  { id: 'area', label: 'Area' },
  { id: 'port', label: 'Port' },
  { id: 'robber', label: 'Robber' },
  { id: 'pirate', label: 'Pirate' },
];

/** Authoring presets: custom maps stay standard-rules but advertise player support. */
const PROFILES: ReadonlyArray<{ id: string; label: string; counts: readonly number[] }> = [
  { id: 'duel', label: '2P Duel', counts: [2] },
  { id: 'classic', label: '3-4P Classic', counts: [3, 4] },
  { id: 'six', label: '6P Expansion', counts: [4, 6] },
  { id: 'all', label: 'All Counts', counts: [2, 3, 4, 6] },
];

/**
 * The editor palette / toolbar (left rail). Selects the active tool, the hex type
 * and dice number to paint, the port type + facing, the land area for new hexes,
 * and edits the map metadata (name/description/playerCounts/shuffle). All state is
 * lifted to the parent screen; this component is presentational.
 */
export function EditorPalette(props: EditorPaletteProps): JSX.Element {
  const {
    map,
    tool,
    onToolChange,
    hexType,
    onHexTypeChange,
    diceNum,
    onDiceNumChange,
    landArea,
    onLandAreaChange,
    portType,
    onPortTypeChange,
    portFacing,
    onPortFacingChange,
    onNameChange,
    onDescriptionChange,
    onTogglePlayerCount,
    onPlayerCountsChange,
    onShuffleChange,
  } = props;
  const activeProfile = PROFILES.find((profile) => sameCounts(profile.counts, map.playerCounts));

  return (
    <Panel title="Tools & Palette" data-testid="editor-palette" className={styles.palette}>
      {/* Active tool */}
      <div className={styles.group}>
        <span className={styles.groupLabel}>Tool</span>
        <div className={styles.toolRow} role="radiogroup" aria-label="Editor tool">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tool === t.id}
              data-testid={`editor-tool-${t.id}`}
              className={`${styles.tool}${tool === t.id ? ` ${styles.toolActive}` : ''}`}
              onClick={() => onToolChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className={styles.hint}>
          {toolHint(tool)}
        </p>
      </div>

      <div className={styles.group}>
        <span className={styles.groupLabel}>Expansion</span>
        <div className={styles.profileGrid} role="radiogroup" aria-label="Expansion profile">
          {PROFILES.map((profile) => (
            <button
              key={profile.id}
              type="button"
              role="radio"
              aria-checked={activeProfile?.id === profile.id}
              data-testid={`editor-profile-${profile.id}`}
              className={`${styles.profile}${activeProfile?.id === profile.id ? ` ${styles.profileActive}` : ''}`}
              onClick={() => onPlayerCountsChange(profile.counts)}
            >
              <span className={styles.profileLabel}>{profile.label}</span>
              <span className={styles.profileCounts}>{profile.counts.join(', ')} players</span>
            </button>
          ))}
        </div>
      </div>

      {/* Hex-type palette */}
      <div className={styles.group}>
        <span className={styles.groupLabel}>Hex type</span>
        <div className={styles.swatchRow} role="radiogroup" aria-label="Hex type">
          {HEX_TYPE_NAMES.map((name) => {
            const textureHref = terrainTextureFor(name as HexKind);
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={hexType === name}
                data-testid={`editor-hextype-${name}`}
                className={`${styles.swatch}${hexType === name ? ` ${styles.swatchActive}` : ''}`}
                onClick={() => onHexTypeChange(name)}
              >
                <span
                  className={styles.swatchChip}
                  style={{
                    backgroundColor: HEX_SWATCH_VAR[name],
                    backgroundImage: textureHref ? `url(${textureHref})` : undefined,
                  }}
                  aria-hidden="true"
                />
                <span className={styles.swatchName}>{name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dice number */}
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="editor-dice-select">
          Dice number (for Dice tool)
        </label>
        <select
          id="editor-dice-select"
          data-testid="editor-dice"
          className={styles.select}
          value={diceNum}
          onChange={(e) => onDiceNumChange(Number(e.target.value))}
        >
          {DICE_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n === 0 ? 'none' : n}
            </option>
          ))}
        </select>
      </div>

      {/* Land area */}
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="editor-landarea">
          Active land area
        </label>
        <input
          id="editor-landarea"
          data-testid="editor-landarea"
          className={styles.input}
          type="number"
          min={1}
          max={9}
          value={landArea}
          onChange={(e) => onLandAreaChange(Math.max(1, Number(e.target.value) || 1))}
        />
      </div>

      {/* Port tool config */}
      <div className={styles.group}>
        <span className={styles.groupLabel}>Port</span>
        <div className={styles.inlineRow}>
          <select
            data-testid="editor-port-type"
            aria-label="Port type"
            className={styles.select}
            value={portType}
            onChange={(e) => onPortTypeChange(e.target.value as PortTypeName)}
          >
            {PORT_TYPE_NAMES.map((t) => (
              <option key={t} value={t}>
                {t === 'misc' || t === '3:1' ? '3:1 (misc)' : t}
              </option>
            ))}
          </select>
          <select
            data-testid="editor-port-facing"
            aria-label="Port facing"
            className={styles.select}
            value={portFacing}
            onChange={(e) => onPortFacingChange(e.target.value as FacingName)}
          >
            {FACING_NAMES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <p className={styles.hint}>
          Coast slots auto-face the adjacent land hex; the selected facing is used only when it is legal.
        </p>
      </div>

      {/* Metadata */}
      <div className={styles.group}>
        <span className={styles.groupLabel}>Map details</span>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="editor-name">
            Name
          </label>
          <input
            id="editor-name"
            data-testid="editor-name"
            className={styles.input}
            type="text"
            value={map.name}
            placeholder="Map name"
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="editor-description">
            Description
          </label>
          <textarea
            id="editor-description"
            data-testid="editor-description"
            className={styles.textarea}
            style={{ minHeight: '4rem', whiteSpace: 'normal' }}
            value={map.description ?? ''}
            placeholder="Optional description"
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Player counts</span>
          <div className={styles.inlineRow} data-testid="editor-playercounts">
            {SUPPORTED_PLAYER_COUNTS.map((c) => (
              <label key={c} className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  data-testid={`editor-playercount-${c}`}
                  checked={map.playerCounts.includes(c)}
                  onChange={() => onTogglePlayerCount(c)}
                />
                {c}
              </label>
            ))}
          </div>
        </div>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            data-testid="editor-shuffle"
            checked={map.shuffle}
            onChange={(e) => onShuffleChange(e.target.checked)}
          />
          Shuffle hex types &amp; dice each game
        </label>
      </div>
    </Panel>
  );
}

/** Short usage hint per tool. */
function toolHint(tool: EditorTool): string {
  switch (tool) {
    case 'hex':
      return 'Click a cell to place the selected hex type. Alt/right-click clears it.';
    case 'dice':
      return 'Click a resource hex to set the selected dice number. Alt/right-click clears it.';
    case 'area':
      return 'Click a placed hex to assign it to the active land area.';
    case 'port':
      return 'Click a coastline edge slot to drop the selected port. Click a port to remove it.';
    case 'robber':
      return 'Click a hex to set/clear the robber start. Alt/right-click also clears.';
    case 'pirate':
      return 'Click a hex to set/clear the pirate start. Alt/right-click also clears.';
    default:
      return '';
  }
}

/** True when both player-count lists contain the same values in order. */
function sameCounts(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, i) => value === b[i]);
}

export default EditorPalette;
