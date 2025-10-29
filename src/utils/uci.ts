/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chess } from 'chess.js';

export interface ChessMoveObject {
  from: string;
  to: string;
  promotion?: string;
}

export function isValidUciFormat(uci: string): boolean {
  if (!uci || typeof uci !== 'string') {
    return false;
  }

  if (uci.length !== 4 && uci.length !== 5) {
    return false;
  }

  const uciPattern = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
  
  return uciPattern.test(uci);
}

export function parseUciMove(uci: string): ChessMoveObject | null {
  if (!isValidUciFormat(uci)) {
    return null;
  }

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  
  let promotion: string | undefined;
  if (uci.length === 5) {
    promotion = uci[4];
  } else if (uci.length === 4) {
    const fromRank = parseInt(from[1]);
    const toRank = parseInt(to[1]);
    
    if ((fromRank === 7 && toRank === 8) || (fromRank === 2 && toRank === 1)) {
      promotion = 'q';
    }
  }

  const moveObject: ChessMoveObject = { from, to };
  
  if (promotion) {
    moveObject.promotion = promotion;
  }

  return moveObject;
}

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

export function moveToUci(move: any): string {
  if (!move || !move.from || !move.to) {
    return '';
  }
  
  return move.from + move.to + (move.promotion || '');
}

export function isLegalUciMove(game: Chess, uci: string): boolean {
  if (!isValidUciFormat(uci)) {
    return false;
  }

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;

  const testGame = new Chess(game.fen());
  try {
    const move = testGame.move({ from, to, promotion });
    return move !== null;
  } catch {
    return false;
  }
}
