import { useState, useCallback, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';

console.info('[USE_CHESS_INIT]');

/**
 * Type for chess piece colors
 */
type ChessColor = 'w' | 'b';

/**
 * Interface for the chess game state
 */
interface ChessGameState {
  fen: string;
  turn: ChessColor;
  historySan: string[];
  lastSan?: string;
  gameOver: boolean;
  gameResult?: string;
}

/**
 * Interface for the useChess hook return value
 */
interface UseChessReturn extends ChessGameState {
  onPieceDrop: (from: string, to: string) => boolean;
  undo: () => void;
  reset: () => void;
  isGameOver: () => boolean;
}

/**
 * Custom React hook for managing chess game state and operations
 * Uses chess.js for game logic and state management
 */
export const useChess = (): UseChessReturn => {
  // Persistent chess.js instance using useRef
  const gameRef = useRef(new Chess());
  
  // Game state derived from gameRef.current
  const [fen, setFen] = useState<string>(gameRef.current.fen());
  const [turn, setTurn] = useState<ChessColor>(gameRef.current.turn());
  const [historySan, setHistorySan] = useState<string[]>([]);
  const [lastSan, setLastSan] = useState<string | undefined>(undefined);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [gameResult, setGameResult] = useState<string | undefined>(undefined);

  /**
   * Updates all state variables based on current chess.js instance
   */
  const updateGameState = useCallback(() => {
    setFen(gameRef.current.fen());
    setTurn(gameRef.current.turn());
    setHistorySan([...gameRef.current.history()]);
    
    // Get the last move if any
    const history = gameRef.current.history();
    setLastSan(history.length > 0 ? history[history.length - 1] : undefined);
    
    // Check game over conditions
    const isOver = gameRef.current.isGameOver();
    setGameOver(isOver);
    
    if (isOver) {
      let result = '';
      if (gameRef.current.isCheckmate()) {
        result = gameRef.current.turn() === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate';
      } else if (gameRef.current.isStalemate()) {
        result = 'Draw by stalemate';
      } else if (gameRef.current.isThreefoldRepetition()) {
        result = 'Draw by threefold repetition';
      } else if (gameRef.current.isInsufficientMaterial()) {
        result = 'Draw by insufficient material';
      } else if (gameRef.current.isDraw()) {
        result = 'Draw';
      }
      setGameResult(result);
    } else {
      setGameResult(undefined);
    }
  }, []);

  /**
   * Handle piece drops from react-chessboard
   * Validates move legality and updates game state if valid
   * Auto-promotes to queen for simplicity
   * IMPORTANT: Must be synchronous and return boolean
   */
  const onPieceDrop = useCallback((from: string, to: string): boolean => {
    // IMPORTANT: must be sync and return boolean
    const move = gameRef.current.move({ from, to, promotion: 'q' }); // promotion default is fine
    console.log('[DROP]', { from, to, move, fen: gameRef.current.fen() });
    if (move == null) return false;
    setFen(gameRef.current.fen());
    setLastSan(move.san);
    setHistorySan(gameRef.current.history());
    setGameOver(gameRef.current.isGameOver());
    return true;
  }, []);

  /**
   * Undo the last move
   * Reverts to previous position and updates state
   */
  const undo = useCallback(() => {
    const undoMove = gameRef.current.undo();
    if (undoMove) {
      updateGameState();
    }
  }, [updateGameState]);

  /**
   * Reset the game to starting position
   * Clears all move history and resets state
   */
  const reset = useCallback(() => {
    gameRef.current.reset();
    updateGameState();
  }, [updateGameState]);

  /**
   * Check if the game has ended
   * Returns true for checkmate, stalemate, or any draw condition
   */
  const isGameOver = useCallback((): boolean => {
    return gameRef.current.isGameOver();
  }, []);

  // Memoize the return object to prevent unnecessary re-renders
  const returnValue = useMemo<UseChessReturn>(() => ({
    // State
    fen,
    turn,
    historySan,
    lastSan,
    gameOver,
    gameResult,
    // Methods
    onPieceDrop,
    undo,
    reset,
    isGameOver
  }), [
    fen,
    turn,
    historySan,
    lastSan,
    gameOver,
    gameResult,
    onPieceDrop,
    undo,
    reset,
    isGameOver
  ]);

  return returnValue;
};

export default useChess;