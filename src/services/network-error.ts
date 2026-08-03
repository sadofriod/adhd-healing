const NETWORK_ERROR_PATTERN = /fetch failed|failed to fetch|network|socket|connection|econn|etimedout|timeout|terminated|429|5\d\d/iu;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function isRecoverableNetworkError(error: unknown): boolean {
  return NETWORK_ERROR_PATTERN.test(getErrorMessage(error));
}