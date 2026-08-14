/**
 * Tests for form primitives in @/components/forms/.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// Icon stubs — used indirectly by SelectField and SheetOptionList
jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const stub =
    (name: string) =>
    ({ size, color }: { size?: number; color?: string }) => (
      <View testID={`icon-${name}`} accessibilityLabel={name} />
    );
  return {
    ChevronDownIcon: stub('ChevronDown'),
    CheckIcon: stub('Check'),
    SearchIcon: stub('Search'),
  };
});

// SheetOptionList reads isDark for its search input styling.
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

// BottomSheet stub — renders children only when `visible` is true
jest.mock('@/components/ui', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BottomSheet: ({
      children,
      visible,
    }: {
      children?: React.ReactNode;
      visible?: boolean;
    }) =>
      visible ? <View testID="bottom-sheet">{children}</View> : null,
  };
});

import FormError from '@/components/forms/FormError';
import FormLabel from '@/components/forms/FormLabel';
import SelectField from '@/components/forms/SelectField';
import SheetOptionList from '@/components/forms/SheetOptionList';
import BottomSheetSelect from '@/components/forms/BottomSheetSelect';

// ---------------------------------------------------------------------------
// FormError
// ---------------------------------------------------------------------------
describe('FormError', () => {
  it('renders nothing when message is undefined', () => {
    const { toJSON } = render(<FormError />);
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when message is empty string', () => {
    const { toJSON } = render(<FormError message="" />);
    expect(toJSON()).toBeNull();
  });

  it('renders the message with the alert role when provided', () => {
    const { getByText, getByRole } = render(<FormError message="Required" />);
    expect(getByText('Required')).toBeTruthy();
    expect(getByRole('alert')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// FormLabel
// ---------------------------------------------------------------------------
describe('FormLabel', () => {
  it('renders children text', () => {
    const { getByText } = render(<FormLabel>Email</FormLabel>);
    expect(getByText('Email')).toBeTruthy();
  });

  it('does not render the required asterisk by default', () => {
    const { queryByText } = render(<FormLabel>Email</FormLabel>);
    expect(queryByText('* ')).toBeNull();
  });

  it('renders the required asterisk when `required` is true', () => {
    const { getByText } = render(<FormLabel required>Email</FormLabel>);
    expect(getByText('* ')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SelectField
// ---------------------------------------------------------------------------
describe('SelectField', () => {
  it('shows the placeholder when value is empty', () => {
    const { getByText } = render(
      <SelectField placeholder="Select gender" value="" onPress={() => {}} />,
    );
    expect(getByText('Select gender')).toBeTruthy();
  });

  it('shows the value when provided', () => {
    const { getByText, queryByText } = render(
      <SelectField placeholder="Select gender" value="Male" onPress={() => {}} />,
    );
    expect(getByText('Male')).toBeTruthy();
    expect(queryByText('Select gender')).toBeNull();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <SelectField placeholder="x" value="" onPress={onPress} />,
    );
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalled();
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByRole } = render(
      <SelectField placeholder="x" value="" onPress={onPress} disabled />,
    );
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('uses the value as accessibilityLabel when present', () => {
    const { getByLabelText } = render(
      <SelectField placeholder="x" value="Beginner" onPress={() => {}} />,
    );
    expect(getByLabelText('Beginner')).toBeTruthy();
  });

  it('falls back to placeholder for accessibilityLabel when empty', () => {
    const { getByLabelText } = render(
      <SelectField placeholder="Skill level" value="" onPress={() => {}} />,
    );
    expect(getByLabelText('Skill level')).toBeTruthy();
  });

  it('forwards testID', () => {
    const { getByTestId } = render(
      <SelectField
        placeholder="x"
        value=""
        onPress={() => {}}
        testID="my-field"
      />,
    );
    expect(getByTestId('my-field')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SheetOptionList
// ---------------------------------------------------------------------------
describe('SheetOptionList', () => {
  const options = [
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B', sublabel: 'Second choice' },
  ];

  it('renders title and all options', () => {
    const { getByText } = render(
      <SheetOptionList
        title="Pick one"
        options={options}
        selectedValue=""
        onSelect={() => {}}
      />,
    );
    expect(getByText('Pick one')).toBeTruthy();
    expect(getByText('Option A')).toBeTruthy();
    expect(getByText('Option B')).toBeTruthy();
  });

  it('renders sublabel when provided', () => {
    const { getByText } = render(
      <SheetOptionList
        title="x"
        options={options}
        selectedValue=""
        onSelect={() => {}}
      />,
    );
    expect(getByText('Second choice')).toBeTruthy();
  });

  it('shows a check icon next to the selected option', () => {
    const { getByTestId } = render(
      <SheetOptionList
        title="x"
        options={options}
        selectedValue="a"
        onSelect={() => {}}
      />,
    );
    expect(getByTestId('icon-Check')).toBeTruthy();
  });

  it('calls onSelect with the option value when pressed', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(
      <SheetOptionList
        title="x"
        options={options}
        selectedValue=""
        onSelect={onSelect}
      />,
    );
    fireEvent.press(getByLabelText('Option B'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('renders the empty message when no options', () => {
    const { getByText } = render(
      <SheetOptionList
        title="x"
        options={[]}
        selectedValue=""
        onSelect={() => {}}
        emptyMessage="No options available"
      />,
    );
    expect(getByText('No options available')).toBeTruthy();
  });

  it('renders default empty message when none provided', () => {
    const { getByText } = render(
      <SheetOptionList
        title="x"
        options={[]}
        selectedValue=""
        onSelect={() => {}}
      />,
    );
    expect(getByText('No options')).toBeTruthy();
  });

  it('renders a spinner when loading and no options', () => {
    const { UNSAFE_queryAllByType, queryByText } = render(
      <SheetOptionList
        title="x"
        options={[]}
        selectedValue=""
        onSelect={() => {}}
        loading
      />,
    );
    // When loading + empty, the default empty text is NOT shown.
    expect(queryByText('No options')).toBeNull();
    // ActivityIndicator renders — presence of node tree != null.
    const ActivityIndicator = require('react-native').ActivityIndicator;
    expect(UNSAFE_queryAllByType(ActivityIndicator).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// BottomSheetSelect
// ---------------------------------------------------------------------------
describe('BottomSheetSelect', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta', sublabel: 'b' },
  ];

  it('starts closed — sheet is not visible', () => {
    const { queryByTestId } = render(
      <BottomSheetSelect
        title="Pick"
        placeholder="Select"
        options={options}
        value=""
        onChange={() => {}}
      />,
    );
    expect(queryByTestId('bottom-sheet')).toBeNull();
  });

  it('opens the sheet when the field is pressed', () => {
    const { getByRole, getByTestId } = render(
      <BottomSheetSelect
        title="Pick"
        placeholder="Select"
        options={options}
        value=""
        onChange={() => {}}
      />,
    );
    fireEvent.press(getByRole('button'));
    expect(getByTestId('bottom-sheet')).toBeTruthy();
  });

  it('calls onChange with the selected value and closes the sheet', () => {
    const onChange = jest.fn();
    const { getByRole, getByLabelText, queryByTestId } = render(
      <BottomSheetSelect
        title="Pick"
        placeholder="Select"
        options={options}
        value=""
        onChange={onChange}
      />,
    );
    fireEvent.press(getByRole('button'));
    fireEvent.press(getByLabelText('Alpha'));
    expect(onChange).toHaveBeenCalledWith('a');
    expect(queryByTestId('bottom-sheet')).toBeNull();
  });

  it('shows the matched option label as the field value', () => {
    const { getByText } = render(
      <BottomSheetSelect
        title="Pick"
        placeholder="Select"
        options={options}
        value="a"
        onChange={() => {}}
      />,
    );
    expect(getByText('Alpha')).toBeTruthy();
  });

  it('shows "label (sublabel)" when the selected option has a sublabel', () => {
    const { getByText } = render(
      <BottomSheetSelect
        title="Pick"
        placeholder="Select"
        options={options}
        value="b"
        onChange={() => {}}
      />,
    );
    expect(getByText('Beta (b)')).toBeTruthy();
  });

  it('uses the explicit displayValue over the resolved one', () => {
    const { getByText } = render(
      <BottomSheetSelect
        title="Pick"
        placeholder="Select"
        options={options}
        value="a"
        displayValue="Custom Display"
        onChange={() => {}}
      />,
    );
    expect(getByText('Custom Display')).toBeTruthy();
  });
});
