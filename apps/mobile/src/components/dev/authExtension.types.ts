export interface DevelopmentAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface DevelopmentAuthExtension {
  readonly devLoginWithTokens: (
    tokens: DevelopmentAuthTokens,
  ) => Promise<void>;
}
