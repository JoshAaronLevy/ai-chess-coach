import React from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { Divider } from 'primereact/divider';
import type { TutorInsights } from '../utils/difyParser';

/**
 * Note: Move suggestions in this modal display chess notation (SAN/UCI) rather than
 * human-readable descriptions because they are forward-looking suggestions that haven't
 * been played yet. We don't have full move details (piece type, captures, etc.) until
 * a move is actually made. Historical moves in CoachModalContent use human-readable format.
 */

interface HintModalProps {
  visible: boolean;
  onHide: () => void;
  insights: TutorInsights | null;
}

export const HintModal: React.FC<HintModalProps> = ({
  visible,
  onHide,
  insights
}) => {
  const hasBestMove = insights?.bestMove;
  const hasAlternatives = insights?.alternatives && insights.alternatives.length > 0;

  const copyToClipboard = () => {
    if (!insights) return;
    
    let text = '';
    
    if (hasBestMove) {
      text += `Recommended Move: ${insights.bestMove?.san} (${insights.bestMove?.uci})\n\n`;
    }
    
    if (hasAlternatives) {
      text += 'Alternative Moves:\n';
      insights.alternatives.forEach((alt, index) => {
        text += `${index + 1}. ${alt.san} (${alt.uci})`;
        if (alt.why) {
          text += ` - ${alt.why}`;
        }
        text += '\n';
      });
    }
    
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback for older browsers or if clipboard API fails
      console.warn('Could not copy hint to clipboard');
    });
  };

  const footerContent = (
    <div className="flex justify-content-between align-items-center w-full">
      <Button
        label="Copy Hint"
        icon="pi pi-copy"
        text
        size="small"
        onClick={copyToClipboard}
        disabled={!hasBestMove && !hasAlternatives}
        className="text-600"
        aria-label="Copy hint information to clipboard"
        title="Copy hint information to clipboard"
      />
      <Button
        label="Close"
        icon="pi pi-times"
        onClick={onHide}
        autoFocus
        aria-label="Close hint modal"
      />
    </div>
  );

  return (
    <Dialog
      header="Chess Coach Hint"
      visible={visible}
      onHide={onHide}
      footer={footerContent}
      style={{ width: '90vw', maxWidth: '500px' }}
      modal
      dismissableMask
      closeOnEscape
      resizable={false}
      draggable={false}
      className="hint-modal"
      contentStyle={{ padding: '1.5rem' }}
      aria-labelledby="hint-modal-header"
      aria-describedby="hint-modal-content"
      focusOnShow={true}
    >
      <div
        className="flex flex-column gap-4"
        id="hint-modal-content"
        role="main"
      >
        
        {/* Best Move Section */}
        {hasBestMove ? (
          <div>
            <div className="flex align-items-center gap-2 mb-3">
              <i className="pi pi-star-fill text-primary text-lg" />
              <h3 className="m-0 text-primary font-semibold">Recommended Move</h3>
            </div>
            <div className="ml-4">
              <div className="text-4xl font-bold text-900 mb-1">
                {insights.bestMove?.san}
              </div>
              <div className="text-sm text-600 font-mono">
                UCI: {insights.bestMove?.uci}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex align-items-center gap-2 mb-3">
              <i className="pi pi-star text-400 text-lg" />
              <h3 className="m-0 text-600 font-semibold">Recommended Move</h3>
            </div>
            <div className="ml-4 text-600 italic">
              No specific move recommendation available
            </div>
          </div>
        )}

        {/* Divider - only show if we have both sections */}
        {hasBestMove && hasAlternatives && <Divider />}

        {/* Alternatives Section */}
        {hasAlternatives && (
          <div>
            <div className="flex align-items-center gap-2 mb-3">
              <i className="pi pi-list text-primary text-lg" />
              <h3 className="m-0 text-primary font-semibold">Alternative Moves</h3>
            </div>
            <div className="ml-4">
              <div className="flex flex-column gap-3">
                {insights.alternatives.map((alternative, index) => (
                  <div key={`${alternative.uci}-${index}`} className="p-3 surface-50 border-round">
                    <div className="flex align-items-center gap-3 mb-1">
                      <span className="text-xl font-bold text-900">
                        {alternative.san}
                      </span>
                      <span className="text-sm text-600 font-mono">
                        {alternative.uci}
                      </span>
                    </div>
                    {alternative.why && (
                      <div className="text-700 text-sm line-height-3 mt-2">
                        {alternative.why}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* No content message */}
        {!hasBestMove && !hasAlternatives && (
          <div className="text-center p-4">
            <i className="pi pi-info-circle text-400 text-3xl mb-3 block" />
            <div className="text-600 text-lg">
              No move suggestions available for this position
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <Divider />
        <div className="text-xs text-500 text-center line-height-3">
          <i className="pi pi-info-circle mr-2" />
          Hint quality depends on position complexity and available analysis time
        </div>
      </div>
    </Dialog>
  );
};

export default HintModal;