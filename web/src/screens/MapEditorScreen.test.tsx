// Component test for the map editor screen (Phase 5).
//
// Three concerns the task calls out:
//   1. Loading the sample map yields a VALID state (editor-valid present).
//   2. Mutating to an invalid state surfaces an error in the validation panel.
//   3. Export round-trips: export-json parses back to the sample plus explicit board size.
//
// The test drives the UI exactly as a user would (palette tools + canvas clicks +
// import/export buttons), so it also exercises the wiring between the screen, the
// editorActions mutators, validation, and (de)serialization.

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';

import { MapEditorScreen } from './MapEditorScreen';
import { parseMapJson, serializeMapJson } from '../map-editor';
import { sampleMapText } from '../map-editor/testFixtures';

/** Paste text into the import textarea and click "Import pasted JSON". */
function importJson(text: string): void {
  const ta = screen.getByTestId('editor-import') as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value: text } });
  fireEvent.click(screen.getByTestId('editor-import-apply'));
}

describe('MapEditorScreen', () => {
  beforeEach(() => {
    render(<MapEditorScreen />);
  });

  it('mounts with the core editor regions', () => {
    expect(screen.getByTestId('map-editor-screen')).toBeInTheDocument();
    expect(screen.getByTestId('editor-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('editor-palette')).toBeInTheDocument();
    expect(screen.getByTestId('editor-validation')).toBeInTheDocument();
    expect(screen.getByTestId('editor-name')).toBeInTheDocument();
  });

  it('loads the bundled sample map and reports a valid state', () => {
    fireEvent.click(screen.getByTestId('editor-load-sample'));

    // Metadata flowed into the editable name field.
    expect((screen.getByTestId('editor-name') as HTMLInputElement).value).toBe('Sample Two Islands');

    // The validation panel shows the clean "valid" state (no errors).
    expect(screen.getByTestId('editor-valid')).toBeInTheDocument();
    // And there are no error-severity issues listed.
    expect(screen.queryByTestId('editor-issue-error')).not.toBeInTheDocument();

    // The sample's hexes rendered on the canvas (e.g. the clay hex at 0x0309).
    const hex = screen.getByTestId('editor-hex-0x0309');
    expect(hex).toHaveAttribute('data-hextype', 'clay');
  });

  it('surfaces an error when mutated to an invalid state', () => {
    fireEvent.click(screen.getByTestId('editor-load-sample'));
    expect(screen.getByTestId('editor-valid')).toBeInTheDocument();

    // Mutate via the UI: select the Dice tool with the (illegal) value 7 is not
    // offered by the picker, so instead clear a required field — blank the name,
    // which the validator (mirroring CustomMapValidator) rejects.
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '' } });

    // The valid badge is gone and an error issue is listed.
    expect(screen.queryByTestId('editor-valid')).not.toBeInTheDocument();
    const errorIssue = screen.getByTestId('editor-issue-error');
    expect(errorIssue).toBeInTheDocument();
    expect(errorIssue).toHaveTextContent(/missing required field "name"/i);
  });

  it('surfaces a dice-range error when a bad dice number is imported', () => {
    // The dice picker only offers legal values, so exercise the same validator
    // path the Java server enforces by importing a map with diceNum 7.
    const bad = parseMapJson(sampleMapText);
    bad.landHexes[0].diceNum = 7;
    importJson(serializeMapJson(bad));

    expect(screen.queryByTestId('editor-valid')).not.toBeInTheDocument();
    const list = screen.getByTestId('editor-validation-list');
    expect(within(list).getByText(/out of range; must be 2\.\.12 except 7/i)).toBeInTheDocument();
  });

  it('exports JSON that round-trips back to the sample map', () => {
    fireEvent.click(screen.getByTestId('editor-load-sample'));
    fireEvent.click(screen.getByTestId('editor-export'));

    const exported = (screen.getByTestId('export-json') as HTMLTextAreaElement).value;
    expect(exported.length).toBeGreaterThan(0);

    // The editor adds explicit fitted board size to legacy maps which omitted it,
    // so what users export matches the canvas frame they edited.
    const original = { ...parseMapJson(sampleMapText), boardHeight: 16, boardWidth: 17 };
    const roundTripped = parseMapJson(exported);
    expect(roundTripped).toEqual(original);
    expect(serializeMapJson(roundTripped)).toBe(serializeMapJson(original));
  });

  it('expands the board frame and exports the custom size', () => {
    fireEvent.click(screen.getByTestId('editor-load-sample'));

    expect(screen.getByTestId('editor-canvas')).toHaveAttribute('data-board-height', '16');
    expect(screen.getByTestId('editor-canvas')).toHaveAttribute('data-board-width', '17');

    fireEvent.click(screen.getByTestId('editor-board-height-inc'));
    fireEvent.click(screen.getByTestId('editor-board-width-inc'));

    expect(screen.getByTestId('editor-canvas')).toHaveAttribute('data-board-height', '18');
    expect(screen.getByTestId('editor-canvas')).toHaveAttribute('data-board-width', '19');
    expect(screen.getByTestId('editor-board-height')).toHaveValue(18);
    expect(screen.getByTestId('editor-board-width')).toHaveValue(19);

    fireEvent.click(screen.getByTestId('editor-export'));
    const exported = parseMapJson((screen.getByTestId('export-json') as HTMLTextAreaElement).value);
    expect(exported.boardHeight).toBe(18);
    expect(exported.boardWidth).toBe(19);
  });

  it('clears a hex from the canvas with the hex tool (alt-click)', () => {
    fireEvent.click(screen.getByTestId('editor-load-sample'));
    // Hex tool is the default; alt-click the clay hex's polygon to clear it.
    const hexGroup = screen.getByTestId('editor-hex-0x0309');
    const polygon = hexGroup.querySelector('polygon') as SVGPolygonElement;
    fireEvent.click(polygon, { altKey: true });

    // Area ranges are rebuilt instead of leaving a stale count behind.
    expect(screen.getByTestId('editor-valid')).toBeInTheDocument();
    expect(screen.getByTestId('editor-hex-0x0309')).toHaveAttribute('data-hextype', '');

    fireEvent.click(screen.getByTestId('editor-export'));
    const exported = parseMapJson((screen.getByTestId('export-json') as HTMLTextAreaElement).value);
    expect(exported.landAreas).toEqual([
      { area: 1, count: 7 },
      { area: 2, count: 4 },
    ]);
  });

  it('assigns a placed hex to a land area and exports authoritative area ranges', () => {
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: 'Two Areas' } });
    fireEvent.click(screen.getByTestId('editor-hextype-clay'));
    fireEvent.click(screen.getByTestId('editor-hex-0x0309').querySelector('polygon') as SVGPolygonElement);
    fireEvent.change(screen.getByTestId('editor-landarea'), { target: { value: '2' } });
    fireEvent.click(screen.getByTestId('editor-hextype-ore'));
    fireEvent.click(screen.getByTestId('editor-hex-0x030B').querySelector('polygon') as SVGPolygonElement);

    expect(screen.getByTestId('editor-area-0x0309')).toHaveTextContent('A1');
    expect(screen.getByTestId('editor-area-0x030B')).toHaveTextContent('A2');

    fireEvent.click(screen.getByTestId('editor-export'));
    const exported = parseMapJson((screen.getByTestId('export-json') as HTMLTextAreaElement).value);
    expect(exported.landAreas).toEqual([
      { area: 1, count: 1 },
      { area: 2, count: 1 },
    ]);
  });
});
