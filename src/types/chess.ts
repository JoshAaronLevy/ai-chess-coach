import type { Color, PieceType } from './gameLog.js';
import type { TutorInsights } from '../utils/difyParser.js';

// Re-export types used by this module
export type { Color, PieceType } from './gameLog.js';

export interface MoveInsights {
  moveNumber: number;
  san: string;
  fromSquare: string;
  toSquare: string;
  color: Color; // 'w' for white/user, 'b' for black/AI
  insights: TutorInsights;
  timestamp: number;
}

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