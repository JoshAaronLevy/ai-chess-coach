# Move Display Enhancement Proposal

## Executive Summary

This proposal outlines a multi-stage approach to improve move display readability in the Coach Feedback modal. Currently, moves are displayed as `f1 → g2(Bxg2)`, which can be confusing for users unfamiliar with chess notation. This proposal introduces human-readable move descriptions while maintaining backward compatibility and keeping all API payloads unchanged.

**Key Principle:** All transformations happen on the frontend. The API payload remains exactly as it is.

---

## Current State Analysis

### What We Have
- `MoveInsights` interface stores: `moveNumber`, `san`, `fromSquare`, `toSquare`, `color`, `insights`
- `MoveInfo` interface contains: `san`, `uci`, `from`, `to`, `piece`, `color`, `captured`, `promotion`, `flags`
- Coach modal displays: `{fromSquare} → {toSquare} ({san})`

### Example Current Display
```
Move: f1 → g2(Bxg2)
```

### Problems
1. **Notation barrier**: Users unfamiliar with SAN (Standard Algebraic Notation) don't understand `Bxg2`
2. **Piece identification**: Single letters (`B`, `N`, `R`, etc.) require chess knowledge
3. **Action clarity**: Captures, castling, and en passant aren't explicitly stated
4. **Missing context**: What piece was captured isn't immediately clear

---

## Proposed Solution: Three-Stage Implementation

### Stage 1: Basic Human-Readable Formatter (Core Feature)
**Goal:** Transform move notation into plain English while maintaining all existing functionality.

#### 1.1 Create Move Description Utility

**New File:** `src/utils/moveDescriptions.ts`

```typescript
import type { PieceType } from '../types/gameLog';

/**
 * Mapping of piece type codes to human-readable names
 */
export const PIECE_NAMES: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

/**
 * Get the piece name with optional article
 */
export function getPieceName(piece: PieceType, withArticle: boolean = false): string {
  const name = PIECE_NAMES[piece];
  if (!withArticle) return name;
  
  // Use "a" for all except "an" for special cases if any
  return `a ${name}`;
}

/**
 * Format a move into a human-readable description
 */
export interface MoveDescriptionOptions {
  piece: PieceType;
  from: string;
  to: string;
  captured?: PieceType;
  promotion?: PieceType;
  flags?: string;
  san?: string;
}

export function describeMoveHuman(options: MoveDescriptionOptions): string {
  const { piece, from, to, captured, promotion, flags, san } = options;
  
  // Get piece name
  const pieceName = PIECE_NAMES[piece];
  
  // Check for special moves from flags or SAN
  const isCastling = flags?.includes('k') || flags?.includes('q') || 
                     san === 'O-O' || san === 'O-O-O';
  const isEnPassant = flags?.includes('e');
  
  // Handle castling
  if (isCastling) {
    if (san === 'O-O' || flags?.includes('k')) {
      return 'Castled kingside';
    } else if (san === 'O-O-O' || flags?.includes('q')) {
      return 'Castled queenside';
    }
  }
  
  // Base move description
  let description = `${pieceName} moved from ${from.toUpperCase()} to ${to.toUpperCase()}`;
  
  // Add capture information
  if (captured) {
    const capturedName = PIECE_NAMES[captured];
    if (isEnPassant) {
      description += `. Captured ${capturedName} en passant`;
    } else {
      description += `. Captured ${capturedName}`;
    }
  }
  
  // Add promotion information
  if (promotion) {
    const promotionName = PIECE_NAMES[promotion];
    description += `. Promoted to ${promotionName}`;
  }
  
  return description;
}

/**
 * Format move for display with both human description and notation
 */
export function formatMoveDisplay(options: MoveDescriptionOptions): {
  humanReadable: string;
  notation: string;
} {
  const humanReadable = describeMoveHuman(options);
  const notation = options.san || `${options.from}-${options.to}`;
  
  return {
    humanReadable,
    notation,
  };
}
```

#### 1.2 Update CoachModalContent Component

**File:** `src/app/components/modals/CoachModalContent.tsx`

Update the move display section to use the new formatter:

