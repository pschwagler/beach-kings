/**
 * Messages and Find Players redirect into Social; Notifications is standalone.
 *
 * These routes are retained only so existing/external deep links to
 * /(stack)/messages, /(stack)/notifications, and /(stack)/find-players still
 * resolve — each forwards to the Social tab with the matching subnav selected.
 * The inbox / notifications / discover UIs themselves live in the hub's tabs.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';

// Capture the Redirect target so we can assert where each route forwards.
jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Redirect: ({ href }: { href: string }) => (
      <View testID="redirect" accessibilityLabel={href} />
    ),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('@/components/ui/TopNav', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ title, showBack }: { title: string; showBack?: boolean }) => (
      <View testID="notifications-top-nav" accessibilityLabel={`${title}:${showBack ? 'back' : 'no-back'}`} />
    ),
  };
});

jest.mock('@/components/screens/Social/NotificationsTab', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="notifications-body" />,
  };
});

import MessagesListRoute from '../../../app/(stack)/messages/index';
import NotificationsRoute from '../../../app/(stack)/notifications';
import FindPlayersRoute from '../../../app/(stack)/find-players';

describe('Social list routes — hub redirects', () => {
  it('redirects /(stack)/messages to the hub Messages tab', () => {
    render(<MessagesListRoute />);
    expect(screen.getByTestId('redirect').props.accessibilityLabel).toBe(
      '/(tabs)/social?tab=messages',
    );
  });

  it('renders /(stack)/notifications as a standalone titled inbox', () => {
    render(<NotificationsRoute />);
    expect(screen.getByTestId('notifications-top-nav').props.accessibilityLabel).toBe(
      'Notifications:back',
    );
    expect(screen.getByTestId('standalone-notifications-screen')).toBeTruthy();
    expect(screen.getByTestId('notifications-body')).toBeTruthy();
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('redirects /(stack)/find-players to the hub Find Players tab', () => {
    render(<FindPlayersRoute />);
    expect(screen.getByTestId('redirect').props.accessibilityLabel).toBe(
      '/(tabs)/social?tab=findplayers',
    );
  });
});
