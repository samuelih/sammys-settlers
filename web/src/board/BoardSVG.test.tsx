import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardSVG } from './BoardSVG';
import {
  type BoardModel,
  type BoardPiece,
  HEX_CLAY,
  HEX_DESERT,
  HEX_WATER,
  PIECE_SETTLEMENT,
  PIECE_ROAD,
  FACING_NE,
} from './types';
import { coordOf, getAdjacentNodesToHex } from './coords';

const HEX_A = coordOf(3, 3); // clay, dice 8
const HEX_B = coordOf(3, 5); // desert (no number)
const HEX_C = coordOf(1, 4); // water
const SETTLE_NODE = getAdjacentNodesToHex(HEX_A)[0]; // N corner of HEX_A
const ROAD_EDGE = coordOf(3, 3); // a vertical edge

const board: BoardModel = {
  encoding: 3,
  width: 10,
  height: 8,
  hexes: [
    { coord: HEX_A, row: 3, col: 3, hexType: HEX_CLAY, diceNum: 8 },
    { coord: HEX_B, row: 3, col: 5, hexType: HEX_DESERT, diceNum: 0 },
    { coord: HEX_C, row: 1, col: 4, hexType: HEX_WATER, diceNum: 0 },
  ],
  ports: [{ edge: coordOf(2, 4), ptype: 0, facing: FACING_NE }],
  robberHex: HEX_B,
  pirateHex: 0,
};

const pieces: BoardPiece[] = [
  { ptype: PIECE_SETTLEMENT, coord: SETTLE_NODE, playerNumber: 0 },
  { ptype: PIECE_ROAD, coord: ROAD_EDGE, playerNumber: 1 },
];

const PLAYER_COLORS = ['#2a6fd6', '#d63a3a', '#2faa57', '#e58a26'];

describe('BoardSVG', () => {
  it('renders the board-svg root with the expected hex count', () => {
    render(<BoardSVG board={board} pieces={[]} playerColors={PLAYER_COLORS} />);
    const svg = screen.getByTestId('board-svg');
    expect(svg).toBeInTheDocument();

    const hexes = within(screen.getByTestId('board-hexes')).getAllByTestId(/^hex-/);
    expect(hexes).toHaveLength(3);
    // Each board hex is reachable by its coord-keyed testid.
    expect(screen.getByTestId(`hex-${HEX_A}`)).toBeInTheDocument();
    expect(screen.getByTestId(`hex-${HEX_B}`)).toBeInTheDocument();
    expect(screen.getByTestId(`hex-${HEX_C}`)).toBeInTheDocument();
  });

  it('shows a dice number on the resource hex but not on desert/water', () => {
    render(<BoardSVG board={board} pieces={[]} playerColors={PLAYER_COLORS} />);
    expect(screen.getByTestId(`dice-${HEX_A}`)).toHaveTextContent('8');
    expect(screen.queryByTestId(`dice-${HEX_B}`)).toBeNull();
    expect(screen.queryByTestId(`dice-${HEX_C}`)).toBeNull();
  });

  it('renders the robber on the robber hex', () => {
    render(<BoardSVG board={board} pieces={[]} playerColors={PLAYER_COLORS} />);
    expect(screen.getByTestId('robber')).toBeInTheDocument();
    // No pirate when pirateHex is 0.
    expect(screen.queryByTestId('pirate')).toBeNull();
  });

  it('renders the port marker', () => {
    render(<BoardSVG board={board} pieces={[]} playerColors={PLAYER_COLORS} />);
    const port = screen.getByTestId(`port-${coordOf(2, 4)}`);
    expect(port).toBeInTheDocument();
    expect(port).toHaveTextContent('3:1');
  });

  it('renders a settlement at the correct node and a road on its edge', () => {
    render(<BoardSVG board={board} pieces={pieces} playerColors={PLAYER_COLORS} />);
    const settlement = screen.getByTestId(`settlement-${SETTLE_NODE}`);
    expect(settlement).toBeInTheDocument();
    expect(settlement).toHaveAttribute('data-player', '0');
    // The house glyph is filled with player 0's color.
    expect(settlement.querySelector('path')).toHaveAttribute('fill', PLAYER_COLORS[0]);

    const road = screen.getByTestId(`road-${ROAD_EDGE}`);
    expect(road).toBeInTheDocument();
    expect(road).toHaveAttribute('data-player', '1');
  });

  it('renders clickable node targets for highlightNodes and fires onNodeClick', async () => {
    const onNodeClick = vi.fn();
    const highlightNodes = getAdjacentNodesToHex(HEX_A); // 6 corner nodes
    render(
      <BoardSVG
        board={board}
        pieces={[]}
        playerColors={PLAYER_COLORS}
        highlightNodes={highlightNodes}
        onNodeClick={onNodeClick}
      />,
    );

    const targets = within(screen.getByTestId('board-node-targets')).getAllByTestId(/^node-/);
    expect(targets).toHaveLength(highlightNodes.length);

    const first = highlightNodes[0];
    await userEvent.click(screen.getByTestId(`node-${first}`));
    expect(onNodeClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick).toHaveBeenCalledWith(first);
  });

  it('renders clickable edge targets for highlightEdges and fires onEdgeClick', async () => {
    const onEdgeClick = vi.fn();
    const highlightEdges = [coordOf(3, 3), coordOf(2, 4)];
    render(
      <BoardSVG
        board={board}
        pieces={[]}
        playerColors={PLAYER_COLORS}
        highlightEdges={highlightEdges}
        onEdgeClick={onEdgeClick}
      />,
    );

    const targets = within(screen.getByTestId('board-edge-targets')).getAllByTestId(/^edge-/);
    expect(targets).toHaveLength(2);

    await userEvent.click(screen.getByTestId(`edge-${highlightEdges[1]}`));
    expect(onEdgeClick).toHaveBeenCalledWith(highlightEdges[1]);
  });

  it('omits highlight target groups when none are given', () => {
    render(<BoardSVG board={board} pieces={[]} playerColors={PLAYER_COLORS} />);
    expect(screen.queryByTestId('board-node-targets')).toBeNull();
    expect(screen.queryByTestId('board-edge-targets')).toBeNull();
  });
});
