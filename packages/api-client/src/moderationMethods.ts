import type { AxiosInstance } from 'axios';
import type {
  BlockedPlayer,
  AccountModerationStatus,
  InteractionCapabilityBatchResponse,
  ModerationAppeal,
  ModerationAppealInput,
  ReportInput,
  ReportReceipt,
} from '@beach-kings/shared';

export function createModerationMethods(api: AxiosInstance) {
  return {
    async getBlockedPlayers(): Promise<BlockedPlayer[]> {
      return (await api.get<BlockedPlayer[]>('/api/users/me/blocks')).data;
    },
    async blockPlayer(playerId: number): Promise<{ player_id: number; status: string }> {
      return (await api.post('/api/users/me/blocks', { player_id: playerId })).data;
    },
    async unblockPlayer(playerId: number): Promise<{ player_id: number; status: string }> {
      return (await api.delete(`/api/users/me/blocks/${encodeURIComponent(playerId)}`)).data;
    },
    async getInteractionCapabilities(
      playerIds: readonly number[],
    ): Promise<InteractionCapabilityBatchResponse> {
      return (await api.post<InteractionCapabilityBatchResponse>(
        '/api/users/interaction-capabilities',
        { player_ids: playerIds },
      )).data;
    },
    async reportContent(input: ReportInput): Promise<ReportReceipt> {
      return (await api.post<ReportReceipt>('/api/moderation/reports', input)).data;
    },
    async getMyReports(): Promise<ReportReceipt[]> {
      return (await api.get<ReportReceipt[]>('/api/moderation/reports/me')).data;
    },
    async getAccountModerationStatus(): Promise<AccountModerationStatus> {
      return (await api.get<AccountModerationStatus>('/api/moderation/account-status')).data;
    },
    async getMyModerationAppeals(): Promise<ModerationAppeal[]> {
      return (await api.get<ModerationAppeal[]>('/api/moderation/appeals/me')).data;
    },
    async createModerationAppeal(input: ModerationAppealInput): Promise<ModerationAppeal> {
      return (await api.post<ModerationAppeal>('/api/moderation/appeals', input)).data;
    },
  };
}
