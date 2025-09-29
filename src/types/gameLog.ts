export type Color = 'w' | 'b';

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface SquarePiece {
  square: string;
  type: PieceType;
  color: Color;
}

export interface MaterialCount {
  white: Record<PieceType, number>;
  black: Record<PieceType, number>;
}

export interface MoveInfo {
  san: string;
  uci: string;
  from: string;
  to: string;
  piece: PieceType;
  color: Color;
  captured?: PieceType;
  promotion?: PieceType;
  flags: string;
}

export interface Snapshot {
  id: string;
  ts: number;
  ply: number;
  fullmove: number;
  sideToMove: Color;
  fen: string;
  move: MoveInfo | null;
  pieces: SquarePiece[];
  material: MaterialCount;
  capturedCounts: MaterialCount;
}

export interface GameLog {
  gameId: string;
  startedAt: number;
  initialFen: string;
  snapshots: Snapshot[];
}