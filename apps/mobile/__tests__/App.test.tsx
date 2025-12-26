import React from 'react';
import { render } from '@testing-library/react-native';
import Index from '../app/index';

describe('App', () => {
  it('renders correctly', () => {
    const { getByText } = render(<Index />);
    expect(getByText('Beach League')).toBeTruthy();
  });
});





