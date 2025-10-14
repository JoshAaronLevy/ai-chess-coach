# AI Move Analysis Report

## Problem Statement

### Issue Description
After implementing difficulty-based move selection, the AI auto-move feature is not working properly. The symptom is:

**Expected Behavior:** After user (White) makes a move, the AI (Black) should automatically respond with a move based on the selected difficulty level.

**Actual Behavior:** After user moves e2-e4, the API call succeeds and returns proper data, but the AI (Black) piece does NOT automatically move on the board. The UI shows "Turn: Black (AI)" but no piece movement occurs.

### Console Evidence
```
[AI Tutor Insights] {"lastMove":{"grade":"A","explanation":"White's 1.e4 is an excellent opening move..."},"bestMove":null,"next_moves":{"beginner":{"uci":"b8c6","san":"Nc6"},"intermediate":{"uci":"e7e6","san":"e6"},"advanced":{"uci":"c7c5","san":"c5"}},"alternatives":[],"reasoning":"...","confidence":0.85}
[TURN_DEBUG] API call succeeded - Turn updated to: b
```

### Data Flow Analysis
The API returns valid move data in `next_moves` but no `bestMove`. The system should select from `next_moves` based on difficulty but fails to execute the move.

---

## Code Architecture Analysis

### A) Move Handling Pipeline (`src/chess/useChess.ts`)

#### Core Hook Structure (Lines 196-1211)
- **Primary State:** Chess.js instance managed via `useRef` (line 199)
- **Turn Management:** React state `turn` synchronized with chess.js (lines 208-209)
- **AI State:** [`isAiMode`](src/chess/useChess.ts:222), [`isAiThinking`](src/chess/useChess.ts:223), [`pendingAiMove`](src/chess/useChess.ts:224)

#### Move Processing Flow (`onPieceDrop` function, lines 366-674)
1. **Move Validation:** Chess.js validates and applies move (lines 368-370)
2. **State Update:** UI state updated immediately (lines 375-382)
3. **API Call:** Comprehensive board state sent to API (lines 457-468)
4. **Response Processing:** AI move logic triggered in API response handler (lines 483-551)

#### AI Auto-Move Logic (Lines 483-551)
**Critical Discovery:** The AI auto-move logic exists and is comprehensive:

```typescript
// Enhanced AI move validation with difficulty-based selection
if (isAiMode && gameRef.current.turn() === aiColor && !gameRef.current.isGameOver()) {
  // Use difficulty-based move selection if available
  if (parsedInsights.next_moves) {
    const moveSelection = pickAiMoveForDifficulty(difficulty, parsedInsights.next_moves);
    if (moveSelection) {
      // Apply the selected move
      const moveResult = applyUciOrSan(gameRef.current, moveSelection.move);
      if (moveResult) {
        // Convert and execute via handleAiMoveResponse
        const aiMove = { uci: moveSelection.move.uci || '', san: moveSelection.move.san || moveResult.san };
        gameRef.current.undo(); // Undo test move
        handleAiMoveResponse(aiMove); // Execute properly
      }
    }
  }
}
```

#### Key Functions Analysis

**[`pickAiMoveForDifficulty`](src/chess/useChess.ts:27-71)** - Difficulty-based move selection
- Validates `next_moves` structure
- Implements fallback hierarchy: advanced → intermediate → beginner
- Returns `{ move, fallbackUsed }` object

**[`applyUciOrSan`](src/chess/useChess.ts:76-87)** - Move application helper
- Handles both UCI and SAN notation
- Used for testing move validity

**[`handleAiMoveResponse`](src/chess/useChess.ts:888-911)** - AI move executor
- Sets thinking state
- Implements 1-2 second natural delay
- Calls `executeAiMove` after timeout

**[`executeAiMove`](src/chess/useChess.ts:916-991)** - Final move execution
- Validates game state
- Applies move via `applyUciMove`
- Updates all game state
- Handles error cases

### B) API Integration (`src/lib/coachApi.ts`)

#### [`postCoachGrade`](src/lib/coachApi.ts:19-41) Function
- **Endpoint:** `${getApiBaseUrl()}/api/coach/grade`
- **Method:** POST with JSON payload
- **Data:** Complete board state including move history, legal moves, material count
- **Response:** Raw API response (text or JSON)

