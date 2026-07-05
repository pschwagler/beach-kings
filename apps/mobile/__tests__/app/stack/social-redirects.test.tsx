/**
 * The standalone Social list routes now redirect into the Social hub tab.
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

  it('redirects /(stack)/notifications to the hub Notifications tab', () => {
    render(<NotificationsRoute />);
    expect(screen.getByTestId('redirect').props.accessibilityLabel).toBe(
      '/(tabs)/social?tab=notifications',
    );
  });

  it('redirects /(stack)/find-players to the hub Find Players tab', () => {
    render(<FindPlayersRoute />);
    expect(screen.getByTestId('redirect').props.accessibilityLabel).toBe(
      '/(tabs)/social?tab=findplayers',
    );
  });
});
