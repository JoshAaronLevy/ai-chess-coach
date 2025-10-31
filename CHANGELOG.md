## [2025-10-31] — v0.3.6
### Overview
Refined AI Chess Coach instructions to enforce true difficulty scaling between beginner, intermediate, and advanced move suggestions. Also standardized output expectations so the same depth and structure of analysis is always returned, no matter whose turn it is.

### Added
- Added an explicit requirement that the model must return the **exact same JSON structure and reasoning depth** after every move, whether the last move was made by the human or by the AI. This prevents “short” / “light” responses on AI turns.
- Added explicit mapping between each difficulty tier and a letter-grade band so that suggested moves feel different in strength:
  - **Advanced:** must be a move that would score **A– or better** under the grading rubric.
  - **Intermediate:** must be a move that would score **between B+ and C+** (competent but not best).
  - **Beginner:** must be a move that would score **C or lower** (slightly inaccurate / beginner-like, but not an instant blunder).
- Added guidance that “Beginner” moves may include natural-but-imperfect pawn pushes, slow development, or passive ideas, as long as they don’t immediately hang major material or allow forced mate.
- Added explicit requirement that distinct moves across tiers are preferred, and reuse is only allowed in forced-move positions.
- Added an explicit tie-break rule for move selection (checks > captures > centralization > prophylaxis > lexicographically smallest `uci`) to make selections deterministic.

### Changed
- Reframed the section formerly called “Move Selection Heuristics by Difficulty” into “NEXT MOVE SELECTION — GRADED BY DIFFICULTY,” and rewrote each tier’s description to anchor it to the grading rubric instead of vague skill language. This is intended to stop the model from giving three equally strong moves when the user chose Beginner difficulty.
- Strengthened the determinism requirement: “Same position and history = same output, every time.” (This was implicit before; now it is explicit and elevated in priority.)
- Clarified that each suggested move must come from the provided `legalMovesDetailed` or `gameAnalysis.legalMoves`, and that the model must **never invent** a move.
- Clarified that even “Beginner” moves are still required to be legal and not immediately losing a major piece, to avoid outright nonsense replies.
- Clarified that if only SAN moves are provided, `uci` must be set to `null`, keeping the response schema stable.

### Fixed
- Addressed the previous behavior where “beginner,” “intermediate,” and “advanced” suggestions were often all high-quality engine-level ideas. The new grade-band constraints are meant to force visible difficulty separation in gameplay.
- Made explicit that the response must include full reasoning every turn, removing ambiguity that sometimes caused abridged output when it was the AI’s move instead of the user’s move.

### Notes
- **JSON response structure did NOT change.** The object shape (including `position_id`, `side_to_move`, `last_move`, `last_move_grade`, `next_moves.beginner|intermediate|advanced`, `reasoning`, and all fallback/error formats) is unchanged.
- Front-end logic that reads `next_moves.beginner`, `next_moves.intermediate`, and `next_moves.advanced` does not need to be updated.
- The biggest behavioral impact should be:
  - Beginner difficulty will now intentionally play “good but flawed / human-beginner” moves instead of secretly optimal ones.
  - Intermediate will feel human-clubby and safe.
  - Advanced will stay sharp/tactical.
