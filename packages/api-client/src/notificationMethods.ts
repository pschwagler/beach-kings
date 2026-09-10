import type { AxiosInstance } from "axios";
import { getRead, type ReadRequestOptions } from './readRequest';
import type {
  Notification,
  PushNotificationPrefs,
  PushTokenRegistration,
  RegisterPushTokenRequest,
  UnregisterPushInstallationRequest,
} from "@beach-kings/shared";
import { normalizeItems } from "./responseNormalization";

export function createNotificationMethods(api: AxiosInstance) {
  return {
    async getNotifications(params?: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
    }, options?: ReadRequestOptions): Promise<Notification[]> {
      const { unreadOnly, ...pagination } = params ?? {};
      const response = await getRead<
        { items?: Notification[] } | Notification[]
      >(api, "/api/notifications", {
        params: {
          ...pagination,
          ...(unreadOnly == null ? {} : { unread_only: unreadOnly }),
        },
      }, options);
      return normalizeItems(response.data).filter(
        (notification) => notification.dismissed_at == null,
      );
    },

    async getUnreadNotificationCount(options?: ReadRequestOptions): Promise<{ count: number }> {
      const response = await getRead<{ count: number }>(api,
        "/api/notifications/unread-count",
        undefined, options,
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

    async registerPushToken(
      registration: RegisterPushTokenRequest,
    ): Promise<PushTokenRegistration> {
      const response = await api.post<PushTokenRegistration>(
        "/api/push-tokens",
        registration,
      );
      return response.data;
    },

    async unregisterPushToken(
      registration: RegisterPushTokenRequest,
    ): Promise<{ success: boolean }> {
      const response = await api.delete<{ success: boolean }>(
        "/api/push-tokens",
        { data: registration },
      );
      return response.data;
    },

    async unregisterPushInstallation(
      credential: UnregisterPushInstallationRequest,
    ): Promise<{ success: boolean }> {
      const response = await api.post<{ success: boolean }>(
        "/api/push-installations/unregister",
        credential,
      );
      return response.data;
    },
  };
}
