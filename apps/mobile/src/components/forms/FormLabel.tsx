import React from 'react';
import AppText from '@/components/ui/AppText';

interface FormLabelProps {
  readonly children: React.ReactNode;
  readonly required?: boolean;
  readonly className?: string;
}

export default function FormLabel({
  children,
  required = false,
  className = '',
}: FormLabelProps): React.ReactNode {
  return (
    <AppText
      className={`text-footnote font-semibold text-muted mb-xs ${className}`}
    >
      {required ? <AppText className="text-danger">* </AppText> : null}
      {children}
    </AppText>
  );
}
