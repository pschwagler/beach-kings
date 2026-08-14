export type ModerationVisibility = 'pending' | 'visible' | 'quarantined' | 'removed';

export type InteractionAction =
  | 'direct_message'
  | 'friend_request'
  | 'league_invite'
  | 'session_invite'
  | 'mention'
  | 'reply'
  | 'presence'
  | 'read_receipt'
  | 'notification'
  | 'discovery'
  | 'user_generated_content'
  | 'shared_operational_content';

export interface InteractionCapability {
  readonly actions: Readonly<Record<InteractionAction, boolean>>;
  readonly blocked_by_viewer: boolean;
  readonly viewer_restricted: boolean;
}

export interface InteractionCapabilityBatchResponse {
  readonly capabilities: Readonly<Record<string, InteractionCapability>>;
}

export type ReportTargetType =
  | 'player'
  | 'direct_message'
  | 'league_message'
  | 'court_review'
  | 'court_photo'
  | 'court_review_photo';

export type ReportReason =
  | 'harassment'
  | 'hate_discrimination'
  | 'threats_violence'
  | 'stalking_doxxing'
  | 'sexual_content'
  | 'sexual_exploitation'
  | 'minor_safety'
  | 'self_harm'
  | 'privacy_impersonation'
  | 'spam_scam'
  | 'other';

export interface ReportInput {
  readonly target_type: ReportTargetType;
  readonly target_id: number;
  readonly reason: ReportReason;
  readonly details?: string;
}

export interface ReportReceipt extends ReportInput {
  readonly id: number;
  readonly status: string;
  readonly created_at: string;
}

export interface BlockedPlayer {
  readonly player_id: number;
  readonly full_name: string;
  readonly avatar: string | null;
  readonly blocked_at: string;
}

export type AccountModerationState = 'active' | 'suspended' | 'banned';
export type ModerationAppealState = 'open' | 'granted' | 'upheld';

export interface ModerationAppeal {
  readonly id: number;
  readonly case_id: number;
  readonly status: ModerationAppealState;
  readonly statement: string;
  readonly resolution_reason: string | null;
  readonly created_at: string;
  readonly resolved_at: string | null;
}

export interface AccountModerationStatus {
  readonly account_status: AccountModerationState;
  readonly account_expires_at: string | null;
  readonly account_case_id: number | null;
  readonly interaction_restricted_until: string | null;
  readonly interaction_restriction_case_id: number | null;
  readonly appeals: readonly ModerationAppeal[];
}

export interface ModerationAppealInput {
  readonly case_id: number;
  readonly statement: string;
}
