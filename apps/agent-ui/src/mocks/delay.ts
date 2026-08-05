/** Artificial latency added to mock API responses so the UI's loading/skeleton states can be exercised. */
export const MOCK_API_DELAY_MS = 0;

export function delay(ms: number = MOCK_API_DELAY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
