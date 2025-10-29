/* eslint-disable @typescript-eslint/no-explicit-any */
import { Chess } from 'chess.js';
import type { SquarePiece, MaterialCount, MoveInfo, Color, PieceType } from '../types/gameLog.js';

/**
 * Convert chess.js board representation to our SquarePiece array
 * Maps from a8-h1 square notation with pieces present
 */
export function boardToPieces(chess: Chess): SquarePiece[] {
  const board = chess.board();
  const pieces: SquarePiece[] = [];
  
  // Files a-h (columns 0-7)
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  
  // Iterate through 8x8 board (rank 8 to 1, file a to h)
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece) {
        // Convert rank index to chess rank (rank 0 = 8th rank, rank 7 = 1st rank)
        const chessRank = 8 - rank;
        const square = `${files[file]}${chessRank}`;
        
        pieces.push({
          square,
          type: piece.type as PieceType,
          color: piece.color as Color,
        });
      }
    }
  }
  
  return pieces;
}

/**
 * Count pieces by type and color from the pieces array
 */
export function countMaterial(pieces: SquarePiece[]): MaterialCount {
  const material: MaterialCount = {
    white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  
  for (const piece of pieces) {
    if (piece.color === 'w') {
      material.white[piece.type]++;
    } else {
      material.black[piece.type]++;
    }
  }
  
  return material;
}

/**
 * Calculate captured pieces by comparing initial and current material counts
 */
export function capturedFromMaterial(
  initial: MaterialCount,
  current: MaterialCount
): MaterialCount {
  const captured: MaterialCount = {
    white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  
  // Calculate captured white pieces (initial white - current white)
  for (const pieceType of ['p', 'n', 'b', 'r', 'q', 'k'] as PieceType[]) {
    captured.white[pieceType] = Math.max(0, initial.white[pieceType] - current.white[pieceType]);
    captured.black[pieceType] = Math.max(0, initial.black[pieceType] - current.black[pieceType]);
  }
  
  return captured;
}

/**
 * Convert chess.js verbose move object to our MoveInfo type
 */
export function toMoveInfo(moveVerbose: any): MoveInfo {
  // Build UCI notation: from + to + promotion (if any)
  let uci = moveVerbose.from + moveVerbose.to;
  if (moveVerbose.promotion) {
    uci += moveVerbose.promotion;
  }
  
  return {
    san: moveVerbose.san,
    uci,
    from: moveVerbose.from,
    to: moveVerbose.to,
    piece: moveVerbose.piece as PieceType,
    color: moveVerbose.color as Color,
    captured: moveVerbose.captured as PieceType | undefined,
    promotion: moveVerbose.promotion as PieceType | undefined,
    flags: moveVerbose.flags,
  };
}