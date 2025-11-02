/**
 * Move Description Utilities
 * 
 * Transforms chess move notation into human-readable descriptions.
 * Supports all standard chess moves including captures, castling,
 * en passant, and promotions.
 */

import type { PieceType } from '../types/gameLog';

/**
 * Mapping of piece type codes to human-readable names
 */
export const PIECE_NAMES: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

/**
 * Mapping of piece type codes to Unicode chess symbols
 * Using white piece symbols for visual consistency
 */
export const PIECE_SYMBOLS: Record<PieceType, string> = {
  k: '♔',
  q: '♕',
  r: '♖',
  b: '♗',
  n: '♘',
  p: '♙',
};

/**
 * Options for describing a chess move
 */
export interface MoveDescriptionOptions {
  /** The piece being moved */
  piece: PieceType;
  /** Starting square (e.g., "e2") */
  from: string;
  /** Destination square (e.g., "e4") */
  to: string;
  /** Piece captured, if any */
  captured?: PieceType;
  /** Piece promoted to, if any */
  promotion?: PieceType;
  /** Move flags from chess.js (e.g., "c" for capture, "k" for kingside castle) */
  flags?: string;
  /** Standard Algebraic Notation of the move */
  san?: string;
}

/**
 * Converts a chess move into a human-readable description.
 * 
 * @param options - Move details including piece, squares, captures, etc.
 * @returns A plain English description of the move
 * 
 * @example
 * describeMoveHuman({ piece: 'n', from: 'g1', to: 'f3' })
 * // Returns: "Knight moved from G1 to F3"
 * 
 * @example
 * describeMoveHuman({ piece: 'b', from: 'f1', to: 'g2', captured: 'q' })
 * // Returns: "Bishop moved from F1 to G2. Captured Queen"
 * 
 * @example
 * describeMoveHuman({ piece: 'k', from: 'e1', to: 'g1', flags: 'k', san: 'O-O' })
 * // Returns: "Castled kingside"
 */
export function describeMoveHuman(options: MoveDescriptionOptions): string {
  const { piece, from, to, captured, promotion, flags, san } = options;
  
  const pieceName = PIECE_NAMES[piece];
  
  // Check for castling
  const isCastling = flags?.includes('k') || flags?.includes('q') || 
                     san === 'O-O' || san === 'O-O-O';
  
  if (isCastling) {
    if (san === 'O-O' || flags?.includes('k')) {
      return 'Castled kingside';
    } else if (san === 'O-O-O' || flags?.includes('q')) {
      return 'Castled queenside';
    }
  }
  
  // Check for en passant
  const isEnPassant = flags?.includes('e');
  
  // Build base description
  let description = `${pieceName} moved from ${from.toUpperCase()} to ${to.toUpperCase()}`;
  
  // Add capture information
  if (captured) {
    const capturedName = PIECE_NAMES[captured];
    if (isEnPassant) {
      description += `. Captured ${capturedName} en passant`;
    } else {
      description += `. Captured ${capturedName}`;
    }
  }
  
  // Add promotion information
  if (promotion) {
    const promotionName = PIECE_NAMES[promotion];
    description += `. Promoted to ${promotionName}`;
  }
  
  return description;
}

/**
 * Format a move for display with both human description and notation.
 * Useful for showing both formats side-by-side.
 * 
 * @param options - Move details
 * @returns Object containing humanReadable description and notation
 * 
 * @example
 * formatMoveDisplay({ piece: 'b', from: 'f1', to: 'g2', captured: 'q', san: 'Bxg2' })
 * // Returns: {
 * //   humanReadable: "Bishop moved from F1 to G2. Captured Queen",
 * //   notation: "Bxg2"
 * // }
 */
export function formatMoveDisplay(options: MoveDescriptionOptions): {
  humanReadable: string;
  notation: string;
} {
  const humanReadable = describeMoveHuman(options);
  const notation = options.san || `${options.from}-${options.to}`;
  
  return {
    humanReadable,
    notation,
  };
}

/**
 * Get the piece name with optional indefinite article.
 * 
 * @param piece - Piece type code
 * @param withArticle - Whether to include "a" or "an" before the name
 * @returns The piece name, optionally with article
 * 
 * @example
 * getPieceName('n') // Returns: "Knight"
 * getPieceName('n', true) // Returns: "a Knight"
 */