```tsx
import { describeMoveHuman } from '../../../utils/moveDescriptions';

// Inside the AccordionTab content:
<div className="p-3" style={{ backgroundColor: '#ffffff', color: '#000000' }}>
  {/* Human-readable move description */}
  <div className="mb-3">
    <span className="font-medium">Move: </span>
    <div className="text-700 mt-1">
      {describeMoveHuman({
        piece: moveInsight.insights.lastMove?.piece || 'p', // fallback
        from: moveInsight.fromSquare,
        to: moveInsight.toSquare,
        captured: moveInsight.insights.lastMove?.captured,
        promotion: moveInsight.insights.lastMove?.promotion,
        flags: moveInsight.insights.lastMove?.flags,
        san: moveInsight.san,
      })}
    </div>
    <div className="text-500 text-sm mt-1">
      Notation: {moveInsight.san} ({moveInsight.fromSquare} → {moveInsight.toSquare})
    </div>
  </div>
  
  {/* Rest of the content... */}
</div>
```

#### 1.3 Extend MoveInsights Type (Optional Enhancement)

**File:** `src/types/chess.ts`

Add captured/promotion data if not already tracked in insights:

```typescript
export interface MoveInsights {
  moveNumber: number;
  san: string;
  fromSquare: string;
  toSquare: string;
  color: Color;
  // Add these if not present in insights
  piece?: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  flags?: string;
  insights: TutorInsights;
  timestamp: number;
}
```

**Note:** Review where `MoveInsights` is created (likely in `useChess.ts`) to ensure we're passing through piece, captured, promotion, and flags data from the move object.

#### 1.4 Implementation Checklist

- [ ] Create `src/utils/moveDescriptions.ts` with piece name mappings and formatter
- [ ] Add unit tests for `describeMoveHuman()` function
- [ ] Update `MoveInsights` type to include piece metadata (if needed)
- [ ] Update move insights creation logic to capture piece, captured, promotion, flags
- [ ] Update `CoachModalContent.tsx` to use new formatter
- [ ] Test with various move types: normal moves, captures, castling, en passant, promotions
- [ ] Verify accessibility with screen readers

**Expected Result:**
```
Move: Bishop moved from F1 to G2. Captured Queen
Notation: Bxg2 (f1 → g2)
```

---

### Stage 2: Enhanced Visualization with Icons/Symbols
**Goal:** Add visual indicators to complement text descriptions.

#### 2.1 Add Chess Piece Unicode Symbols

Update `moveDescriptions.ts`:

```typescript
/**
 * Unicode chess piece symbols
 */
export const PIECE_SYMBOLS: Record<PieceType, { white: string; black: string }> = {
  k: { white: '♔', black: '♚' },
  q: { white: '♕', black: '♛' },
  r: { white: '♖', black: '♜' },
  b: { white: '♗', black: '♝' },
  n: { white: '♘', black: '♞' },
  p: { white: '♙', black: '♟' },
};

/**
 * Get piece symbol based on color
 */
export function getPieceSymbol(piece: PieceType, color: 'w' | 'b'): string {
  return color === 'w' ? PIECE_SYMBOLS[piece].white : PIECE_SYMBOLS[piece].black;
}

/**
 * Format move with visual symbols
 */
export function describeMoveWithSymbols(options: MoveDescriptionOptions & { color: 'w' | 'b' }): {
  symbol: string;
  description: string;
} {
  const { piece, color } = options;
  const symbol = getPieceSymbol(piece, color);
  const description = describeMoveHuman(options);
  
  return { symbol, description };
}
```

#### 2.2 Update Coach Modal Display

```tsx
<div className="mb-3">
  <div className="flex align-items-start gap-2">
    <span className="text-3xl" style={{ lineHeight: 1 }}>
      {getPieceSymbol(moveInsight.piece, moveInsight.color)}
    </span>
    <div className="flex-1">
      <span className="font-medium">Move: </span>
      <div className="text-700 mt-1">
        {describeMoveHuman({...})}
      </div>
      <div className="text-500 text-sm mt-1">
        Notation: {moveInsight.san}
      </div>
    </div>
  </div>
</div>
```

#### 2.3 Implementation Checklist

