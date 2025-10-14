import React, { useState, useEffect } from 'react';
import { Panel } from 'primereact/panel';
import { Divider } from 'primereact/divider';
import { Badge } from 'primereact/badge';
import { Tag } from 'primereact/tag';
import { ProgressBar } from 'primereact/progressbar';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Button } from 'primereact/button';
import type { TutorInsights } from '../utils/difyParser';
import { HintModal } from './HintModal';

interface CoachPanelProps {
  lastSan?: string;
  lastMoveFrom?: string;
  lastMoveTo?: string;
  gameOver?: boolean;
  gameResult?: string;
  // Coach insights props
  insights: TutorInsights | null;
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

export const CoachPanel: React.FC<CoachPanelProps> = ({
  lastSan,
  lastMoveFrom,
  lastMoveTo,
  gameOver,
  gameResult,
  insights,
  hasNewInsights,
  isLoadingInsights,
  onMarkInsightsViewed
}) => {
  const [expandedExplanation, setExpandedExplanation] = useState(false);
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

  const headerTemplate = (
    <div className="flex align-items-center justify-content-between w-full">
      <div className="flex align-items-center gap-2">
        <i className="pi pi-user text-primary" />
        <span className="font-semibold">Coach Feedback</span>
      </div>
      {hasNewInsights && (
        <Badge
          value="New"
          severity="info"
          className="animate-pulse"
          style={{
            animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches
              ? 'none'
              : 'pulse 2s infinite',
            fontSize: '0.75rem'
          }}
          aria-label="New coach insights available"
        />
      )}
    </div>
  );

  // Helper function to truncate explanation
  const renderExplanation = (explanation: string | null) => {
    if (!explanation) return '—';
    
    const shouldTruncate = explanation.length > 150;
    const displayText = shouldTruncate && !expandedExplanation
      ? explanation.substring(0, 150) + '...'
      : explanation;

    return (
      <div>
        <div
          id="explanation-content"
          className="text-700 line-height-3 mb-2"
          role="region"
          aria-live="polite"
        >
          {displayText}
        </div>
        {shouldTruncate && (
          <Button
            label={expandedExplanation ? 'Show less' : 'Show more'}
            text
            size="small"
            className="p-0 text-primary"
            onClick={() => setExpandedExplanation(!expandedExplanation)}
            aria-expanded={expandedExplanation}
            aria-controls="explanation-content"
            aria-label={`${expandedExplanation ? 'Collapse' : 'Expand'} detailed explanation`}
          />
        )}
      </div>
    );
  };

  return (
    <Panel header={headerTemplate} className="h-full">
      <div className="flex flex-column gap-3">
        {/* Last Move Section */}
        <div>
          <div className="flex align-items-center gap-2 mb-2">
            <i className="pi pi-arrow-right text-primary" />
            <span className="font-medium">
              Last Move
              {insights?.lastMove?.grade && (
                <>
                  {' - '}
                  <Tag
                    value={insights.lastMove.grade}
                    severity={getGradeColor(insights.lastMove.grade)}
                    className="font-bold ml-1"
                  />
                </>
              )}
            </span>
          </div>
          <div className="ml-4 text-700">
            {lastMoveFrom && lastMoveTo
              ? `${lastMoveFrom} → ${lastMoveTo}`
              : lastSan ?? '—'
            }
          </div>
        </div>

        <Divider />

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

        {/* Insights Content */}
        {!isLoadingInsights && (
          <>
            {/* Explanation Section */}
            <div>
              <div className="flex align-items-center gap-2 mb-2">
                <i className="pi pi-lightbulb text-primary" />
                <span className="font-medium">Explanation</span>
              </div>
              <div className="ml-4">
                {insights?.lastMove?.explanation ? (
                  renderExplanation(insights.lastMove.explanation)
                ) : insights ? (
                  <span className="text-700">No explanation provided</span>
                ) : (
                  <span className="text-600 italic">Coach analysis will appear here after your move</span>
                )}
              </div>
            </div>

            {/* Confidence Section */}
            {insights?.confidence !== null && insights?.confidence !== undefined && (
              <>
                <Divider />
                <div>
                  <div className="flex align-items-center gap-2 mb-2">
                    <i className="pi pi-chart-bar text-primary" />
                    <span className="font-medium">Model Confidence</span>
                  </div>
                  <div className="ml-4">
                    <div className="flex align-items-center gap-2">
                      <ProgressBar
                        value={Math.round(insights.confidence * 100)}
                        className="flex-1"
                        style={{ height: '12px' }}
                      />
                      <span className="text-sm text-700 font-medium">
                        {Math.round(insights.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Reasoning Section - Collapsible */}
            {insights?.reasoning && (
              <>
                <Divider />
                <div>
                  <Accordion className="w-full">
                    <AccordionTab
                      header={
                        <div className="flex align-items-center gap-2">
                          <i className="pi pi-book text-primary" />
                          <span className="font-medium">Deeper Reasoning</span>
                        </div>
                      }
                    >
                      <div className="text-700 line-height-3 p-2">
                        {insights.reasoning}
                      </div>
                    </AccordionTab>
                  </Accordion>
                </div>
              </>
            )}

            {/* Show Hint Button */}
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
      </div>

      {/* Hint Modal */}
      <HintModal
        visible={showHintModal}
        onHide={() => setShowHintModal(false)}
        insights={insights}
      />
    </Panel>
  );
};

export default CoachPanel;