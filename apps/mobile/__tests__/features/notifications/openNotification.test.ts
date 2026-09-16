import { Alert } from 'react-native';
import { openNotification } from '@/features/notifications/openNotification';

const notification = { id: 42, type: 'league_message', title: 'Update', message: 'Details to review', link_url: '/league/7?tab=messages' };

describe('notification tap policy', () => {
  const navigate = jest.fn();
  const read = jest.fn();
  const alert = jest.spyOn(Alert, 'alert');
  beforeEach(() => { jest.clearAllMocks(); alert.mockImplementation(() => {}); });

  it('navigates supported links before marking read', () => {
    openNotification(notification, navigate, read);
    expect(navigate).toHaveBeenCalledWith('/(stack)/league/7?tab=chat');
    expect(read).toHaveBeenCalledWith(42);
    expect(alert).not.toHaveBeenCalled();
    expect(navigate.mock.invocationCallOrder[0]).toBeLessThan(read.mock.invocationCallOrder[0]);
  });

  it.each([null, '/unknown', '/home', '/notifications', 'https://example.com/private'])('preserves details for unhelpful destination %s until acknowledged', (link_url) => {
    openNotification({ ...notification, link_url }, navigate, read);
    expect(alert).toHaveBeenCalledWith('Update', 'Details to review', expect.any(Array));
    expect(read).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    alert.mock.calls[0][2]?.[0].onPress?.();
    expect(read).toHaveBeenCalledWith(42);
  });

  it('shows the warning before offering account status', () => {
    openNotification({ ...notification, type: 'moderation_update', link_url: '/account-status' }, navigate, read);
    expect(alert).toHaveBeenCalledWith('Update', 'Details to review', expect.any(Array));
    expect(navigate).not.toHaveBeenCalled();
    alert.mock.calls[0][2]?.[1].onPress?.();
    expect(navigate).toHaveBeenCalledWith('/(stack)/settings/account-status');
    expect(read).toHaveBeenCalledWith(42);
  });

  it('opens actionable friend requests instead of marking an unread inbox row away', () => {
    openNotification({ ...notification, type: 'friend_request', link_url: '/notifications' }, navigate, read);
    expect(navigate).toHaveBeenCalledWith('/(tabs)/social?tab=friends');
    expect(read).toHaveBeenCalledWith(42);
  });
});
