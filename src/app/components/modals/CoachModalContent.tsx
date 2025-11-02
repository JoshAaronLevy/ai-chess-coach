import React, { useState, useEffect } from 'react';
import { Divider } from 'primereact/divider';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'primereact/button';
import type { TutorInsights } from '../../../utils/difyParser';
import type { MoveInsights } from '../../../types/chess';
import { HintModal } from '../../../coach/HintModal';
import { 
  describeMoveWithSymbols, 
  getMoveCharacteristics 
} from '../../../utils/moveDescriptions';
import { Tooltip } from 'primereact/tooltip';

interface CoachModalContentProps {
  lastSan?: string;
  lastMoveFrom?: string;
  lastMoveTo?: string;
  gameOver?: boolean;
  gameResult?: string;
  // Coach insights props
  insights: TutorInsights | null;
  insightsHistory?: MoveInsights[];
  hasNewInsights: boolean;
  isLoadingInsights: boolean;
  onMarkInsightsViewed: () => void;
}

export const CoachModalContent: React.FC<CoachModalContentProps> = ({
  gameOver,
  gameResult,
  insights,
  insightsHistory,
  hasNewInsights,
  isLoadingInsights,
  onMarkInsightsViewed
}) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hasViewedPanel, setHasViewedPanel] = useState(false);
  const [showHintModal, setShowHintModal] = useState(false);

  // Mark insights as viewed when panel is viewed
  useEffect(() => {
    if (hasNewInsights && !hasViewedPanel && insights) {
      const timer = setTimeout(() => {
        setHasViewedPanel(true);
        onMarkInsightsViewed();
      }, 1000); // Mark as viewed after 1 second of viewing

      return () => clearTimeout(timer);
    }
  }, [hasNewInsights, hasViewedPanel, insights, onMarkInsightsViewed]);

  // Reset viewed state when new insights arrive
  useEffect(() => {
    if (hasNewInsights) {
      setHasViewedPanel(false);
    }
  }, [hasNewInsights]);

  // Helper function to render move suggestions for a specific move
  const renderMoveSuggestions = (moveInsights: TutorInsights) => {
    if (!moveInsights.next_moves ||
        !(moveInsights.next_moves.beginner?.uci || moveInsights.next_moves.beginner?.san ||
          moveInsights.next_moves.intermediate?.uci || moveInsights.next_moves.intermediate?.san ||
          moveInsights.next_moves.advanced?.uci || moveInsights.next_moves.advanced?.san)) {
      return null;
    }

    return (
      <Accordion className="w-full mt-3">
        <AccordionTab
          header={
            <div className="flex align-items-center gap-2">
              <i className="pi pi-lightbulb text-primary" />
              <span className="font-medium">See Move Suggestions</span>
            </div>
          }
        >
          <div className="text-700 line-height-3 p-2" style={{ backgroundColor: '#ffffff', color: '#000000' }}>
            <div className="flex flex-column gap-3">
              {moveInsights.next_moves.advanced?.uci || moveInsights.next_moves.advanced?.san ? (
                <div>
                  <div className="mb-1">
                    <span className="font-semibold text-800">Advanced: </span>
                    <span className="font-bold text-900">
                      {moveInsights.next_moves.advanced.san || moveInsights.next_moves.advanced.uci}
                    </span>
                  </div>
                  {moveInsights.next_moves.advanced.why && (
                    <div className="text-600 text-sm ml-3">
                      {moveInsights.next_moves.advanced.why}
                    </div>
                  )}
                </div>
              ) : null}
              
              {moveInsights.next_moves.intermediate?.uci || moveInsights.next_moves.intermediate?.san ? (
                <div>
                  <div className="mb-1">
                    <span className="font-semibold text-800">Intermediate: </span>
                    <span className="font-bold text-900">
                      {moveInsights.next_moves.intermediate.san || moveInsights.next_moves.intermediate.uci}
                    </span>
                  </div>
                  {moveInsights.next_moves.intermediate.why && (
                    <div className="text-600 text-sm ml-3">
                      {moveInsights.next_moves.intermediate.why}
                    </div>
                  )}
                </div>
              ) : null}
              
              {moveInsights.next_moves.beginner?.uci || moveInsights.next_moves.beginner?.san ? (
                <div>
                  <div className="mb-1">
                    <span className="font-semibold text-800">Beginner: </span>
                    <span className="font-bold text-900">
                      {moveInsights.next_moves.beginner.san || moveInsights.next_moves.beginner.uci}
                    </span>
                  </div>
                  {moveInsights.next_moves.beginner.why && (
                    <div className="text-600 text-sm ml-3">
                      {moveInsights.next_moves.beginner.why}
                    </div>
                  )}
                </div>
              ) : null}
              
              {moveInsights.next_moves.reasoning && (
                <div className="mt-2 pt-2 border-top-1 surface-border">
                  <div className="text-700 text-sm">
                    <i className="pi pi-info-circle mr-2" />
                    {moveInsights.next_moves.reasoning}
                  </div>
                </div>
              )}
            </div>
          </div>
        </AccordionTab>
      </Accordion>
    );
  };

  return (
    <div className="flex flex-column gap-3">
      {/* Loading State */}
      {isLoadingInsights && (
        <div
          className="flex align-items-center justify-content-center p-4"
          role="status"
          aria-live="polite"
          aria-label="Analyzing your move"
        >
          <ProgressSpinner
            style={{ width: '32px', height: '32px' }}
            strokeWidth="4"
            aria-hidden="true"
          />
          <span className="ml-2 text-600">Analyzing move...</span>
        </div>
      )}

      {/* Move History Accordion */}
      {!isLoadingInsights && (
        <>
          {insightsHistory && insightsHistory.length > 0 ? (
            <Accordion
              activeIndex={activeIndex}
              onTabChange={(e) => setActiveIndex(e.index as number)}
              className="w-full"
            >
              {insightsHistory.slice().reverse().map((moveInsight) => {
                const moveNumber = moveInsight.moveNumber;
                const grade = moveInsight.insights.lastMove?.grade || '';
                const isWhiteMove = moveInsight.color === 'w'; // 'w' = white/user, 'b' = black/AI
                
                // Header styling: light theme for user (white), dark theme for AI (black)
                const headerStyle = {
                  backgroundColor: isWhiteMove ? '#f8f9fa' : '#2d2d2d',
                  color: isWhiteMove ? '#000000' : '#ffffff',
                };
                
                return (
                  <AccordionTab
                    key={moveInsight.timestamp}
                    header={`Move ${moveNumber} - ${grade} ${isWhiteMove ? '(User)' : '(AI)'}`}
                    headerClassName="font-semibold"
                    headerStyle={headerStyle}
                  >
                    <div className="p-3" style={{ backgroundColor: '#ffffff', color: '#000000' }}>
                      {/* Human-readable move description */}
                      <div className="mb-3">
                        <div className="flex align-items-center justify-content-between mb-2">
                          <span className="font-medium">Move: </span>
                        </div>
                        <div className="text-700 mt-1">
                          {describeMoveWithSymbols({
                            piece: moveInsight.piece,
                            from: moveInsight.fromSquare,
                            to: moveInsight.toSquare,
                            captured: moveInsight.captured,
                            promotion: moveInsight.promotion,
                            flags: moveInsight.flags,
                            san: moveInsight.san,
                          })}
                        </div>
                        
                        {/* Move characteristic badges */}
                        {getMoveCharacteristics({
                          piece: moveInsight.piece,
                          from: moveInsight.fromSquare,
                          to: moveInsight.toSquare,
                          captured: moveInsight.captured,
                          promotion: moveInsight.promotion,
                          flags: moveInsight.flags,
                          san: moveInsight.san,
                        }).length > 0 && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {getMoveCharacteristics({
                              piece: moveInsight.piece,
                              from: moveInsight.fromSquare,
                              to: moveInsight.toSquare,
                              captured: moveInsight.captured,
                              promotion: moveInsight.promotion,
                              flags: moveInsight.flags,
                              san: moveInsight.san,
                            }).map(char => (
                              <span
                                key={char}
                                className={`notation-badge-${char.toLowerCase().replace(' ', '-')}`}
                                style={{
                                  display: 'inline-block',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.75rem',
                                  fontWeight: '600',
                                  backgroundColor: '#e3f2fd',
                                  color: '#1976d2',
                                }}
                              >
                                {char}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        <div className="text-500 text-sm mt-2">
                          <span className="notation-help" style={{ cursor: 'help' }}>
                            Notation: {moveInsight.san} 
                            <i className="pi pi-question-circle ml-1 text-xs" />
                          </span>
                        </div>
                      </div>
                      
                      {/* Full explanation */}
                      <div className="mb-3">
                        <span className="font-medium">Explanation: </span>
                        <div className="text-700 line-height-3 mt-1">
                          {moveInsight.insights.lastMove?.explanation || 'No explanation provided'}
                        </div>
                      </div>
                      
                      {/* Move suggestions for this specific move */}
                      {renderMoveSuggestions(moveInsight.insights)}
                    </div>
                  </AccordionTab>
                );
              })}
            </Accordion>
          ) : (
            <div className="text-center p-4 text-600">
              No coach feedback available yet. Make a move to receive coaching insights.
            </div>
          )}

          {/* Show Hint Button - for the latest insights */}
          {insights && (insights.bestMove || (insights.alternatives && insights.alternatives.length > 0)) && (
            <>
              <Divider />
              <div className="flex justify-content-center">
                <Button
                  label="Show Hint"
                  icon="pi pi-eye"
                  severity="secondary"
                  outlined
                  onClick={() => setShowHintModal(true)}
                  className="px-4 py-2"
                  tooltip="View chess engine suggestions for this position"
                  tooltipOptions={{ position: 'top' }}
                  aria-label="Show move hints and alternatives"
                  aria-describedby="hint-button-description"
                />
              </div>
            </>
          )}
        </>
      )}

      {/* Game Status Section - Only show if game is over */}
      {gameOver && (
        <>
          <Divider />
          <div>
            <div className="flex align-items-center gap-2 mb-2">
              <i className="pi pi-flag text-primary" />
              <span className="font-medium">Game Status</span>
            </div>
            <div className="ml-4 text-700 font-semibold">
              {gameResult || 'Game Over'}
            </div>
          </div>
        </>
      )}

      {/* Hint Modal */}
      <HintModal
        visible={showHintModal}
        onHide={() => setShowHintModal(false)}
        insights={insights}
      />
      
      {/* Notation Help Tooltip */}
      <Tooltip target=".notation-help" position="top">
        <div className="text-sm" style={{ maxWidth: '300px' }}>
          <strong>Chess Notation Guide:</strong><br/>
          <div className="mt-1">
            • <strong>Letters</strong> indicate pieces (K=King, Q=Queen, R=Rook, B=Bishop, N=Knight)<br/>
            • <strong>x</strong> means capture<br/>
            • <strong>+</strong> means check<br/>
            • <strong>#</strong> means checkmate<br/>
            • <strong>O-O</strong> means kingside castling<br/>
            • <strong>O-O-O</strong> means queenside castling<br/>
            • <strong>=Q</strong> means pawn promotion to Queen
          </div>
        </div>
      </Tooltip>
    </div>
  );
};

export default CoachModalContent;