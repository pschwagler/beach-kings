interface HttpErrorShape {
  readonly response?: {
    readonly data?: {
      readonly detail?: unknown;
      readonly message?: unknown;
    };
  };
  readonly message?: unknown;
}

/**
 * Safely extracts user-facing text from the API's standard error envelope.
 * Keeps transport-shape parsing out of screens and guarantees a useful
 * fallback when a proxy or native network layer returns a different shape.
 */
export function getApiErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const shaped = error as HttpErrorShape | null | undefined;
  const detail = shaped?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) {
    return detail.trim();
  }

  const responseMessage = shaped?.response?.data?.message;
  if (
    typeof responseMessage === 'string'
    && responseMessage.trim().length > 0
  ) {
    return responseMessage.trim();
  }

  const message = shaped?.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message.trim();
  }

  return fallback;
}

/**
 * Extracts deliberate API copy but does not show raw transport/library errors.
 * Auth screens use this so 429/503 guidance is visible without surfacing
 * opaque messages such as "Network Error" to users.
 */
export function getApiResponseErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const shaped = error as HttpErrorShape | null | undefined;
  const detail = shaped?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim().length > 0) {
    return detail.trim();
  }

  const responseMessage = shaped?.response?.data?.message;
  if (
    typeof responseMessage === 'string'
    && responseMessage.trim().length > 0
  ) {
    return responseMessage.trim();
  }

  return fallback;
}
