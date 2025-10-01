import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import { useGameLog } from './useGameLog.js';
import { boardToPieces, countMaterial, capturedFromMaterial, toMoveInfo } from './serializers.js';
import type { LegalMoveDetailed } from '../types/chess.js';
import { hashPositionId } from '../utils/hash.js';
import { postCoachGrade } from '../lib/coachApi';
import { parseDifyAnswer } from '../utils/difyParser';

console.info('[USE_CHESS_INIT]');

/**
 * Type for chess piece colors
 */
type ChessColor = 'w' | 'b';

/**
 * Compute detailed legal moves with check detection
 */
function computeLegalMovesDetailed(game: Chess): LegalMoveDetailed[] {
  const verbose = game.moves({ verbose: true }) as Array<any>;
  return verbose.map(m => {
    const uci = (m.from && m.to) ? (m.from + m.to + (m.promotion ? m.promotion : '')) : null;

    // compute givesCheck by applying on a clone
    const clone = new Chess(game.fen());
    clone.move({ from: m.from, to: m.to, promotion: m.promotion });
    const givesCheck = clone.inCheck();

    return {
      san: m.san,
      uci,
      from: m.from,
      to: m.to,
      piece: m.piece,
      color: m.color,
      captured: m.captured ?? undefined,
      promotion: m.promotion ?? undefined,
      flags: m.flags,
      givesCheck
    };
  });
}

/**
 * Compute deterministic position ID from FEN and turn
 */
