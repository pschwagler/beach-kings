/**
 * FilterChips — horizontally scrollable row of toggleable Chip components.
 * Selected chips appear with teal bg; unselected with gray bg.
 */

import React from 'react';
import { ScrollView, View } from 'react-native';
import Chip from './Chip';

interface FilterOption {
  readonly label: string;
  readonly value: string;
}

interface FilterChipsProps {
  readonly options: FilterOption[];
  readonly selected: string[];
  readonly onToggle: (value: string) => void;
  readonly className?: string;
}

export default function FilterChips({
  options,
  selected,
  onToggle,
  className = '',
}: FilterChipsProps): React.ReactNode {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className={className}
      contentContainerClassName="flex-row gap-2 px-4 py-1"
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          label={option.label}
          active={selected.includes(option.value)}
          onPress={() => onToggle(option.value)}
        />
      ))}
    </ScrollView>
  );
}