- [ ] Add piece symbol mappings to `moveDescriptions.ts`
- [ ] Create `describeMoveWithSymbols()` function
- [ ] Update `CoachModalContent.tsx` to display symbols
- [ ] Test symbol rendering across different browsers/devices
- [ ] Ensure symbols work with dark/light themes
- [ ] Verify symbol accessibility (aria-labels)

**Expected Result:**
```
♗  Move: Bishop moved from F1 to G2. Captured Queen
   Notation: Bxg2
```

---

### Stage 3: Advanced Features (Optional Enhancements)
**Goal:** Add contextual information and user preferences.

#### 3.1 Move Context Indicators

Add badges/chips to highlight move characteristics:

```tsx
/**
 * Get move characteristics for display
 */
export function getMoveCharacteristics(options: MoveDescriptionOptions): string[] {
  const characteristics: string[] = [];
  
  if (options.captured) {
    characteristics.push('Capture');
  }
  
  if (options.promotion) {
    characteristics.push('Promotion');
  }
  
  if (options.flags?.includes('k') || options.flags?.includes('q')) {
    characteristics.push('Castling');
  }
  
  if (options.flags?.includes('e')) {
    characteristics.push('En Passant');
  }
  
  if (options.san?.includes('+')) {
    characteristics.push('Check');
  }
  
  if (options.san?.includes('#')) {
    characteristics.push('Checkmate');
  }
  
  return characteristics;
}
```

Display in modal:

```tsx
<div className="flex gap-2 mt-2 flex-wrap">
  {getMoveCharacteristics({...}).map(char => (
    <span 
      key={char}
      className="px-2 py-1 border-round text-xs font-semibold"
      style={{ 
        backgroundColor: '#e3f2fd', 
        color: '#1976d2' 
      }}
    >
      {char}
    </span>
  ))}
</div>
```

#### 3.2 User Preference Toggle

Add a toggle to switch between human-readable and notation-only display:

```tsx
// Add state to CoachModalContent
const [showHumanReadable, setShowHumanReadable] = useState(true);

// Add toggle button in modal header or footer
<Button
  icon={showHumanReadable ? "pi pi-eye" : "pi pi-code"}
  label={showHumanReadable ? "Show Notation" : "Show Description"}
  size="small"
  text
  onClick={() => setShowHumanReadable(!showHumanReadable)}
/>

// Conditional rendering
{showHumanReadable ? (
  <div>{describeMoveHuman({...})}</div>
) : (
  <div>{moveInsight.san}</div>
)}
```

Store preference in localStorage for persistence.

#### 3.3 Tooltips for Notation Education

Add tooltips that explain chess notation when hovering over SAN:

```tsx
<span 
  className="text-500 text-sm cursor-pointer"
  title="Standard Algebraic Notation (SAN): B=Bishop, x=captures, g2=destination square"
>
  Notation: {moveInsight.san} 
  <i className="pi pi-question-circle ml-1 text-xs" />
</span>
```

Or use PrimeReact Tooltip:

```tsx
<Tooltip target=".notation-help" position="top">
  <div className="text-sm">
    <strong>Chess Notation Guide:</strong><br/>
    • Letters indicate pieces (B=Bishop, N=Knight, etc.)<br/>
    • 'x' means capture<br/>
    • '+' means check<br/>
    • '#' means checkmate
  </div>
</Tooltip>
```

#### 3.4 Implementation Checklist

- [ ] Implement `getMoveCharacteristics()` function
- [ ] Add characteristic badges/chips to modal
- [ ] Create user preference toggle component
- [ ] Add localStorage persistence for display preference
- [ ] Implement tooltips with notation education
- [ ] Add "Learn More" link to chess notation resources
- [ ] Conduct user testing for preference discovery

**Expected Result:**
```
♗  Move: Bishop moved from F1 to G2. Captured Queen
   [Capture] [Check]
   Notation: Bxg2+ (?)
   
   [Toggle: Show Notation Only]
```

---

## Implementation Roadmap

### Phase 1: Stage 1 (Core - Required)
**Effort:** ~2-3 hours  
**Priority:** High  
**Dependencies:** None  

**Deliverables:**
- `moveDescriptions.ts` utility
- Updated `CoachModalContent.tsx`
- Unit tests for move descriptions
- Documentation

