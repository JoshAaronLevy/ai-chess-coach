import React, { useState, useEffect } from 'react';
import { Divider } from 'primereact/divider';
import { Tag } from 'primereact/tag';
import { ProgressBar } from 'primereact/progressbar';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'primereact/button';
import type { TutorInsights } from '../../../utils/difyParser';
import type { MoveInsights } from '../../../types/chess';
import { HintModal } from '../../../coach/HintModal';

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

// Utility function for grade color mapping
const getGradeColor = (grade: string): 'success' | 'info' | 'warning' | 'danger' => {
  const upperGrade = grade.toUpperCase();
  if (upperGrade.startsWith('A')) return 'success';
  if (upperGrade.startsWith('B')) return 'info';
  if (upperGrade.startsWith('C')) return 'warning';
  return 'danger'; // D, F, or unknown
};

export const CoachModalContent: React.FC<CoachModalContentProps> = ({
  lastSan,
  lastMoveFrom,
  lastMoveTo,
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
        !Object.values(moveInsights.next_moves).some(move => move?.uci || move?.san)) {
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
            <div className="flex flex-column gap-2">
              {moveInsights.next_moves.advanced?.uci || moveInsights.next_moves.advanced?.san ? (
                <div>
                  <span className="font-semibold text-800">Advanced: </span>
                  <span className="font-medium">
                    {moveInsights.next_moves.advanced.san || moveInsights.next_moves.advanced.uci}
                  </span>
                </div>
              ) : null}
              
              {moveInsights.next_moves.intermediate?.uci || moveInsights.next_moves.intermediate?.san ? (
                <div>
                  <span className="font-semibold text-800">Intermediate: </span>
                  <span className="font-medium">
                    {moveInsights.next_moves.intermediate.san || moveInsights.next_moves.intermediate.uci}
                  </span>
                </div>
              ) : null}
              
              {moveInsights.next_moves.beginner?.uci || moveInsights.next_moves.beginner?.san ? (
                <div>
                  <span className="font-semibold text-800">Beginner: </span>
                  <span className="font-medium">
                    {moveInsights.next_moves.beginner.san || moveInsights.next_moves.beginner.uci}
                  </span>
                </div>
              ) : null}
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
              {insightsHistory.slice().reverse().map((moveInsight, index) => {
                const moveNumber = moveInsight.moveNumber;
                const grade = moveInsight.insights.lastMove?.grade || '';
                const isWhiteMove = moveNumber % 2 === 1; // Odd = white, even = black
                
                // Header styling
                const headerStyle = {
                  backgroundColor: isWhiteMove ? '#ffffff' : '#2d2d2d',
                  color: isWhiteMove ? '#000000' : '#ffffff',
                };
                
                return (
                  <AccordionTab
                    key={moveInsight.timestamp}
                    header={`Move ${moveNumber} - ${grade}`}
                    headerClassName="font-semibold"
                    headerStyle={headerStyle}
                  >
                    <div className="p-3" style={{ backgroundColor: '#ffffff', color: '#000000' }}>
                      {/* Move notation */}
                      <div className="mb-3">
                        <span className="font-medium">Move: </span>
                        <span className="text-700">
                          {moveInsight.fromSquare} → {moveInsight.toSquare}
                        </span>
                        <span className="text-500 ml-2">({moveInsight.san})</span>
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
    </div>
  );
};

export default CoachModalContent;