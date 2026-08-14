/**
 * Tests for Avatar — profile photo with initials fallback.
 *
 * Covers:
 *   - getInitials helper (first + last letter-token, single name, digit-token
 *     filtering, alphanumeric fallback, empty).
 *   - Image rendering when a photo URL is present.
 *   - Initials fallback + the flat default (teal) variant color.
 *   - colorSeed variety: deterministic per-seed bg/fg, stable for equal seeds,
 *     and able to differ across seeds.
 */

import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import Avatar, { getInitials, isImageUri } from '@/components/ui/Avatar';

describe('getInitials', () => {
  it('returns first + last initials', () => {
    expect(getInitials('Morgan Davis')).toBe('MD');
  });

  it('returns a single initial for a one-word name', () => {
    expect(getInitials('Cher')).toBe('C');
  });

  it('skips tokens that do not start with a letter', () => {
    expect(getInitials('Social E2E Bob 84404982')).toBe('SB');
    expect(getInitials('Bob 42')).toBe('B');
  });

  it('falls back to the first alphanumeric character when no letter token exists', () => {
    expect(getInitials('42 99')).toBe('4');
  });

  it('returns an empty string for a blank name', () => {
    expect(getInitials('   ')).toBe('');
  });
});

describe('Avatar', () => {
  it('renders an image when imageUrl is provided', () => {
    const { getByLabelText } = render(
      <Avatar name="Morgan Davis" imageUrl="https://example.com/a.jpg" />,
    );
    expect(getByLabelText('Morgan Davis').props.source).toEqual({
      uri: 'https://example.com/a.jpg',
    });
  });

  it('renders the initials fallback when no image is provided', () => {
    const { getByText } = render(<Avatar name="Morgan Davis" />);
    expect(getByText('MD')).toBeTruthy();
  });

  it('treats legacy initials as fallback text instead of an image URI', () => {
    expect(isImageUri('AT')).toBe(false);
    expect(isImageUri('AT.png')).toBe(false);
    const { getByText } = render(
      <Avatar name="Alice Test" imageUrl="AT.png" />,
    );
    expect(getByText('AT')).toBeTruthy();
  });

  it('applies the flat teal variant color by default', () => {
    const { getByLabelText } = render(<Avatar name="Morgan Davis" />);
    expect(StyleSheet.flatten(getByLabelText('Morgan Davis').props.style)).toEqual(
      expect.objectContaining({ backgroundColor: '#4daacc' }),
    );
  });

  it('derives a deterministic variety color from colorSeed', () => {
    // seed 30 % 6 === 0 → first variety entry ({ bg: #bae6fd, fg: #0c4a6e }).
    const { getByLabelText, getByText } = render(
      <Avatar name="Morgan Davis" colorSeed={30} />,
    );
    expect(StyleSheet.flatten(getByLabelText('Morgan Davis').props.style)).toEqual(
      expect.objectContaining({ backgroundColor: '#bae6fd' }),
    );
    expect(StyleSheet.flatten(getByText('MD').props.style)).toEqual(
      expect.objectContaining({ color: '#0c4a6e' }),
    );
  });

  it('gives the same color for the same seed and can differ across seeds', () => {
    const same1 = render(<Avatar name="A B" colorSeed={7} />);
    const same2 = render(<Avatar name="C D" colorSeed={7} />);
    const bg1 = StyleSheet.flatten(
      same1.getByLabelText('A B').props.style,
    ).backgroundColor;
    const bg2 = StyleSheet.flatten(
      same2.getByLabelText('C D').props.style,
    ).backgroundColor;
    expect(bg1).toBe(bg2);

    const other = render(<Avatar name="E F" colorSeed={8} />);
    const bg3 = StyleSheet.flatten(
      other.getByLabelText('E F').props.style,
    ).backgroundColor;
    expect(bg3).not.toBe(bg1);
  });

  it('accepts a string colorSeed', () => {
    const { getByLabelText } = render(
      <Avatar name="Morgan Davis" colorSeed="morgan" />,
    );
    expect(
      StyleSheet.flatten(getByLabelText('Morgan Davis').props.style)
        .backgroundColor,
    ).toBeDefined();
  });

  it('supports exact numeric sizes for migrated player circles', () => {
    const { getByLabelText } = render(
      <Avatar name="Morgan Davis" size={36} />,
    );
    expect(StyleSheet.flatten(getByLabelText('Morgan Davis').props.style)).toEqual(
      expect.objectContaining({ width: 36, height: 36, borderRadius: 18 }),
    );
  });

  it('falls back after an image error and retries when the URL changes', async () => {
    const screen = render(
      <Avatar name="Morgan Davis" imageUrl="https://example.com/old.jpg" />,
    );

    fireEvent(screen.getByLabelText('Morgan Davis'), 'error');
    expect(screen.getByText('MD')).toBeTruthy();

    screen.rerender(
      <Avatar name="Morgan Davis" imageUrl="https://example.com/new.jpg" />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Morgan Davis').props.source).toEqual({
        uri: 'https://example.com/new.jpg',
      });
    });
  });
});