### Phase 2: Stage 2 (Enhanced - Recommended)
**Effort:** ~1-2 hours  
**Priority:** Medium  
**Dependencies:** Stage 1 complete  

**Deliverables:**
- Piece symbol support
- Visual enhancements
- Browser compatibility testing

### Phase 3: Stage 3 (Advanced - Optional)
**Effort:** ~3-4 hours  
**Priority:** Low  
**Dependencies:** Stage 2 complete  

**Deliverables:**
- Move characteristic badges
- User preference system
- Educational tooltips
- User testing and refinement

---

## Data Flow & Architecture

### Current Flow (Unchanged)
```
Chess.js → useChess → MoveInsights → CoachModalContent → Display
                                                               ↓
                                                          f1 → g2(Bxg2)
```

### Proposed Flow (Stage 1)
```
Chess.js → useChess → MoveInsights → moveDescriptions.ts → CoachModalContent → Display
                                           ↓                                      ↓
                                   describeMoveHuman()            "Bishop moved from F1 to G2"
```

**Key Point:** All transformation happens in the view layer (`CoachModalContent.tsx` and `moveDescriptions.ts`). No changes to:
- API payload structure
- `useChess` hook logic (except potentially enriching `MoveInsights` with existing data)
- Backend/Dify configuration
- Game engine logic

---

## Testing Strategy

### Unit Tests
```typescript
// src/utils/moveDescriptions.test.ts

describe('describeMoveHuman', () => {
  it('should describe a normal move', () => {
    expect(describeMoveHuman({
      piece: 'n',
      from: 'g1',
      to: 'f3',
    })).toBe('Knight moved from G1 to F3');
  });
  
  it('should describe a capture', () => {
    expect(describeMoveHuman({
      piece: 'b',
      from: 'f1',
      to: 'g2',
      captured: 'q',
    })).toBe('Bishop moved from F1 to G2. Captured Queen');
  });
  
  it('should describe kingside castling', () => {
    expect(describeMoveHuman({
      piece: 'k',
      from: 'e1',
      to: 'g1',
      flags: 'k',
      san: 'O-O',
    })).toBe('Castled kingside');
  });
  
  it('should describe a promotion', () => {
    expect(describeMoveHuman({
      piece: 'p',
      from: 'e7',
      to: 'e8',
      promotion: 'q',
    })).toBe('Pawn moved from E7 to E8. Promoted to Queen');
  });
  
  it('should describe en passant', () => {
    expect(describeMoveHuman({
      piece: 'p',
      from: 'd5',
      to: 'e6',
      captured: 'p',
      flags: 'e',
    })).toBe('Pawn moved from D5 to E6. Captured Pawn en passant');
  });
});
```

### Integration Tests
- Test modal rendering with various move types
- Verify move history displays correctly
- Test with AI moves vs user moves
- Validate accessibility with screen readers

