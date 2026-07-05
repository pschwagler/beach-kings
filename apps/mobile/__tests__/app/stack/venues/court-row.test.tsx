/**
 * Tests for CourtRow — verifies the cover photo uses the list endpoint's
 * `photo_url`, falls back through nested arrays, and renders a neutral
 * placeholder (never a stock/random image) when no photo exists.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>, Path: () => null };
});

jest.mock('@/utils/haptics', () => ({ hapticLight: jest.fn().mockResolvedValue(undefined) }));

import CourtRow from '@/components/screens/Venues/CourtRow';

const base = { id: 7, name: 'Test Court', city: 'San Diego', state: 'CA' } as never;

describe('CourtRow cover photo', () => {
  it('uses photo_url from the list endpoint', () => {
    render(<CourtRow court={{ ...(base as object), photo_url: 'https://s3/real.jpg' } as never} />);
    expect(screen.getByTestId('court-thumb-7').props.source).toEqual({ uri: 'https://s3/real.jpg' });
  });

  it('falls back to the first court_photos url when photo_url is absent', () => {
    render(
      <CourtRow
        court={{ ...(base as object), court_photos: [{ id: 1, url: 'https://s3/cp.jpg' }] } as never}
      />,
    );
    expect(screen.getByTestId('court-thumb-7').props.source).toEqual({ uri: 'https://s3/cp.jpg' });
  });

  it('renders a neutral placeholder (no stock image) when the court has no photo', () => {
    render(<CourtRow court={base} />);
    expect(screen.queryByTestId('court-thumb-7')).toBeNull();
    expect(screen.getByTestId('court-thumb-placeholder-7')).toBeTruthy();
  });
});

describe('CourtRow rating', () => {
  it('shows "No reviews yet" instead of 0.0 when there are no reviews', () => {
    render(
      <CourtRow
        court={{ ...(base as object), average_rating: 0, review_count: 0 } as never}
      />,
    );
    expect(screen.getByText('No reviews yet')).toBeTruthy();
    expect(screen.queryByText('0.0 (0)')).toBeNull();
  });

  it('shows the average and review count when reviews exist', () => {
    render(
      <CourtRow
        court={{ ...(base as object), average_rating: 4.6, review_count: 42 } as never}
      />,
    );
    expect(screen.getByText('4.6 (42)')).toBeTruthy();
    expect(screen.queryByText('No reviews yet')).toBeNull();
  });
});