**Integration Point:** Called from [`onPieceDrop`](src/chess/useChess.ts:467) after every user move.

### C) Response Parsing (`src/utils/difyParser.ts`)

#### [`parseDifyAnswer`](src/utils/difyParser.ts:166-214) Function
- **Input:** Raw Dify API response
- **Validation:** Zod schemas for type safety
- **Output:** [`TutorInsights`](src/utils/difyParser.ts:67-88) interface

#### TutorInsights Structure (Lines 67-88)
```typescript
interface TutorInsights {
  lastMove: { grade: string | null; explanation: string | null };
  bestMove: { uci: string; san: string } | null;
  next_moves?: {
    beginner?: { uci?: string | null; san?: string | null };
    intermediate?: { uci?: string | null; san?: string | null };
    advanced?: { uci?: string | null; san?: string | null };
  };
  alternatives: Array<{ uci: string; san: string; why: string }>;
  reasoning: string | null;
  confidence: number | null;
}
```

**Critical Point:** Response parsing correctly handles both `bestMove` and `next_moves` structures.

### D) Difficulty Management (`src/store/aiDifficultyStore.ts`)

#### Zustand Store (Lines 74-92)
- **State:** [`difficulty`](src/store/aiDifficultyStore.ts:10) with type [`AiDifficulty`](src/store/aiDifficultyStore.ts:3)
- **Persistence:** localStorage with key `AI_CHESS_COACH_DIFFICULTY`
- **Default:** `'beginner'` (line 30)
- **Integration:** Used in [`useChess`](src/chess/useChess.ts:205) via `useAiDifficultyStore()`

### E) UI Integration (`src/pages/GamePage.tsx`)

#### AI State Display (Lines 181-193)
- Shows "AI is thinking..." when [`isAiThinking`](src/pages/GamePage.tsx:181) is true
- Displays "Black (AI)" during AI turns
- Disables piece dragging during AI processing

#### Piece Dragging Logic ([`canDragPiece`](src/pages/GamePage.tsx:151-156))
```typescript
const canDragPiece = useMemo(() => {
  return (): boolean => {
    return !(gameOver || isAiThinking || isLoadingInsights || turn === 'b');
  };
}, [gameOver, isAiThinking, isLoadingInsights, turn]);
```

