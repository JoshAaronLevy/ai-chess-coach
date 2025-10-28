# AI Chess Coach Refactor Plan

### Clarifications

#### 1) useChess.ts — Mutations vs Reads of gameRef

**Mutations:**
- • `new Chess()` — src/chess/useChess.ts:202 — `gameRef.current = new Chess()`
- • `onPieceDrop` — src/chess/useChess.ts:383-713 — `gameRef.current.move({ from, to, promotion: 'q' })`
- • `undo` — src/chess/useChess.ts:719-778 — `gameRef.current.undo()`
- • `reset` — src/chess/useChess.ts:784-857 — `gameRef.current.reset()`
- • `executeAiMove` — src/chess/useChess.ts:959-1077 — `applyUciMove(gameRef.current, uciMove)`
- • `loadSavedGame` — src/chess/useChess.ts:1123-1225 — `gameRef.current.load(mostRecentSave.fen)`
- • `applyUciOrSan` — src/chess/useChess.ts:76-87 — `game.move({ from, to, promotion })` and `game.move(m.san)`
- • `computeLegalMovesDetailed` — src/chess/useChess.ts:92-124 — `new Chess(game.fen())` and `clone.move()`

**Reads:**
- • `updateGameState` — src/chess/useChess.ts:331-375 — `gameRef.current.fen()`, `gameRef.current.turn()`, `gameRef.current.history()`, `gameRef.current.isGameOver()`, `gameRef.current.isCheckmate()`, etc.
- • `onPieceDrop` — src/chess/useChess.ts:383-713 — `gameRef.current.fen()`, `gameRef.current.turn()`, `gameRef.current.history()`, `gameRef.current.moveNumber()`, `gameRef.current.inCheck()`
- • `checkStateDifference` — src/chess/useChess.ts:279-326 — `gameRef.current.fen()`, `gameRef.current.history()`
- • `isGameOver` — src/chess/useChess.ts:863-865 — `gameRef.current.isGameOver()`
- • `executeAiMove` — src/chess/useChess.ts:959-1077 — `gameRef.current.isGameOver()`, `gameRef.current.turn()`
- • `isAiTurn` — src/chess/useChess.ts:924-926 — uses `turn` state derived from `gameRef.current.turn()`

**Indirect via helper:**
- • `applyUciMove` helper — src/utils/uciUtils.ts:16-36 — `game.move({ from, to, promotion })`
- • `toMoveInfo` helper — src/chess/serializers.ts — accesses move properties from chess.js move objects

#### 2) AI Move Executor Pathway

1) **Dify Response Landing** — src/chess/useChess.ts:486-594 — `postCoachGrade()` resolves, `parseDifyAnswer()` extracts insights
2) **Difficulty-based Move Selection** — src/chess/useChess.ts:543-583 — `pickAiMoveForDifficulty(difficulty, parsedInsights.next_moves)` selects move by difficulty level
3) **Move Validation** — src/chess/useChess.ts:547-564 — `applyUciOrSan(gameRef.current, moveSelection.move)` tests move, then `gameRef.current.undo()` reverts
4) **AI Move Handler** — src/chess/useChess.ts:931-954 — `handleAiMoveResponse(aiMove)` sets thinking state and schedules execution with 1-2s delay
5) **Final Executor** — src/chess/useChess.ts:959-1077 — `executeAiMove(uciMove)` applies move via `applyUciMove(gameRef.current, uciMove)`
6) **State Updates** — src/chess/useChess.ts:994-1061 — `updateGameState()` called, game log recorded, coaching API called for analysis

**UCI vs SAN:** Both accepted in `applyUciOrSan()` (src/chess/useChess.ts:76-87). UCI preferred, SAN fallback. SAN→UCI validation occurs in `applyUciMove()` helper.

**Guards:** `isAiThinking` check (lines 961-964), game over check (lines 967-971), turn validation (lines 974-978), 10-second timeout (lines 941-945).

#### 3) Persistence (localStorage) Shape

- **`ai-chess-coach-difficulty`**
  - Writes: src/store/aiDifficultyStore.ts:65
  - Reads: src/store/aiDifficultyStore.ts:33  
  - Example payload: `"beginner"` | `"intermediate"` | `"advanced"`
  - Notes: Simple string value, validation with fallback to "beginner"

- **`acc_saved_game_${timestamp}`** (multiple keys)
  - Writes: src/chess/useChess.ts:1102
  - Reads: src/chess/useChess.ts:248, src/chess/useChess.ts:287, src/chess/useChess.ts:1133
  - Example payload: `{"id": "saved_game_1234567890", "timestamp": 1234567890, "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "historySan": ["e4", "e5"], "isAiMode": true, "moveCount": 2, "currentTurn": "w"}`
  - Notes: No version field or migration logic found

- **`gameLog_${gameId}`** (game log snapshots)
  - Writes: src/chess/useGameLog.ts:25
  - Reads: src/chess/useGameLog.ts (implicit through hook usage)
  - Example payload: GameSnapshot objects with FEN, timestamps, move info
  - Notes: Debounced saves, error handling with console.warn

#### 4) Dify API Abort/Timeout

- **Request sites:** src/lib/coachApi.ts:24-33
- **Abort/Timeout:** Not found.
- **Details:** No AbortController, no timeout parameter, no retry/backoff logic. Uses basic `fetch()` call with blocking response mode. Missing timeout protection for network requests.

#### 5) Current Bugs to Eliminate First

1) **Excessive Debug Logging** — src/chess/useChess.ts:35-70, 389-404, 509-511, 536-680 — Impact: High
   - Repro/Notes: Console flooded with [DEBUG] messages in production, performance impact from JSON.stringify operations

2) **Race Condition Protection** — src/chess/useChess.ts:961-964 — Impact: High  
   - Repro/Notes: `isAiThinking && pendingAiMove` check may miss edge cases, duplicate move execution possible

3) **Stale Response Acceptance** — src/chess/useChess.ts:513-590 — Impact: Med
   - Repro/Notes: No request ID validation, old API responses could trigger moves after game state changed

4) **Missing API Timeout** — src/lib/coachApi.ts:24-33 — Impact: Med
   - Repro/Notes: No AbortController or timeout, hanging requests possible on network issues

5) **Test-then-Undo Side Effects** — src/chess/useChess.ts:547-564, 636-653 — Impact: Med
   - Repro/Notes: Move validation applies move then undoes it, could affect game state or history edge cases

6) **localStorage Error Suppression** — src/chess/useGameLog.ts:27, src/store/aiDifficultyStore.ts:67 — Impact: Low
   - Repro/Notes: Silent failures with console.warn only, no user feedback on save failures