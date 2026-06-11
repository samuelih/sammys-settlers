import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { GameOptionDescriptor } from '../../protocol/gameOptions';
import { OptionField } from './OptionField';

describe('OptionField', () => {
  it('renders a bool option as a labeled checkbox and fires onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const opt: GameOptionDescriptor = {
      key: 'BC',
      optType: 'bool',
      desc: 'Break up clumps',
      defaultBoolValue: false,
    };
    render(<OptionField option={opt} onChange={onChange} />);

    const box = within(screen.getByTestId('opt-BC')).getByRole('checkbox');
    expect(box).not.toBeChecked();
    expect(screen.getByLabelText('Break up clumps')).toBe(box);

    await user.click(box);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'BC', curBoolValue: true }),
    );
  });

  it('renders an int option as a number input and clamps to min/max', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const opt: GameOptionDescriptor = {
      key: 'PL',
      optType: 'int',
      desc: 'Maximum # players',
      defaultIntValue: 4,
      minIntValue: 2,
      maxIntValue: 6,
    };
    render(<OptionField option={opt} onChange={onChange} />);

    const input = within(screen.getByTestId('opt-PL')).getByRole('spinbutton');
    expect(input).toHaveValue(4);

    // Typing 9 (above max 6) should clamp to 6.
    await user.clear(input);
    await user.type(input, '9');
    const last = onChange.mock.calls.at(-1)?.[0] as GameOptionDescriptor;
    expect(last.curIntValue).toBe(6);
  });

  it('renders an intbool option, disabling the number when unchecked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const opt: GameOptionDescriptor = {
      key: 'N7',
      optType: 'intbool',
      desc: 'Roll no 7s during first # turns',
      defaultBoolValue: false,
      defaultIntValue: 7,
      minIntValue: 1,
      maxIntValue: 999,
    };
    render(<OptionField option={opt} onChange={onChange} />);

    const scope = within(screen.getByTestId('opt-N7'));
    const checkbox = scope.getByRole('checkbox');
    const number = scope.getByRole('spinbutton');
    expect(checkbox).not.toBeChecked();
    expect(number).toBeDisabled();

    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'N7', curBoolValue: true }),
    );
  });

  it('renders an enum option as a select of enumVals (1-indexed) and fires onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const opt: GameOptionDescriptor = {
      key: 'BC',
      optType: 'enum',
      desc: 'Board size',
      defaultIntValue: 1,
      enumVals: ['Small', 'Medium', 'Large'],
    };
    render(<OptionField option={opt} onChange={onChange} />);

    const select = within(screen.getByTestId('opt-BC')).getByRole('combobox');
    expect(within(select).getAllByRole('option')).toHaveLength(3);
    expect(select).toHaveValue('1');

    await user.selectOptions(select, 'Large');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'BC', curIntValue: 3 }),
    );
  });

  it('renders an enumbool option with checkbox + select, select disabled when unchecked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const opt: GameOptionDescriptor = {
      key: 'SBL',
      optType: 'enumbool',
      desc: 'Special build phase length',
      defaultBoolValue: false,
      defaultIntValue: 1,
      enumVals: ['Short', 'Long'],
    };
    render(<OptionField option={opt} onChange={onChange} />);

    const scope = within(screen.getByTestId('opt-SBL'));
    const checkbox = scope.getByRole('checkbox');
    const select = scope.getByRole('combobox');
    expect(select).toBeDisabled();

    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'SBL', curBoolValue: true }),
    );
  });

  it('renders a str option as a text input and fires onChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const opt: GameOptionDescriptor = {
      key: '_EXT_GAM',
      optType: 'str',
      desc: 'Game note',
      curStrValue: '',
    };
    render(<OptionField option={opt} onChange={onChange} />);

    const input = within(screen.getByTestId('opt-_EXT_GAM')).getByRole('textbox');
    expect(input).toHaveAttribute('type', 'text');

    await user.type(input, 'hi');
    const last = onChange.mock.calls.at(-1)?.[0] as GameOptionDescriptor;
    expect(last.curStrValue).toBe('i'); // controlled input: each keystroke is independent here
  });

  it('renders a strhide option as a masked (password) input', () => {
    const onChange = vi.fn();
    const opt: GameOptionDescriptor = {
      key: 'PW',
      optType: 'strhide',
      desc: 'Game password',
      curStrValue: 'secret',
    };
    render(<OptionField option={opt} onChange={onChange} />);

    // Password inputs have no textbox role; query the rendered input directly.
    const field = screen.getByTestId('opt-PW');
    const input = field.querySelector('input');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue('secret');
  });

  it('renders an unknown option as a non-interactive notice', () => {
    const onChange = vi.fn();
    const opt: GameOptionDescriptor = {
      key: '_XYZ',
      optType: 'unknown',
      desc: 'Future option',
    };
    render(<OptionField option={opt} onChange={onChange} />);

    const field = screen.getByTestId('opt-_XYZ');
    expect(field).toHaveTextContent(/unsupported/i);
    expect(field.querySelector('input')).toBeNull();
    expect(field.querySelector('select')).toBeNull();
  });

  it('strips the # marker from the rendered label', () => {
    const onChange = vi.fn();
    const opt: GameOptionDescriptor = {
      key: 'VP',
      optType: 'int',
      desc: 'Victory points to win: #',
      defaultIntValue: 10,
      minIntValue: 10,
      maxIntValue: 20,
    };
    render(<OptionField option={opt} onChange={onChange} />);
    expect(screen.getByText('Victory points to win:')).toBeInTheDocument();
  });
});
