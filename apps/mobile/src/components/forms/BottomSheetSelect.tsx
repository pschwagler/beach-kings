import React, { useCallback, useState } from 'react';
import { BottomSheet } from '@/components/ui';
import SelectField from './SelectField';
import SheetOptionList, { type SelectOption } from './SheetOptionList';

interface BottomSheetSelectProps {
  readonly title: string;
  readonly placeholder: string;
  readonly options: readonly SelectOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly displayValue?: string;
  readonly error?: boolean;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly emptyMessage?: string;
  readonly testID?: string;
  readonly searchable?: boolean;
  readonly searchPlaceholder?: string;
}

/**
 * Self-contained select-with-bottom-sheet control.
 * Encapsulates the sheet open/close state so callers just hand in options + value.
 */
export default function BottomSheetSelect({
  title,
  placeholder,
  options,
  value,
  onChange,
  displayValue,
  error = false,
  disabled = false,
  loading = false,
  emptyMessage,
  testID,
  searchable = false,
  searchPlaceholder,
}: BottomSheetSelectProps): React.ReactNode {
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((o) => o.value === value);
  const resolvedDisplay =
    displayValue ??
    (selectedOption
      ? selectedOption.sublabel
        ? `${selectedOption.label} (${selectedOption.sublabel})`
        : selectedOption.label
      : '');

  const handleSelect = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <>
      <SelectField
        placeholder={placeholder}
        value={resolvedDisplay}
        error={error}
        disabled={disabled}
        onPress={() => setOpen(true)}
        testID={testID}
      />
      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <SheetOptionList
          title={title}
          options={options}
          selectedValue={value}
          onSelect={handleSelect}
          emptyMessage={emptyMessage}
          loading={loading}
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
        />
      </BottomSheet>
    </>
  );
}
