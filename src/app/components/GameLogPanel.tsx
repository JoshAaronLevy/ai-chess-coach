import React, { useState } from 'react';
import { Panel } from 'primereact/panel';
import { Button } from 'primereact/button';
import { Divider } from 'primereact/divider';
import { useGameLog } from '../../chess/useGameLog';

interface GameLogPanelProps {
  // Component uses useGameLog hook internally, no props needed currently
}

export const GameLogPanel: React.FC<GameLogPanelProps> = () => {
  const { getLog, snapshots } = useGameLog();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'success' | 'error'>('idle');

  // Get the last snapshot (most recent position)
  const lastSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  
  // Get the last move (if any moves have been made)
  const lastMove = lastSnapshot?.move;

  // Format captured pieces using chess symbols
  const formatCapturedCounts = (capturedCounts: any) => {
    if (!capturedCounts) return 'No captures';
    
    const pieceSymbols = {
      white: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
      black: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
    };
    
    const formatSide = (counts: Record<string, number>, symbols: Record<string, string>) => {
      return Object.entries(counts)
        .map(([piece, count]) => `${symbols[piece]}${count}`)
        .join(' ');
    };
    
    const whiteCaptures = formatSide(capturedCounts.white, pieceSymbols.white);
    const blackCaptures = formatSide(capturedCounts.black, pieceSymbols.black);
    
    return `White: ${whiteCaptures} | Black: ${blackCaptures}`;
  };

  // Handle copying game log to clipboard
  const handleCopyJson = async () => {
    setCopyStatus('copying');
    
    try {
      const log = getLog();
      const jsonString = JSON.stringify(log, null, 2);
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(jsonString);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = jsonString;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      
      setCopyStatus('success');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  const headerTemplate = (
    <div className="flex align-items-center gap-2">
      <i className="pi pi-code text-primary" />
      <span className="font-semibold">Game Log Debug</span>
    </div>
  );

  const getCopyButtonProps = () => {
    switch (copyStatus) {
      case 'copying':
        return { label: 'Copying...', icon: 'pi pi-spin pi-spinner', disabled: true };
      case 'success':
        return { label: 'Copied!', icon: 'pi pi-check', severity: 'success' as const };
      case 'error':
        return { label: 'Failed', icon: 'pi pi-times', severity: 'danger' as const };
      default:
        return { label: 'Copy JSON', icon: 'pi pi-copy' };
    }
  };

  return (
    <Panel header={headerTemplate} className="h-full">
      <div className="flex flex-column gap-3">
        {/* FEN Section */}
        <div>
          <div className="flex align-items-center gap-2 mb-2">
            <i className="pi pi-qrcode text-primary" />
            <span className="font-medium">Current FEN</span>
          </div>
          <div className="ml-4 text-700 font-mono text-sm bg-gray-50 p-2 border-round overflow-auto">
            {lastSnapshot?.fen || 'No position available'}
          </div>
        </div>

        <Divider />

        {/* Last Move Section */}
        <div>
          <div className="flex align-items-center gap-2 mb-2">
            <i className="pi pi-arrow-right text-primary" />
            <span className="font-medium">Last Move</span>
          </div>
          <div className="ml-4 text-700 font-mono">
            {lastMove ? `Last: ${lastMove.san}` : 'No moves yet'}
          </div>
        </div>

        <Divider />

        {/* Captured Pieces Section */}
        <div>
          <div className="flex align-items-center gap-2 mb-2">
            <i className="pi pi-minus-circle text-primary" />
            <span className="font-medium">Captured Pieces</span>
          </div>
          <div className="ml-4 text-700 text-sm">
            {lastSnapshot ? formatCapturedCounts(lastSnapshot.capturedCounts) : 'No captures tracked'}
          </div>
        </div>

        <Divider />

        {/* Export Section */}
        <div>
          <div className="flex align-items-center gap-2 mb-2">
            <i className="pi pi-download text-primary" />
            <span className="font-medium">Export</span>
          </div>
          <div className="ml-4">
            <Button
              {...getCopyButtonProps()}
              onClick={handleCopyJson}
              size="small"
              className="w-full"
              disabled={snapshots.length === 0 || copyStatus === 'copying'}
            />
          </div>
        </div>

        {/* Debug Info */}
        {snapshots.length === 0 && (
          <>
            <Divider />
            <div className="text-center text-500 p-2">
              <i className="pi pi-info-circle mr-2" />
              No game log available. Start a new game to see debug information.
            </div>
          </>
        )}
      </div>
    </Panel>
  );
};

export default GameLogPanel;