### Manual Testing Checklist
- [ ] Normal piece moves (all piece types)
- [ ] Captures (all piece types)
- [ ] Castling (kingside and queenside)
- [ ] En passant captures
- [ ] Pawn promotions (all promotion options)
- [ ] Moves that give check
- [ ] Checkmate moves
- [ ] Edge case: moves from/to same square (shouldn't happen)
- [ ] Long move history (20+ moves)
- [ ] Mobile device rendering
- [ ] Accessibility (keyboard navigation, screen readers)

---

## Accessibility Considerations

### ARIA Labels
```tsx
<div 
  className="move-description"
  role="text"
  aria-label={describeMoveHuman({...})}
>
  {/* Visual content */}
</div>
```

### Semantic HTML
- Use appropriate heading levels (`<h3>`, `<h4>`)
- Maintain logical content structure
- Ensure keyboard navigation works

### Screen Reader Testing
- Test with NVDA (Windows)
- Test with VoiceOver (macOS/iOS)
- Verify move descriptions are read clearly

---

## Potential Challenges & Solutions

### Challenge 1: Missing Move Metadata
**Problem:** `MoveInsights` might not have all necessary data (piece type, captured piece, flags).

**Solution:** 
1. **Option A (Recommended):** Enrich `MoveInsights` when it's created in `useChess.ts` by passing through data from the move object already available.
2. **Option B:** Store the full `MoveInfo` object in `MoveInsights` for complete access.
3. **Option C:** Parse SAN notation to extract information (more complex, less reliable).

**Code for Option A:**
```typescript
// In useChess.ts where MoveInsights is created
const moveInsight: MoveInsights = {
  moveNumber: game.moveNumber(),
  san: lastMove.san,
  fromSquare: lastMove.from,
  toSquare: lastMove.to,
  color: game.turn() === 'w' ? 'b' : 'w', // last move was by opposite color
  piece: lastMove.piece,        // ADD THIS
  captured: lastMove.captured,   // ADD THIS
  promotion: lastMove.promotion, // ADD THIS
  flags: lastMove.flags,         // ADD THIS
  insights: parsedInsights,
  timestamp: Date.now(),
};
```

### Challenge 2: Backward Compatibility
**Problem:** Existing game logs might not have enriched move data.

**Solution:**
- Implement graceful fallbacks
- If piece data is missing, fall back to SAN notation only
- Add migration logic if needed for stored game data

```typescript
export function describeMoveHuman(options: MoveDescriptionOptions): string {
  // Fallback if essential data is missing
  if (!options.piece || !options.from || !options.to) {
    return options.san || 'Move made';
  }
  
  // Normal processing...
}
```

### Challenge 3: Performance with Long Move Histories
**Problem:** Formatting many moves could impact render performance.

**Solution:**
- Memoize formatting function
- Use React.memo for move list items
- Consider virtualization for very long histories (50+ moves)

```typescript
const memoizedDescription = useMemo(
  () => describeMoveHuman({...}),
  [moveInsight.san, moveInsight.fromSquare, moveInsight.toSquare]
);
```

---

## Alternative Approaches Considered

### Alternative 1: Parse SAN Notation
**Approach:** Extract information from SAN string (e.g., parse "Bxg2" to get piece, capture, destination).

**Pros:**
- No need to enrich `MoveInsights` with additional data
- Works with existing data structure

**Cons:**
- Complex regex patterns needed
- Error-prone (SAN has many edge cases)
- Doesn't provide source square or captured piece type
- Harder to maintain

**Decision:** Rejected in favor of passing through existing move metadata.

### Alternative 2: API Response Enhancement
**Approach:** Have the Dify API return human-readable move descriptions.

**Pros:**
- Single source of truth
- Could leverage LLM for creative descriptions

**Cons:**
- **Breaks requirement:** API payload must not change
- Increases API response size
- Adds latency
- Makes frontend dependent on backend for display logic
- Harder to localize (i18n)

**Decision:** Rejected per requirements.

### Alternative 3: Chess.js Verbose Mode Parsing
**Approach:** Always store full verbose move objects from chess.js.

**Pros:**
- Complete move information available
- No additional parsing needed

**Cons:**
- Larger data structures
- More memory usage for move history
- Overkill for current needs

**Decision:** Partial adoption - use verbose data when creating insights, but store only what's needed.

---

## Future Enhancements (Beyond Scope)

### Internationalization (i18n)
Support multiple languages for move descriptions:

```typescript
export const PIECE_NAMES_I18N = {
  en: { p: 'Pawn', n: 'Knight', /* ... */ },
  es: { p: 'Peón', n: 'Caballo', /* ... */ },
  fr: { p: 'Pion', n: 'Cavalier', /* ... */ },
};

export function describeMoveHuman(
  options: MoveDescriptionOptions,
  locale: string = 'en'
): string {
  // Use locale-specific names
}
```

### Move Animation Replay
Add a "Show Move" button that highlights the move on the board:

```tsx
<Button
  label="Show on Board"
  icon="pi pi-eye"
  size="small"
  onClick={() => highlightMove(moveInsight.fromSquare, moveInsight.toSquare)}
/>
```

### Voice Descriptions
Generate audio descriptions of moves for accessibility:

```typescript
export function speakMove(description: string): void {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(description);
    speechSynthesis.speak(utterance);
  }
}
```

### Contextual Help System
Detect when users seem confused (e.g., repeatedly viewing same move) and offer notation tutorial.

---

## Success Metrics

### Quantitative
- Time to understand move history: Target <5 seconds per move
- Support ticket reduction: Target 30% decrease in notation-related questions
- User preference adoption: Track % using human-readable vs notation-only

### Qualitative
- User feedback: "Much easier to understand"
- Accessibility: Screen reader users can navigate move history
- Learning: New players learn chess notation through exposure

---

## Migration & Rollout Plan

### Development
1. Implement Stage 1 on feature branch
2. Unit test coverage >90%
3. Integration tests for all move types
4. Code review

### Staging
1. Deploy to staging environment
2. QA testing with test scenarios
3. Accessibility audit
4. Performance benchmarking

### Production
1. Feature flag deployment (optional)
2. Gradual rollout to 10% → 50% → 100% users
3. Monitor error rates and user feedback
4. Hotfix readiness

### Rollback Plan
If issues arise:
1. Disable feature flag (if used)
2. Revert to previous display format
3. Fix issues in development
4. Re-deploy with fixes

---

## Cost-Benefit Analysis

### Benefits
- **Improved UX:** Beginners can understand move history without learning notation
- **Accessibility:** Screen readers can convey move information clearly
- **Educational:** Users gradually learn chess notation through exposure
- **Retention:** Lower barrier to entry keeps new users engaged
- **Reduced Support:** Fewer questions about notation meanings

### Costs
- **Development Time:** ~6-9 hours total (all stages)
- **Maintenance:** Minimal - utility functions are straightforward
- **Testing Time:** ~3-4 hours for comprehensive coverage
- **Bundle Size:** +1-2KB (negligible)
- **Performance:** <1ms per move formatting (negligible)

### ROI
High value for low cost. Stage 1 alone provides significant UX improvement for ~2-3 hours of work.

---

## Appendix A: Code Examples

### Full Example: Basic Implementation

```typescript
// src/utils/moveDescriptions.ts
import type { PieceType } from '../types/gameLog';

export const PIECE_NAMES: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

export interface MoveDescriptionOptions {
  piece: PieceType;
  from: string;
  to: string;
  captured?: PieceType;
  promotion?: PieceType;
  flags?: string;
  san?: string;
}

export function describeMoveHuman(options: MoveDescriptionOptions): string {
  const { piece, from, to, captured, promotion, flags, san } = options;
  
  const pieceName = PIECE_NAMES[piece];
  const isCastling = flags?.includes('k') || flags?.includes('q') || 
                     san === 'O-O' || san === 'O-O-O';
  const isEnPassant = flags?.includes('e');
  
  if (isCastling) {
    if (san === 'O-O' || flags?.includes('k')) {
      return 'Castled kingside';
    } else if (san === 'O-O-O' || flags?.includes('q')) {
      return 'Castled queenside';
    }
  }
  
  let description = `${pieceName} moved from ${from.toUpperCase()} to ${to.toUpperCase()}`;
  
  if (captured) {
    const capturedName = PIECE_NAMES[captured];
    if (isEnPassant) {
      description += `. Captured ${capturedName} en passant`;
    } else {
      description += `. Captured ${capturedName}`;
    }
  }
  
  if (promotion) {
    const promotionName = PIECE_NAMES[promotion];
    description += `. Promoted to ${promotionName}`;
  }
  
  return description;
}
```

### Full Example: Component Usage

```tsx
// In CoachModalContent.tsx
import { describeMoveHuman } from '../../../utils/moveDescriptions';

// Inside render:
<div className="mb-3">
  <span className="font-medium">Move: </span>
  <div className="text-700 line-height-3 mt-1">
    {moveInsight.piece ? (
      describeMoveHuman({
        piece: moveInsight.piece,
        from: moveInsight.fromSquare,
        to: moveInsight.toSquare,
        captured: moveInsight.captured,
        promotion: moveInsight.promotion,
        flags: moveInsight.flags,
        san: moveInsight.san,
      })
    ) : (
      // Fallback for old data without piece info
      `${moveInsight.fromSquare} → ${moveInsight.toSquare} (${moveInsight.san})`
    )}
  </div>
  <div className="text-500 text-sm mt-1">
    Notation: {moveInsight.san}
  </div>
</div>
```

---

## Appendix B: Test Scenarios

### Test Case Matrix

| Move Type | From | To | Piece | Captured | Promotion | Flags | SAN | Expected Output |
|-----------|------|-----|-------|----------|-----------|-------|-----|-----------------|
| Normal move | e2 | e4 | p | - | - | n | e4 | "Pawn moved from E2 to E4" |
| Capture | f1 | g2 | b | q | - | c | Bxg2 | "Bishop moved from F1 to G2. Captured Queen" |
| Kingside castle | e1 | g1 | k | - | - | k | O-O | "Castled kingside" |
| Queenside castle | e8 | c8 | k | - | - | q | O-O-O | "Castled queenside" |
| Promotion | e7 | e8 | p | - | q | - | e8=Q | "Pawn moved from E7 to E8. Promoted to Queen" |
| Promotion + capture | d7 | e8 | p | r | q | c | dxe8=Q | "Pawn moved from D7 to E8. Captured Rook. Promoted to Queen" |
| En passant | d5 | e6 | p | p | - | e | dxe6 | "Pawn moved from D5 to E6. Captured Pawn en passant" |
| Check | f3 | g5 | n | - | - | n | Ng5+ | "Knight moved from F3 to G5" (+ shown separately) |
| Checkmate | g5 | f7 | n | - | - | n | Nf7# | "Knight moved from G5 to F7" (# shown separately) |

---

## Appendix C: API Payload Confirmation

### Current Payload Structure (No Changes)

```json
{
  "boardState": {
    "pieces": [...],
    "fen": "...",
    "turn": "b",
    "moveNumber": 4,
    ...
  },
  "lastMove": {
    "san": "Bxg2",
    "uci": "f1g2",
    "from": "f1",
    "to": "g2",
    "piece": "b",
    "color": "w",
    "captured": "q",
    "flags": "c"
  },
  ...
}
```

**Confirmation:** This payload structure remains 100% unchanged. All formatting happens on the frontend after the API response is received.

---

## Appendix D: Accessibility Audit Checklist

- [ ] All move descriptions are accessible via screen reader
- [ ] Keyboard navigation works for all interactive elements
- [ ] Color contrast ratios meet WCAG AA standards
- [ ] Focus indicators are visible
- [ ] ARIA labels are present and accurate
- [ ] Semantic HTML structure is maintained
- [ ] No information is conveyed by color alone
- [ ] Text is resizable up to 200% without loss of functionality
- [ ] Move descriptions work without JavaScript (progressive enhancement)

---

## Clarifications Received

### 1. Data Availability ✅
**Current State:** 
- The `move` object from chess.js contains: `san`, `from`, `to`, `piece`, `color`, `captured`, `promotion`, `flags`
- The `MoveInsights` interface currently stores: `moveNumber`, `san`, `fromSquare`, `toSquare`, `color`, `insights`, `timestamp`
- **Missing in MoveInsights:** `piece`, `captured`, `promotion`, `flags`

**Solution:** We need to enrich `MoveInsights` by adding these fields. The data is already available from the `move` object when creating insights, we just need to pass it through.

**Implementation Note:** This requires a small update to the `MoveInsights` type definition and the three places where `MoveInsights` objects are created in `useChess.ts` (lines 272, 571, and 643).

### 2. Implementation Scope ✅
**Answer:** All three stages, implemented sequentially with manual testing between each stage.

**Revised Approach:**
- **First:** Implement Stage 1, test thoroughly
- **Then:** Implement Stage 2, test thoroughly  
- **Finally:** Implement Stage 3, test thoroughly

### 3. Display Format ✅
**Answer:** Human-readable should be the default format.

**Impact:** The primary display will show the human-readable description. Chess notation will be secondary/supplementary.

### 4. Move Suggestions Display ✅
**Answer:** Yes, apply human-readable format to move suggestions in the hint panel (`HintModal.tsx`).

**Scope Expansion:** This adds formatting to:
- Coach feedback modal (main implementation)
- Hint modal best move display
- Hint modal alternative moves display
- Move suggestions accordion (beginner/intermediate/advanced)

### 5. Backward Compatibility ✅
**Answer:** Not needed.

**Impact:** We can freely modify the `MoveInsights` interface without migration logic. Simpler implementation, no fallback code needed.

---

## Revised Implementation Plan

### Stage 1: Foundation (IMPLEMENT FIRST)

**Tasks:**
1. **Update Type Definition** (`src/types/chess.ts`)
   - Add `piece`, `captured`, `promotion`, `flags` to `MoveInsights` interface

2. **Create Utility Module** (`src/utils/moveDescriptions.ts`)
   - Implement `PIECE_NAMES` mapping
   - Implement `describeMoveHuman()` function
   - Add comprehensive unit tests

3. **Enrich Move Insights** (`src/chess/useChess.ts`)
   - Update all three `MoveInsights` creation points to include new fields:
     - Line ~272: User move insights
     - Line ~571: AI move insights  
     - Line ~643: Retry move insights

4. **Update Coach Modal** (`src/app/components/modals/CoachModalContent.tsx`)
   - Replace current move display with human-readable format
   - Show notation as secondary information
   - Update move suggestions accordion (beginner/intermediate/advanced)

5. **Update Hint Modal** (`src/coach/HintModal.tsx`)
   - Format best move display
   - Format alternative moves display

**Test Before Moving to Stage 2:**
- All move types display correctly
- Move suggestions are human-readable
- No crashes with missing data
- Console has no errors

### Stage 2: Visual Enhancement (IMPLEMENT SECOND)

**Tasks:**
1. Add `PIECE_SYMBOLS` and `getPieceSymbol()` to utility module
2. Update both modals to display piece symbols alongside descriptions
3. Ensure symbols render correctly across browsers
4. Test accessibility with screen readers

**Test Before Moving to Stage 3:**
- Symbols display correctly for all piece types
- Both colors (white/black) show correct symbols
- Mobile rendering looks good
- Accessibility is maintained

### Stage 3: Advanced Features (IMPLEMENT THIRD)

**Tasks:**
1. Implement `getMoveCharacteristics()` function
2. Add characteristic badges to coach modal
3. Implement user preference toggle with localStorage
4. Add educational tooltips
5. Conduct thorough testing

**Final Testing:**
- All features work together seamlessly
- User preferences persist
- Tooltips are helpful and accurate
- Overall UX is polished

---

## Recommended Next Steps

**To proceed with Stage 1 implementation, simply say:**

> **"Proceed with Stage 1"**

I will then:
1. ✅ Update `MoveInsights` type definition
2. ✅ Create the `moveDescriptions.ts` utility with full implementation
3. ✅ Update all three `MoveInsights` creation points in `useChess.ts`
4. ✅ Update `CoachModalContent.tsx` to use human-readable format
5. ✅ Update `HintModal.tsx` to use human-readable format
6. ✅ Create comprehensive unit tests
7. ✅ Provide testing instructions

After Stage 1 is complete and tested, you can say **"Proceed with Stage 2"**, and then **"Proceed with Stage 3"**.

---

## Summary of Changes

### Files to be Modified (Stage 1):
- `src/types/chess.ts` - Add fields to `MoveInsights`
- `src/utils/moveDescriptions.ts` - **NEW FILE** - Core utility
- `src/utils/moveDescriptions.test.ts` - **NEW FILE** - Unit tests
- `src/chess/useChess.ts` - Enrich move insights (3 locations)
- `src/app/components/modals/CoachModalContent.tsx` - Update display
- `src/coach/HintModal.tsx` - Update display

### API Changes:
**None.** All changes are frontend-only. The API request/response structure remains completely unchanged.

---

## Conclusion

This proposal provides a clear, phased approach to improving move display readability. With your clarifications, we can proceed confidently without concerns about backward compatibility or data availability.

**Stage 1** will deliver immediate, significant value by making moves understandable to all users.  
**Stage 2** adds visual polish with chess symbols.  
**Stage 3** provides advanced features and customization.

**Ready to begin?** Just say "Proceed with Stage 1" and I'll start implementation!

---

**Document Version:** 2.0  
**Created:** November 1, 2025  
**Updated:** November 1, 2025 (after clarifications)  
**Author:** AI Chess Coach Development Team  
**Status:** Ready for Implementation
