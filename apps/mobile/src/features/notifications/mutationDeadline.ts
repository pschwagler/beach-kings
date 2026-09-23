/** Visible notification actions stop blocking the UI after this deadline. */
export const NOTIFICATION_MUTATION_TIMEOUT_MS = 10_000;

export class NotificationMutationTimeoutError extends Error {
  constructor() {
    super('The notification change was not confirmed in time.');
    this.name = 'NotificationMutationTimeoutError';
  }
}

export function withNotificationMutationDeadline<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new NotificationMutationTimeoutError());
    }, NOTIFICATION_MUTATION_TIMEOUT_MS);

    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
