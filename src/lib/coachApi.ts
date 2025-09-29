const BASE_URL = 'http://localhost:3000';

export async function postCoachGrade(
  boardPayload: any,
  query: string = 'Grade the last move and pick the best next move.',
  user: string = 'web'
): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/coach/grade`, {
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