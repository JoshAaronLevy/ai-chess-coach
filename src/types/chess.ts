import type { Color, PieceType } from './gameLog.js';

export type { Color, PieceType };

export interface LegalMoveDetailed {
  san: string;
  uci: string | null;       // from+to+promotion, null if can't build
  from: string;
  to: string;
  piece: PieceType;
  color: Color;
  captured?: PieceType;
  promotion?: PieceType;
  flags: string;
  givesCheck: boolean;
}

export interface BoardStateAugmented {
  positionId: string;                 // hex string
  legalMovesDetailed: LegalMoveDetailed[];
}