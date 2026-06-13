import type { JSX } from 'react';

import { Panel } from '../../components';
import { type CustomMap } from '../mapSchema';
import { type ValidationIssue } from '../validation';
import styles from '../../screens/MapEditorScreen.module.css';

export interface MapReadinessPanelProps {
  map: CustomMap;
  issues: ValidationIssue[];
}

type ReadinessState = 'good' | 'warn' | 'error';

interface ReadinessItem {
  label: string;
  value: string;
  state: ReadinessState;
}

/** Compact game-coverage dashboard for the custom-map authoring workflow. */
export function MapReadinessPanel({ map, issues }: MapReadinessPanelProps): JSX.Element {
  const items = buildReadinessItems(map, issues);
  const facts = buildFacts(map);

  return (
    <Panel title="Map Readiness" data-testid="editor-readiness">
      <div className={styles.readinessFacts} data-testid="editor-readiness-facts">
        {facts.map((fact) => (
          <span key={fact.label} className={styles.factPill}>
            <strong>{fact.value}</strong>
            <span>{fact.label}</span>
          </span>
        ))}
      </div>
      <ul className={styles.readinessList}>
        {items.map((item) => (
          <li
            key={item.label}
            className={`${styles.readinessItem} ${readinessClass(item.state)}`}
            data-testid={`editor-readiness-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          >
            <span className={styles.readinessDot} aria-hidden="true" />
            <span className={styles.readinessLabel}>{item.label}</span>
            <span className={styles.readinessValue}>{item.value}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function buildReadinessItems(map: CustomMap, issues: ValidationIssue[]): ReadinessItem[] {
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  const terrain = terrainSummary(map);
  const dice = diceSummary(map);
  const maxPlayers = Math.max(0, ...(map.playerCounts ?? []));
  const ports = map.ports?.length ?? 0;
  const areas = map.landAreas?.length ?? 1;

  return [
    {
      label: 'Server',
      value: errors > 0 ? `${errors} blocking` : warnings > 0 ? `${warnings} advisory` : 'ready',
      state: errors > 0 ? 'error' : warnings > 0 ? 'warn' : 'good',
    },
    {
      label: 'Terrain',
      value: `${terrain.land} land, ${terrain.resources.size}/5 resources`,
      state: terrain.land === 0 ? 'error' : terrain.resources.size >= 5 ? 'good' : 'warn',
    },
    {
      label: 'Dice',
      value: map.shuffle ? `${dice.numbered} numbers, shuffled` : `${dice.numbered}/${dice.resourceHexes} numbered`,
      state: dice.resourceHexes === 0 ? 'error' : dice.numbered === dice.resourceHexes || map.shuffle ? 'good' : 'warn',
    },
    {
      label: 'Ports',
      value: ports === 0 ? 'none' : `${ports} placed`,
      state: maxPlayers >= 3 && ports === 0 ? 'warn' : 'good',
    },
    {
      label: 'Areas',
      value: `${areas} area${areas === 1 ? '' : 's'}`,
      state: areas >= 1 && hasAreaOne(map) ? 'good' : 'error',
    },
    {
      label: 'Starts',
      value: `${map.robberHex ? 'robber' : 'no robber'} · ${map.pirateHex ? 'pirate' : 'no pirate'}`,
      state: map.robberHex ? 'good' : 'warn',
    },
  ];
}

function buildFacts(map: CustomMap): Array<{ label: string; value: string }> {
  const terrain = terrainSummary(map);
  const ports = map.ports?.length ?? 0;
  const counts = map.playerCounts.length > 0 ? map.playerCounts.join('/') : '0';
  return [
    { label: 'players', value: counts },
    { label: 'hexes', value: String(terrain.land + terrain.water) },
    { label: 'ports', value: String(ports) },
  ];
}

function terrainSummary(map: CustomMap): { land: number; water: number; resources: Set<string> } {
  const resources = new Set<string>();
  let land = 0;
  let water = 0;
  for (const h of map.landHexes ?? []) {
    const type = (h.type ?? '').toLowerCase();
    if (type === 'water') {
      water += 1;
    } else {
      land += 1;
    }
    if (['clay', 'ore', 'sheep', 'wheat', 'wood'].includes(type)) {
      resources.add(type);
    }
  }
  return { land, water, resources };
}

function diceSummary(map: CustomMap): { resourceHexes: number; numbered: number } {
  let resourceHexes = 0;
  let numbered = 0;
  for (const h of map.landHexes ?? []) {
    const type = (h.type ?? '').toLowerCase();
    if (!['clay', 'ore', 'sheep', 'wheat', 'wood'].includes(type)) {
      continue;
    }
    resourceHexes += 1;
    if (h.diceNum >= 2 && h.diceNum <= 12 && h.diceNum !== 7) {
      numbered += 1;
    }
  }
  return { resourceHexes, numbered };
}

function hasAreaOne(map: CustomMap): boolean {
  return !map.landAreas || map.landAreas.length === 0 || map.landAreas.some((area) => area.area === 1);
}

function readinessClass(state: ReadinessState): string {
  switch (state) {
    case 'good':
      return styles.readinessGood;
    case 'warn':
      return styles.readinessWarn;
    case 'error':
      return styles.readinessError;
    default:
      return '';
  }
}

export default MapReadinessPanel;
