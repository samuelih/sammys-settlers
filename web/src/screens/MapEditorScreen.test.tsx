// Component test for the map editor screen (Phase 5).
//
// Three concerns the task calls out:
//   1. Loading the sample map yields a VALID state (editor-valid present).
//   2. Mutating to an invalid state surfaces an error in the validation panel.
//   3. Export round-trips: export-json parses back to a map equal to the sample.
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

    // The exported text parses back to a map structurally equal to the sample,
    // and re-serializes identically (lossless round-trip).
    const original = parseMapJson(sampleMapText);
    const roundTripped = parseMapJson(exported);
    expect(roundTripped).toEqual(original);
    expect(serializeMapJson(roundTripped)).toBe(serializeMapJson(original));
  });

  it('clears a hex from the canvas with the hex tool (alt-click)', () => {
    fireEvent.click(screen.getByTestId('editor-load-sample'));
    // Hex tool is the default; alt-click the clay hex's polygon to clear it.
    const hexGroup = screen.getByTestId('editor-hex-0x0309');
    const polygon = hexGroup.querySelector('polygon') as SVGPolygonElement;
    fireEvent.click(polygon, { altKey: true });

    // The hex's land-area count now mismatches (8 declared, 7 remain) -> error,
    // proving the canvas click mutated the model and validation re-ran live.
    expect(screen.queryByTestId('editor-valid')).not.toBeInTheDocument();
    expect(screen.getByTestId('editor-hex-0x0309')).toHaveAttribute('data-hextype', '');
  });
});
