/**
 * Tests for the SocialSubnav component.
 *
 * Covers:
 *   - Renders all four subnav tabs.
 *   - Marks the active tab as selected for accessibility.
 *   - Calls onTabPress with the pressed tab key.
 *   - Fires light haptic feedback on press.
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';

const mockHapticLight = jest.fn();
jest.mock('@/utils/haptics', () => ({
  hapticLight: (...args: unknown[]) => mockHapticLight(...args),
}));

import SocialSubnav from '@/components/screens/Social/SocialSubnav';
import type { SocialTab } from '@/components/screens/Social/SocialSubnav';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('SocialSubnav', () => {
  it('renders all four tabs', () => {
    render(<SocialSubnav activeTab="messages" onTabPress={jest.fn()} />);

    expect(screen.getByTestId('social-subnav-tab-messages')).toBeTruthy();
    expect(screen.getByTestId('social-subnav-tab-notifications')).toBeTruthy();
    expect(screen.getByTestId('social-subnav-tab-friends')).toBeTruthy();
    expect(screen.getByTestId('social-subnav-tab-findplayers')).toBeTruthy();
  });

  it('marks the active tab as selected', () => {
    render(<SocialSubnav activeTab="friends" onTabPress={jest.fn()} />);

    const active = screen.getByTestId('social-subnav-tab-friends');
    const inactive = screen.getByTestId('social-subnav-tab-messages');
    expect(active.props.accessibilityState.selected).toBe(true);
    expect(inactive.props.accessibilityState.selected).toBe(false);
  });

  it('calls onTabPress with the pressed tab key', () => {
    const onTabPress = jest.fn();
    render(<SocialSubnav activeTab="messages" onTabPress={onTabPress} />);

    fireEvent.press(screen.getByTestId('social-subnav-tab-notifications'));

    const expected: SocialTab = 'notifications';
    expect(onTabPress).toHaveBeenCalledWith(expected);
  });

  it('fires haptic feedback on press', () => {
    render(<SocialSubnav activeTab="messages" onTabPress={jest.fn()} />);

    fireEvent.press(screen.getByTestId('social-subnav-tab-findplayers'));

    expect(mockHapticLight).toHaveBeenCalled();
  });
});
