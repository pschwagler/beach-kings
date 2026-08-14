/**
 * Smoke tests: verifies every exported Icon component renders without crashing.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import * as Icons from '@/components/ui/icons';

const iconNames = Object.keys(Icons).filter((k) => k.endsWith('Icon'));

describe('Icons', () => {
  iconNames.forEach((name) => {
    it(`renders ${name}`, () => {
      const Icon = (Icons as Record<string, React.ComponentType>)[name];
      const { toJSON } = render(<Icon />);
      expect(toJSON()).toBeTruthy();
    });
  });
});
