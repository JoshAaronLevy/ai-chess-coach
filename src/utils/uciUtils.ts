import { Chess } from 'chess.js';

/**
 * Validate UCI move format (e.g., "e2e4", "e7e8q")
 */
export function isValidUciFormat(uci: string): boolean {
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci);
}

/**
 * Convert UCI notation to chess.js move and apply it
 * @param game - The chess.js instance
 * @param uci - UCI move notation (e.g., "e2e4", "e7e8q")
 * @returns The move object if successful, null if invalid
 */
export function applyUciMove(game: Chess, uci: string): any | null {
  if (!isValidUciFormat(uci)) {
    console.warn('[UCI] Invalid UCI format:', uci);
    return null;
  }

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;

  try {
    const move = game.move({ from, to, promotion });
    if (move) {
      console.log('[UCI] Successfully applied move:', { uci, from, to, promotion, san: move.san });
    }
    return move;
  } catch (error) {
    console.warn('[UCI] Failed to apply move:', { uci, from, to, promotion, error });
    return null;
  }
}

/**
 * Convert chess.js move object to UCI notation
 * @param move - chess.js move object
 * @returns UCI notation string
 */
export function moveToUci(move: any): string {
  if (!move || !move.from || !move.to) {
    return '';
  }
  
  return move.from + move.to + (move.promotion || '');
}

/**
 * Validate that a UCI move is legal in the current position
 * @param game - The chess.js instance
 * @param uci - UCI move notation
 * @returns true if the move is legal, false otherwise
 */
export function isLegalUciMove(game: Chess, uci: string): boolean {
  if (!isValidUciFormat(uci)) {
    return false;
  }

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;

  // Create a clone to test the move without affecting the original game
  const testGame = new Chess(game.fen());
  try {
    const move = testGame.move({ from, to, promotion });
    return move !== null;
  } catch {
    return false;
  }
}