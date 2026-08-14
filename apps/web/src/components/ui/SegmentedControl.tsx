'use client';

interface Segment<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: Segment<T>[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

export default function SegmentedControl<T extends string>({
  value, options, onChange, label, className = '',
}: SegmentedControlProps<T>) {
  return (
    <div className={`segmented-control ${className}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented-control__option"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}{option.label}
        </button>
      ))}
    </div>
  );
}