**Critical Discovery:** UI correctly prevents dragging when `turn === 'b'` (AI's turn).

---

## Recent Changes Analysis

### Difficulty-Based Move Selection Implementation

The system includes comprehensive difficulty-based move selection:

1. **[`pickAiMoveForDifficulty`](src/chess/useChess.ts:27-71)** helper function added
2. **[`applyUciOrSan`](src/chess/useChess.ts:76-87)** helper function for move testing
3. **Integration** in both success (lines 508-543) and error (lines 591-634) API response handlers
4. **Fallback Logic** to `bestMove` when `next_moves` unavailable

### Integration Points
- **Primary:** [`onPieceDrop`](src/chess/useChess.ts:483-551) response handler
- **Secondary:** Error response handler (lines 573-644)
- **State Management:** [`useAiDifficultyStore`](src/chess/useChess.ts:205) integration

---

## Data Flow Diagram (Text)

```
User drops piece → onPieceDrop() → move validation → 
state update → API call (postCoachGrade) → 
API response → parseDifyAnswer() → 
[CONDITIONS CHECK: isAiMode && turn === 'b' && !gameOver] →
next_moves available? → pickAiMoveForDifficulty() →
applyUciOrSan() test → [UNDO TEST MOVE] →
handleAiMoveResponse() → [1-2s delay] → executeAiMove() →
applyUciMove() → updateGameState()
```

### Critical Gap Analysis
The console shows the API response contains valid `next_moves` data, but the AI move execution chain may be breaking at one of these points:

1. **Condition Guards:** AI conditions might not be met
2. **Move Selection:** `pickAiMoveForDifficulty` might return null
3. **Move Testing:** `applyUciOrSan` might fail
4. **Execution Chain:** `handleAiMoveResponse` → `executeAiMove` chain might break

---

## Critical Questions to Answer

### 1. Are the AI Conditions Being Met?
**Location:** [`onPieceDrop`](src/chess/useChess.ts:483) condition check
```typescript
if (isAiMode && gameRef.current.turn() === aiColor && !gameRef.current.isGameOver())
```
**Status:** From logs, `turn` is correctly 'b', but need to verify `isAiMode` state.

### 2. Is Move Selection Working?
**Location:** [`pickAiMoveForDifficulty`](src/chess/useChess.ts:510) call
**Console Evidence:** Extensive debug logging exists (lines 35, 502-505)
**Status:** Need to verify if this function is being reached and what it returns.

### 3. Is Move Testing Succeeding?
**Location:** [`applyUciOrSan`](src/chess/useChess.ts:513) call
**Status:** This tests the move but undoes it (line 524) - might be failing silently.

### 4. Is the Execution Chain Starting?
**Location:** [`handleAiMoveResponse`](src/chess/useChess.ts:525) call
**Status:** If reached, should set `isAiThinking` to true and show "AI is thinking..." UI.

### 5. Are There Race Conditions?
**Issue:** State updates are async, timing might affect execution
**Evidence:** Complex state management with multiple async operations

### 6. Is There a Missing AI Mode Setting?
**Critical Discovery:** In [`GamePage.tsx`](src/pages/GamePage.tsx), the AI mode is **always on** - there's no toggle:
- Line 33: Comment indicates "AI is always on now"
- Line 188-191: UI always shows "(AI)" for black moves
- No `isAiMode` toggle in UI

**Potential Issue:** The `isAiMode` state in [`useChess`](src/chess/useChess.ts:222) might default to `false` and never be set to `true`.

---

## Hypotheses & Recommendations

### Hypothesis 1: AI Mode is Not Enabled (HIGH PROBABILITY)
**Evidence:**
- [`GamePage.tsx`](src/pages/GamePage.tsx:33) comment suggests "AI is always on"
- No UI toggle for AI mode visible
- [`isAiMode`](src/chess/useChess.ts:222) state defaults to `false`
- Condition check requires `isAiMode` to be `true`

**Investigation:** Check if `isAiMode` is ever set to `true`
**Location:** [`useChess.ts:222`](src/chess/useChess.ts:222)
**Fix:** Either set `isAiMode` to default `true` or implement auto-enable logic

### Hypothesis 2: Missing API Response Field (MEDIUM PROBABILITY)
**Evidence:**
- Console shows `"bestMove":null` in API response
- Logic depends on `next_moves` field
- May have parsing or field name mismatches

**Investigation:** Verify API response structure matches [`TutorInsights`](src/utils/difyParser.ts:67) interface
**Location:** [`difyParser.ts:185`](src/utils/difyParser.ts:185)

### Hypothesis 3: Silent Move Validation Failure (MEDIUM PROBABILITY)
**Evidence:**
- [`applyUciOrSan`](src/chess/useChess.ts:513) tests move but may fail silently
- Complex test-and-undo logic
- No error logging in success path

**Investigation:** Add debug logging in [`applyUciOrSan`](src/chess/useChess.ts:76) function
**Location:** [`useChess.ts:513-524`](src/chess/useChess.ts:513-524)

### Recommended Debugging Approach

1. **Add Condition Logging:** 
   ```typescript
   console.log('[AI_CONDITIONS]', { 
     isAiMode, 
     turn: gameRef.current.turn(), 
     aiColor, 
     gameOver: gameRef.current.isGameOver() 
   });
   ```

2. **Verify Move Selection:**
   Enable existing debug logs in [`pickAiMoveForDifficulty`](src/chess/useChess.ts:35)

3. **Add Execution Chain Logging:**
   Log entry/exit of [`handleAiMoveResponse`](src/chess/useChess.ts:888) and [`executeAiMove`](src/chess/useChess.ts:916)

4. **Check AI Mode State:**
   Verify how [`isAiMode`](src/chess/useChess.ts:222) gets set to `true`

### Top Recommendation

**Most Likely Issue:** The [`isAiMode`](src/chess/useChess.ts:222) state is not being set to `true`, causing the AI auto-move logic to never execute despite having all the correct data and implementation.

**Immediate Action:** Investigate how AI mode gets enabled or set default to `true` for the "always-on" design shown in [`GamePage.tsx`](src/pages/GamePage.tsx).