export function getPieceName(piece: PieceType, withArticle: boolean = false): string {
  const name = PIECE_NAMES[piece];
  if (!withArticle) return name;
  
  // All piece names start with consonants, so use "a"
  return `a ${name}`;
}

/**
 * Get the Unicode symbol for a piece.
 * 
 * @param piece - Piece type code
 * @returns The Unicode chess symbol
 * 
 * @example
 * getPieceSymbol('n') // Returns: "♘"
 * getPieceSymbol('q') // Returns: "♕"
 */
export function getPieceSymbol(piece: PieceType): string {
  return PIECE_SYMBOLS[piece];
}

/**
 * Get move characteristics for display as badges.
 * Identifies special attributes of a move like captures, promotions, etc.
 * 
 * @param options - Move details
 * @returns Array of characteristic labels
 * 
 * @example
 * getMoveCharacteristics({ piece: 'b', from: 'f1', to: 'g2', captured: 'q', san: 'Bxg2+' })
 * // Returns: ['Capture', 'Check']
 */
export function getMoveCharacteristics(options: MoveDescriptionOptions): string[] {
  const characteristics: string[] = [];
  
  if (options.captured) {
    characteristics.push('Capture');
  }
  
  if (options.promotion) {
    characteristics.push('Promotion');
  }
  
  if (options.flags?.includes('k') || options.flags?.includes('q')) {
    characteristics.push('Castling');
  }
  
  if (options.flags?.includes('e')) {
    characteristics.push('En Passant');
  }
  
  if (options.san?.includes('+')) {
    characteristics.push('Check');
  }
  
  if (options.san?.includes('#')) {
    characteristics.push('Checkmate');
  }
  
  return characteristics;
}

/**
 * Converts a chess move into a human-readable description with Unicode symbols.
 * 
 * @param options - Move details including piece, squares, captures, etc.
 * @returns A plain English description with chess symbols
 * 
 * @example
 * describeMoveWithSymbols({ piece: 'n', from: 'g1', to: 'f3' })
 * // Returns: "♘ Knight moved from G1 to F3"
 * 
 * @example
 * describeMoveWithSymbols({ piece: 'b', from: 'f1', to: 'g2', captured: 'q' })
 * // Returns: "♗ Bishop moved from F1 to G2. Captured ♕ Queen"
 * 
 * @example
 * describeMoveWithSymbols({ piece: 'k', from: 'e1', to: 'g1', flags: 'k', san: 'O-O' })
 * // Returns: "♔ Castled kingside"
 */
export function describeMoveWithSymbols(options: MoveDescriptionOptions): string {
  const { piece, from, to, captured, promotion, flags, san } = options;
  
  const pieceName = PIECE_NAMES[piece];
  const pieceSymbol = PIECE_SYMBOLS[piece];
  
  // Check for castling
  const isCastling = flags?.includes('k') || flags?.includes('q') || 
                     san === 'O-O' || san === 'O-O-O';
  
  if (isCastling) {
    if (san === 'O-O' || flags?.includes('k')) {
      return `${pieceSymbol} Castled kingside`;
    } else if (san === 'O-O-O' || flags?.includes('q')) {
      return `${pieceSymbol} Castled queenside`;
    }
  }
  
  // Check for en passant
  const isEnPassant = flags?.includes('e');
  
  // Build base description with symbol
  let description = `${pieceSymbol} ${pieceName} moved from ${from.toUpperCase()} to ${to.toUpperCase()}`;
  
  // Add capture information with symbol
  if (captured) {
    const capturedName = PIECE_NAMES[captured];
    const capturedSymbol = PIECE_SYMBOLS[captured];
    if (isEnPassant) {
      description += `. Captured ${capturedSymbol} ${capturedName} en passant`;
    } else {
      description += `. Captured ${capturedSymbol} ${capturedName}`;
    }
  }
  
  // Add promotion information with symbol
  if (promotion) {
    const promotionName = PIECE_NAMES[promotion];
    const promotionSymbol = PIECE_SYMBOLS[promotion];
    description += `. Promoted to ${promotionSymbol} ${promotionName}`;
  }
  
  return description;
}
