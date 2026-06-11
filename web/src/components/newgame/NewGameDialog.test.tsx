import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { GameOptionDescriptor } from '../../protocol/gameOptions';
import { NewGameDialog } from './NewGameDialog';

function sampleOptions(): GameOptionDescriptor[] {
  return [
    {
      key: 'PL',
      optType: 'int',
      desc: 'Maximum # players',
      defaultIntValue: 4,
      minIntValue: 2,
      maxIntValue: 6,
    },
    {
      key: 'VP',
      optType: 'int',
      desc: 'Victory points to win',
      defaultIntValue: 10,
      minIntValue: 10,
      maxIntValue: 20,
    },
    {
      key: 'BC',
      optType: 'bool',
      desc: 'Break up clumps',
      defaultBoolValue: false,
    },
  ];
}

describe('NewGameDialog', () => {
  it('renders name, nickname (default WebPlayer) and Create/Cancel', () => {
    render(
      <NewGameDialog options={sampleOptions()} onCreate={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId('newgame-name')).toHaveValue('');
    expect(screen.getByTestId('newgame-nick')).toHaveValue('WebPlayer');
    expect(screen.getByTestId('newgame-create')).toBeInTheDocument();
    expect(screen.getByTestId('newgame-cancel')).toBeInTheDocument();
  });

  it('promotes PL and VP into the prominent block at the top', () => {
    render(
      <NewGameDialog options={sampleOptions()} onCreate={vi.fn()} onCancel={vi.fn()} />,
    );
    const prominent = screen.getByTestId('newgame-prominent');
    expect(within(prominent).getByTestId('opt-PL')).toBeInTheDocument();
    expect(within(prominent).getByTestId('opt-VP')).toBeInTheDocument();
    // BC is not prominent; it lives in the scrollable list.
    expect(within(prominent).queryByTestId('opt-BC')).toBeNull();
    expect(
      within(screen.getByTestId('newgame-options')).getByTestId('opt-BC'),
    ).toBeInTheDocument();
  });

  it('disables Create until a game name is entered', async () => {
    const user = userEvent.setup();
    render(
      <NewGameDialog options={sampleOptions()} onCreate={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId('newgame-create')).toBeDisabled();
    await user.type(screen.getByTestId('newgame-name'), 'g1');
    expect(screen.getByTestId('newgame-create')).toBeEnabled();
  });

  it('calls onCreate with the entered name, nick and chosen option values', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(
      <NewGameDialog options={sampleOptions()} onCreate={onCreate} onCancel={vi.fn()} />,
    );

    await user.type(screen.getByTestId('newgame-name'), 'MyGame');
    await user.clear(screen.getByTestId('newgame-nick'));
    await user.type(screen.getByTestId('newgame-nick'), 'Sam');

    // Toggle the BC checkbox in the options list.
    const bc = within(screen.getByTestId('opt-BC')).getByRole('checkbox');
    await user.click(bc);

    await user.click(screen.getByTestId('newgame-create'));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const [name, nick, chosen, scenarioKey] = onCreate.mock.calls[0] as [
      string,
      string,
      GameOptionDescriptor[],
      string | undefined,
    ];
    expect(name).toBe('MyGame');
    expect(nick).toBe('Sam');
    expect(scenarioKey).toBeUndefined();

    const bcOpt = chosen.find((o) => o.key === 'BC');
    expect(bcOpt?.curBoolValue).toBe(true);
    // Untouched options keep their identity / default.
    const plOpt = chosen.find((o) => o.key === 'PL');
    expect(plOpt?.defaultIntValue).toBe(4);
    expect(chosen).toHaveLength(3);
  });

  it('falls back to default nick WebPlayer when cleared', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    render(
      <NewGameDialog options={sampleOptions()} onCreate={onCreate} onCancel={vi.fn()} />,
    );
    await user.type(screen.getByTestId('newgame-name'), 'g');
    await user.clear(screen.getByTestId('newgame-nick'));
    await user.click(screen.getByTestId('newgame-create'));
    expect(onCreate.mock.calls[0][1]).toBe('WebPlayer');
  });

  it('shows a scenario select when scenarios are provided and passes the chosen key', async () => {
    const onCreate = vi.fn();
    const user = userEvent.setup();
    const scenarios = [
      { key: 'SC_4ISL', desc: 'The Four Islands' },
      { key: 'SC_FOG', desc: 'Fog Islands' },
    ];
    render(
      <NewGameDialog
        options={sampleOptions()}
        scenarios={scenarios}
        onCreate={onCreate}
        onCancel={vi.fn()}
      />,
    );

    const select = screen.getByTestId('newgame-scenario');
    expect(select).toHaveValue('SC_4ISL');
    await user.selectOptions(select, 'SC_FOG');

    await user.type(screen.getByTestId('newgame-name'), 'g');
    await user.click(screen.getByTestId('newgame-create'));
    expect(onCreate.mock.calls[0][3]).toBe('SC_FOG');
  });

  it('does not render a scenario select when no scenarios are given', () => {
    render(
      <NewGameDialog options={sampleOptions()} onCreate={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.queryByTestId('newgame-scenario')).toBeNull();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <NewGameDialog options={sampleOptions()} onCreate={vi.fn()} onCancel={onCancel} />,
    );
    await user.click(screen.getByTestId('newgame-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner in the options area while option discovery is in flight', () => {
    render(
      <NewGameDialog options={[]} optionsLoading onCreate={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByTestId('newgame-options-loading')).toBeInTheDocument();
    // No premature placeholders while loading.
    expect(screen.queryByText('No additional options.')).toBeNull();
    expect(screen.queryByTestId('newgame-prominent')).toBeNull();
    // The name field still renders so the user can type while options load.
    expect(screen.getByTestId('newgame-name')).toBeInTheDocument();
  });

  it('hides the spinner once options have loaded', () => {
    render(
      <NewGameDialog
        options={sampleOptions()}
        optionsLoading={false}
        onCreate={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('newgame-options-loading')).toBeNull();
    expect(screen.getByTestId('newgame-options')).toBeInTheDocument();
  });
});
