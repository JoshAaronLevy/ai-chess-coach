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
  boardPayload: any,
  query: string = 'Grade the last move and pick the best next move.',
  user: string = 'web'
): Promise<any> {
  const res = await fetch(`${getApiBaseUrl()}/api/coach/grade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      user,
      inputs: { BOARD_JSON: JSON.stringify(boardPayload) },
      response_mode: 'blocking'
    })
  });
  
  const text = await res.text();
  try { 
    return JSON.parse(text); 
  } catch { 
    return text; 
  }
}