import { 
  createTimeoutError, 
  createAPIErrorFromResponse, 
  createNetworkError 
} from '../utils/errorHandler';

/**
 * Default API timeout in milliseconds (30 seconds)
 */
const API_TIMEOUT_MS = 30000;

function getApiBaseUrl(): string {
  // 1) Check Vite environment variable
  const envFromVite = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') || '';
  
  if (envFromVite) return envFromVite;

  // 2) localhost fallback in dev
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3000';
    }
  }

  // 3) production default
  return 'https://ai-chess-coach-server.onrender.com';
}

export async function postCoachGrade(
  boardPayload: unknown,
  query: string = 'Grade the last move and pick the best next move.',
  user: string = 'web'
): Promise<unknown> {
  const endpoint = `${getApiBaseUrl()}/api/coach/grade`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        user,
        inputs: { BOARD_JSON: JSON.stringify(boardPayload) },
        response_mode: 'blocking'
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Check HTTP status
    if (!res.ok) {
      throw createAPIErrorFromResponse(res, endpoint);
    }

    const text = await res.text();
    
    // Try to parse as JSON, fallback to returning text
    try {
      return JSON.parse(text);
    } catch {
      // If not JSON, return the text as-is
      return text;
    }
  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      throw createTimeoutError(endpoint, API_TIMEOUT_MS);
    }

    // Handle network errors
    if (error instanceof TypeError) {
      throw createNetworkError(endpoint, error);
    }

    // Re-throw if already an APIError
    throw error;
  }
}