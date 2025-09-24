import { useState, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';

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
  onDrop: (from: string, to: string) => boolean;
  undo: () => void;
  reset: () => void;
  isGameOver: () => boolean;
}

/**
 * Custom React hook for managing chess game state and operations
 * Uses chess.js for game logic and state management
 */
export const useChess = (): UseChessReturn => {
  // Initialize chess.js instance with starting position
  const [chess] = useState(() => new Chess());
  
  // Game state
  const [fen, setFen] = useState<string>(chess.fen());
  const [turn, setTurn] = useState<ChessColor>(chess.turn());
  const [historySan, setHistorySan] = useState<string[]>([]);
  const [lastSan, setLastSan] = useState<string | undefined>(undefined);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [gameResult, setGameResult] = useState<string | undefined>(undefined);

  /**
   * Updates all state variables based on current chess.js instance
   */
  const updateGameState = useCallback(() => {
    setFen(chess.fen());
    setTurn(chess.turn());
    setHistorySan([...chess.history()]);
    
    // Get the last move if any
    const history = chess.history();
    setLastSan(history.length > 0 ? history[history.length - 1] : undefined);
    
    // Check game over conditions
    const isOver = chess.isGameOver();
    setGameOver(isOver);
    
    if (isOver) {
      let result = '';
      if (chess.isCheckmate()) {
        result = chess.turn() === 'w' ? 'Black wins by checkmate' : 'White wins by checkmate';
      } else if (chess.isStalemate()) {
        result = 'Draw by stalemate';
      } else if (chess.isThreefoldRepetition()) {
        result = 'Draw by threefold repetition';
      } else if (chess.isInsufficientMaterial()) {
        result = 'Draw by insufficient material';
      } else if (chess.isDraw()) {
        result = 'Draw';
      }
      setGameResult(result);
    } else {
      setGameResult(undefined);
    }
  }, [chess]);

  /**
   * Handle piece drops from react-chessboard
   * Validates move legality and updates game state if valid
   * Auto-promotes to queen for simplicity
   */
  const onDrop = useCallback((from: string, to: string): boolean => {
    try {
      // Attempt to make the move with auto-promotion to queen
      const move = chess.move({
        from,
        to,
        promotion: 'q' // Auto-promote to queen for simplicity
      });

      // If move is null, it was invalid
      if (move === null) {
        return false;
      }

      // Move was successful, update all state
      updateGameState();
      return true;
    } catch (error) {
      // Invalid move attempted
      console.warn('Invalid move attempted:', { from, to, error });
      return false;
    }
  }, [chess, updateGameState]);

  /**
   * Undo the last move
   * Reverts to previous position and updates state
   */
  const undo = useCallback(() => {
    const undoMove = chess.undo();
    if (undoMove) {
      updateGameState();
    }
  }, [chess, updateGameState]);

  /**
   * Reset the game to starting position
   * Clears all move history and resets state
   */
  const reset = useCallback(() => {
    chess.reset();
    updateGameState();
  }, [chess, updateGameState]);

  /**
   * Check if the game has ended
   * Returns true for checkmate, stalemate, or any draw condition
   */
  const isGameOver = useCallback((): boolean => {
    return chess.isGameOver();
  }, [chess]);

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
    onDrop,
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
    onDrop,
    undo,
    reset,
    isGameOver
  ]);

  return returnValue;
};

export default useChess;