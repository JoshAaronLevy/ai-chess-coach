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
 * Applies a UCI move to a chess.js game instance with validation.
 * 
 * This function:
 * 1. Validates the UCI format
 * 2. Parses the UCI into a move object
 * 3. Attempts to apply the move to the game
 * 4. Returns success/failure status
 * 
 * The original game instance is modified if the move is legal.
 * 
 * @param game - chess.js Chess instance
 * @param uci - UCI notation string
 * @returns True if move was successfully applied, false otherwise
 * 
 * @example
 * ```typescript
 * const game = new Chess();
 * const success = applyUciMove(game, "e2e4");
 * 
 * if (success) {
 *   console.log("Move applied successfully");
 *   console.log("New FEN:", game.fen());
 * } else {
 *   console.log("Invalid move");
 * }
 * ```
 */
export function applyUciMove(game: Chess, uci: string): boolean {
  if (!game) {
    console.warn('[UCI Parser] No chess game instance provided');
    return false;
  }

  // Parse the UCI move
  const moveObject = parseUciMove(uci);
  if (!moveObject) {
    console.warn('[UCI Parser] Invalid UCI format:', uci);
    return false;
  }

  try {
    // Attempt to apply the move using chess.js
    const result = game.move(moveObject);
    
    if (result) {
      return true;
    } else {
      console.warn('[UCI Parser] Illegal move:', { uci, moveObject });
      return false;
    }
  } catch (error) {
    // chess.js throws errors for illegal moves in some cases
    console.warn('[UCI Parser] Failed to apply move:', { 
      uci, 
      moveObject, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return false;
  }
}