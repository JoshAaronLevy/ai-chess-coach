import { useState, useCallback } from 'react';
import { Chess } from 'chess.js';
import type { GameLog, Snapshot, Color } from '../types/gameLog.js';
import { boardToPieces, countMaterial, capturedFromMaterial, toMoveInfo } from './serializers.js';

/**
 * Generate a unique game ID using timestamp
 */
function generateGameId(): string {
  return `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique snapshot ID using timestamp
 */
function generateSnapshotId(): string {
  return `snap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Save data to localStorage with error handling
 */
function saveToLocalStorage(key: string, data: any): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn(`Failed to save to localStorage (${key}):`, error);
  }
}


/**
 * Create an initial snapshot from a FEN position
 */
function createInitialSnapshot(fen: string): Snapshot {
  const chess = new Chess(fen);
  const pieces = boardToPieces(chess);
  const material = countMaterial(pieces);
  
  return {
    id: generateSnapshotId(),
    ts: Date.now(),
    ply: 0,
    fullmove: chess.moveNumber(),
    sideToMove: chess.turn() as Color,
    fen,
    move: null, // Initial position has no move
    pieces,
    material,
    capturedCounts: {
      white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    },
  };
}

/**
 * React hook for managing game log state with localStorage persistence
 */
export function useGameLog() {
  const [gameLog, setGameLog] = useState<GameLog | null>(null);

  /**
   * Persist the current game log to localStorage
   */
  const persistGameLog = useCallback((log: GameLog) => {
    saveToLocalStorage(`acc_game_${log.gameId}`, log);
    saveToLocalStorage('acc_current_game_id', log.gameId);
  }, []);

  /**
   * Start a new game with the given initial FEN position
   */
  const startNew = useCallback((initialFen: string) => {
    const gameId = generateGameId();
    const initialSnapshot = createInitialSnapshot(initialFen);
    
    const newLog: GameLog = {
      gameId,
      startedAt: Date.now(),
      initialFen,
      snapshots: [initialSnapshot],
    };
    
    setGameLog(newLog);
    persistGameLog(newLog);
  }, [persistGameLog]);

  /**
   * Record a new snapshot after a move has been made
   */
  const recordAfterMove = useCallback((chess: Chess, moveVerbose: any) => {
    if (!gameLog) {
      throw new Error('No active game log. Call startNew() first.');
    }

    const pieces = boardToPieces(chess);
    const material = countMaterial(pieces);
    
    // Get initial material from the first snapshot to calculate captured pieces
    const initialMaterial = gameLog.snapshots[0]?.material;
    const capturedCounts = initialMaterial 
      ? capturedFromMaterial(initialMaterial, material)
      : { white: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, black: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 } };

    const newSnapshot: Snapshot = {
      id: generateSnapshotId(),
      ts: Date.now(),
      ply: gameLog.snapshots.length, // Current length equals the ply number for the new move
      fullmove: chess.moveNumber(),
      sideToMove: chess.turn() as Color,
      fen: chess.fen(),
      move: toMoveInfo(moveVerbose),
      pieces,
      material,
      capturedCounts,
    };

    const updatedLog: GameLog = {
      ...gameLog,
      snapshots: [...gameLog.snapshots, newSnapshot],
    };

    setGameLog(updatedLog);
    persistGameLog(updatedLog);
  }, [gameLog, persistGameLog]);

  /**
   * Undo the last move by removing the last snapshot
   */
  const undoLast = useCallback(() => {
    if (!gameLog || gameLog.snapshots.length <= 1) {
      // Can't undo if no game or only initial snapshot
      return;
    }

    const updatedLog: GameLog = {
      ...gameLog,
      snapshots: gameLog.snapshots.slice(0, -1),
    };

    setGameLog(updatedLog);
    persistGameLog(updatedLog);
  }, [gameLog, persistGameLog]);

  /**
   * Reset everything with a new game ID and fresh log
   */
  const resetAll = useCallback((initialFen: string) => {
    const gameId = generateGameId();
    const initialSnapshot = createInitialSnapshot(initialFen);
    
    const newLog: GameLog = {
      gameId,
      startedAt: Date.now(),
      initialFen,
      snapshots: [initialSnapshot],
    };
    
    setGameLog(newLog);
    persistGameLog(newLog);
  }, [persistGameLog]);

  /**
   * Get the current game log
   */
  const getLog = useCallback((): GameLog => {
    if (!gameLog) {
      throw new Error('No active game log. Call startNew() or resetAll() first.');
    }
    return gameLog;
  }, [gameLog]);

  /**
   * Get the snapshots array (alias to getLog().snapshots)
   */
  const snapshots = gameLog?.snapshots || [];

  /**
   * Debug helper to inspect current log state
   */
  const logDebug = useCallback(() => {
    return {
      len: snapshots.length,
      last: snapshots.at(-1),
    };
  }, [snapshots]);

  return {
    startNew,
    recordAfterMove,
    undoLast,
    resetAll,
    getLog,
    snapshots,
    logDebug,
  };
}