import type { AxiosInstance } from "axios";
import type { Notification, PushNotificationPrefs } from "@beach-kings/shared";
import { normalizeItems } from "./responseNormalization";

export function createNotificationMethods(api: AxiosInstance) {
  return {
    async getNotifications(params?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
    }): Promise<Notification[]> {
      const { unreadOnly, ...pagination } = params ?? {};
      const response = await api.get<
        { items?: Notification[] } | Notification[]
      >("/api/notifications", {
        params: {
          ...pagination,
          ...(unreadOnly == null ? {} : { unread_only: unreadOnly }),
        },
      });
      return normalizeItems(response.data).filter(
        (notification) => notification.dismissed_at == null,
      );
    },

    async getUnreadNotificationCount(): Promise<{ count: number }> {
      const response = await api.get<{ count: number }>(
        "/api/notifications/unread-count",
      );
      return response.data;
    },

    async markNotificationRead(notificationId: number): Promise<Notification> {
      const response = await api.put<Notification>(
        `/api/notifications/${notificationId}/read`,
      );
      return response.data;
    },

    async markAllNotificationsRead(): Promise<{
      success: boolean;
      count: number;
    }> {
      const response = await api.put<{ success: boolean; count: number }>(
        "/api/notifications/mark-all-read",
      );
      return response.data;
    },

    async getPushNotificationPrefs(): Promise<PushNotificationPrefs> {
      const response = await api.get<PushNotificationPrefs>(
        "/api/users/me/push-prefs",
      );
      return response.data;
    },

    async updatePushNotificationPrefs(
      partial: Partial<PushNotificationPrefs>,
    ): Promise<PushNotificationPrefs> {
      const response = await api.patch<PushNotificationPrefs>(
        "/api/users/me/push-prefs",
        partial,
      );
      return response.data;
    },
  };
}