function computePositionId(fen: string, turn: 'w'|'b'): string {
  return hashPositionId(`${fen}|${turn}`);
}

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
  
  // Initialize game log hook
  const gameLog = useGameLog();
  
  // Game state derived from gameRef.current
  const [fen, setFen] = useState<string>(gameRef.current.fen());
  const [turn, setTurn] = useState<ChessColor>(gameRef.current.turn());
  const [historySan, setHistorySan] = useState<string[]>([]);
  const [lastSan, setLastSan] = useState<string | undefined>(undefined);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [gameResult, setGameResult] = useState<string | undefined>(undefined);

  // Initialize game log on first mount if no current log exists
  useEffect(() => {
    if (gameLog.snapshots.length === 0) {
      gameLog.startNew(gameRef.current.fen());
    }
  }, []); // Empty dependency array - only run on mount

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
    
    // Update UI state
    setFen(gameRef.current.fen());
    setLastSan(move.san);
    setHistorySan(gameRef.current.history());
    setGameOver(gameRef.current.isGameOver());
    
    // Record move in game log
    gameLog.recordAfterMove(gameRef.current, move);
    
    // Comprehensive board state logging for LLM analysis
    const currentPieces = boardToPieces(gameRef.current);
    const materialCount = countMaterial(currentPieces);
    
    // Calculate captured pieces by comparing to starting position
    const startingMaterial = {
      white: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
      black: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
    };
    const capturedPieces = capturedFromMaterial(startingMaterial, materialCount);
    
    // Convert move to comprehensive format
    const moveInfo = toMoveInfo(move);
    
    const boardState = {
      pieces: currentPieces,
      fen: gameRef.current.fen(),
      turn: gameRef.current.turn(),
      moveNumber: gameRef.current.moveNumber(),
      halfmoveClock: gameRef.current.fen().split(' ')[4], // Extract halfmove clock from FEN
      fullmoveNumber: gameRef.current.fen().split(' ')[5], // Extract fullmove number from FEN
      inCheck: gameRef.current.inCheck(),
      gameOver: gameRef.current.isGameOver(),
      checkmate: gameRef.current.isCheckmate(),
      stalemate: gameRef.current.isStalemate(),
      draw: gameRef.current.isDraw(),
      threefoldRepetition: gameRef.current.isThreefoldRepetition(),
      insufficientMaterial: gameRef.current.isInsufficientMaterial(),
      positionId: computePositionId(gameRef.current.fen(), gameRef.current.turn()),
      legalMovesDetailed: computeLegalMovesDetailed(gameRef.current)
    };

    const payload = {
      boardState,
      lastMove: {
        san: moveInfo.san,
        uci: moveInfo.uci,
        from: moveInfo.from,
        to: moveInfo.to,
        piece: moveInfo.piece,
        color: moveInfo.color,
        captured: moveInfo.captured,
        promotion: moveInfo.promotion,
        flags: moveInfo.flags
      },
      materialCount,
      capturedPieces,
      moveHistory: {
        san: gameRef.current.history(),
        uci: gameRef.current.history({ verbose: true }).map(m => toMoveInfo(m).uci),
        totalMoves: gameRef.current.history().length,
        currentPly: gameRef.current.history().length
      },
      gameAnalysis: {
        legalMoves: gameRef.current.moves(),
        legalMovesCount: gameRef.current.moves().length,
        attackedSquares: gameRef.current.moves({ verbose: true }).map(m => m.to),
        kingSquares: {
          white: currentPieces.find(p => p.type === 'k' && p.color === 'w')?.square,
          black: currentPieces.find(p => p.type === 'k' && p.color === 'b')?.square
        }
      }
    };

    // Comprehensive board state logging for LLM analysis
    console.log('Complete Chess Board State for LLM:', JSON.stringify(payload));

    // Send board state to coach API for analysis
    console.log('[COACH] API call takes flight with payload:', payload);
    postCoachGrade(payload)
      .then(resp => {
        // Keep existing log exactly as is
        console.log('[COACH] API call completed successfully:', JSON.stringify(resp));
        
        // Add new parsing and logging
        const insights = parseDifyAnswer(resp);
        console.log('[AI Tutor Insights]', JSON.stringify(insights));
      })
      .catch(err => {
        // Keep existing error log
        console.log('[COACH] API call completed with error:', JSON.stringify(err));
        
        // Optionally add insights parsing for error responses if they contain answer data
        const insights = parseDifyAnswer(err);
        console.log('[AI Tutor Insights]', insights);
      });
    
    // Compact debug logging
    console.debug('[BOARD_STATE+]', { pid: boardState.positionId, lm: boardState.legalMovesDetailed.length });
    
    return true;
  }, [gameLog]);

  /**
   * Undo the last move
   * Reverts to previous position and updates state
   */
  const undo = useCallback(() => {
    const undoMove = gameRef.current.undo();
    if (undoMove) {
      updateGameState();
      gameLog.undoLast();
      
      // Enhanced board state logging after undo
      const currentPieces = boardToPieces(gameRef.current);
      const materialCount = countMaterial(currentPieces);
      
      const startingMaterial = {
        white: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
        black: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
      };
      const capturedPieces = capturedFromMaterial(startingMaterial, materialCount);
      
      const boardState = {
        pieces: currentPieces,
        fen: gameRef.current.fen(),
        turn: gameRef.current.turn(),
        moveNumber: gameRef.current.moveNumber(),
        halfmoveClock: gameRef.current.fen().split(' ')[4],
        fullmoveNumber: gameRef.current.fen().split(' ')[5],
        inCheck: gameRef.current.inCheck(),
        gameOver: gameRef.current.isGameOver(),
        checkmate: gameRef.current.isCheckmate(),
        stalemate: gameRef.current.isStalemate(),
        draw: gameRef.current.isDraw(),
        threefoldRepetition: gameRef.current.isThreefoldRepetition(),
        insufficientMaterial: gameRef.current.isInsufficientMaterial(),
        positionId: computePositionId(gameRef.current.fen(), gameRef.current.turn()),
        legalMovesDetailed: computeLegalMovesDetailed(gameRef.current)
      };

      console.log('Complete Chess Board State for LLM (After Undo):', JSON.stringify({
        boardState,
        materialCount,
        capturedPieces,
        moveHistory: {
          san: gameRef.current.history(),
          uci: gameRef.current.history({ verbose: true }).map(m => toMoveInfo(m).uci),
          totalMoves: gameRef.current.history().length,
          currentPly: gameRef.current.history().length
        },
        gameAnalysis: {
          legalMoves: gameRef.current.moves(),
          legalMovesCount: gameRef.current.moves().length,
          attackedSquares: gameRef.current.moves({ verbose: true }).map(m => m.to),
          kingSquares: {
            white: currentPieces.find(p => p.type === 'k' && p.color === 'w')?.square,
            black: currentPieces.find(p => p.type === 'k' && p.color === 'b')?.square
          }
        }
      }));

      console.debug('[BOARD_STATE+]', { pid: boardState.positionId, lm: boardState.legalMovesDetailed.length });
    }
  }, [updateGameState, gameLog]);

  /**
   * Reset the game to starting position
   * Clears all move history and resets state
   */
  const reset = useCallback(() => {
    gameRef.current.reset();
    updateGameState();
    gameLog.resetAll(gameRef.current.fen());
    
    // Enhanced board state logging after reset
    const currentPieces = boardToPieces(gameRef.current);
    const materialCount = countMaterial(currentPieces);
    
    const startingMaterial = {
      white: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
      black: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
    };
    const capturedPieces = capturedFromMaterial(startingMaterial, materialCount);
    
    const boardState = {
      pieces: currentPieces,
      fen: gameRef.current.fen(),
      turn: gameRef.current.turn(),
      moveNumber: gameRef.current.moveNumber(),
      halfmoveClock: gameRef.current.fen().split(' ')[4],
      fullmoveNumber: gameRef.current.fen().split(' ')[5],
      inCheck: gameRef.current.inCheck(),
      gameOver: gameRef.current.isGameOver(),
      checkmate: gameRef.current.isCheckmate(),
      stalemate: gameRef.current.isStalemate(),
      draw: gameRef.current.isDraw(),
      threefoldRepetition: gameRef.current.isThreefoldRepetition(),
      insufficientMaterial: gameRef.current.isInsufficientMaterial(),
      positionId: computePositionId(gameRef.current.fen(), gameRef.current.turn()),
      legalMovesDetailed: computeLegalMovesDetailed(gameRef.current)
    };

    console.log('Complete Chess Board State for LLM (After Reset):', JSON.stringify({
      boardState,
      materialCount,
      capturedPieces,
      moveHistory: {
        san: gameRef.current.history(),
        uci: gameRef.current.history({ verbose: true }).map(m => toMoveInfo(m).uci),
        totalMoves: gameRef.current.history().length,
        currentPly: gameRef.current.history().length
      },
      gameAnalysis: {
        legalMoves: gameRef.current.moves(),
        legalMovesCount: gameRef.current.moves().length,
        attackedSquares: gameRef.current.moves({ verbose: true }).map(m => m.to),
        kingSquares: {
          white: currentPieces.find(p => p.type === 'k' && p.color === 'w')?.square,
          black: currentPieces.find(p => p.type === 'k' && p.color === 'b')?.square
        }
      }
    }));

    console.debug('[BOARD_STATE+]', { pid: boardState.positionId, lm: boardState.legalMovesDetailed.length });
  }, [updateGameState, gameLog]);

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