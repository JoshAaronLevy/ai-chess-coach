/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chess } from 'chess.js';

/**
 * Represents a chess move with source square, destination square, and optional promotion piece
 */
export interface ChessMoveObject {
  from: string;
  to: string;
  promotion?: string;
}

/**
 * Validates if a string matches the UCI move format.
 * 
 * Valid UCI format:
 * - 4 characters: two squares (e.g., "e2e4")
 * - 5 characters: two squares + promotion piece (e.g., "e7e8q")
 * - Squares must be valid chess coordinates (a-h, 1-8)
 * - Promotion pieces must be one of: q, r, b, n (queen, rook, bishop, knight)
 * 
 * @param uci - String to validate
 * @returns True if valid UCI format, false otherwise
 * 
 * @example
 * ```typescript
 * isValidUciFormat("e2e4");    // true
 * isValidUciFormat("e7e8q");   // true
 * isValidUciFormat("a1h8");    // true
 * isValidUciFormat("invalid"); // false
 * isValidUciFormat("e2e9");    // false (invalid rank)
 * isValidUciFormat("e7e8x");   // false (invalid promotion piece)
 * ```
 */
export function isValidUciFormat(uci: string): boolean {
  // Check for null, undefined, or non-string input
  if (!uci || typeof uci !== 'string') {
    return false;
  }

  // UCI must be exactly 4 or 5 characters
  if (uci.length !== 4 && uci.length !== 5) {
    return false;
  }

  // Validate format using regex
  // Pattern: [a-h][1-8][a-h][1-8] optionally followed by [qrbn]
  const uciPattern = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
  
  return uciPattern.test(uci);
}

/**
 * Parses UCI (Universal Chess Interface) notation into a chess.js compatible move object.
 * 
 * UCI format examples:
 * - Normal move: "e2e4" (from e2 to e4)
 * - Promotion: "e7e8q" (pawn from e7 to e8, promote to queen)
 * - Castling: "e1g1" (king side castle for white)
 * 
 * @param uci - UCI notation string (4 or 5 characters)
 * @returns Move object with from, to, and optional promotion fields, or null if invalid
 * 
 * @example
 * ```typescript
 * const move = parseUciMove("e2e4");
 * // Returns: { from: "e2", to: "e4" }
 * 
 * const promotionMove = parseUciMove("e7e8q");
 * // Returns: { from: "e7", to: "e8", promotion: "q" }
 * 
 * const invalidMove = parseUciMove("invalid");
 * // Returns: null
 * ```
 */
export function parseUciMove(uci: string): ChessMoveObject | null {
  if (!isValidUciFormat(uci)) {
    return null;
  }

  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  
  // Handle promotion piece
  let promotion: string | undefined;
  if (uci.length === 5) {
    promotion = uci[4];
  } else if (uci.length === 4) {
    // Check if this is a promotion move (pawn moving to back rank)
    const fromRank = parseInt(from[1]);
    const toRank = parseInt(to[1]);
    
    // White pawn promotion: from rank 7 to rank 8
    // Black pawn promotion: from rank 2 to rank 1
    if ((fromRank === 7 && toRank === 8) || (fromRank === 2 && toRank === 1)) {
      promotion = 'q'; // Default to queen promotion
    }
  }

  const moveObject: ChessMoveObject = { from, to };
  
  if (promotion) {
    moveObject.promotion = promotion;
  }

  return moveObject;
}

/**
 * Convert UCI notation to chess.js move and apply it to the game.
 * 
 * This is the primary function for applying moves from UCI notation.
 * It validates the format, parses the move, and attempts to apply it.
 * 
 * @param game - The chess.js instance
 * @param uci - UCI move notation (e.g., "e2e4", "e7e8q")
 * @returns The move object if successful, null if invalid
 * 
 * @example
 * ```typescript
 * const game = new Chess();
 * const move = applyUciMove(game, "e2e4");
 * 
 * if (move) {
 *   console.log("Move applied:", move.san);
 * } else {
 *   console.log("Invalid move");
 * }
 * ```
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
 * Convert chess.js move object to UCI notation.
 * 
 * @param move - chess.js move object
 * @returns UCI notation string
 * 
 * @example
 * ```typescript
 * const game = new Chess();
 * const move = game.move('e4');
 * const uci = moveToUci(move);
 * // Returns: "e2e4"
 * ```
 */
export function moveToUci(move: any): string {
  if (!move || !move.from || !move.to) {
    return '';
  }
  
  return move.from + move.to + (move.promotion || '');
}

/**
 * Validate that a UCI move is legal in the current position.
 * 
 * This function tests the move without modifying the original game state.
 * 
 * @param game - The chess.js instance
 * @param uci - UCI move notation
 * @returns true if the move is legal, false otherwise
 * 
 * @example
 * ```typescript
 * const game = new Chess();
 * const isLegal = isLegalUciMove(game, "e2e4");
 * // Returns: true
 * 
 * const isIllegal = isLegalUciMove(game, "e2e5");
 * // Returns: false
 * ```
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
