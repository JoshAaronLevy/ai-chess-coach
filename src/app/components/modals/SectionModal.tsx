import React from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import type { SectionType } from '../../../hooks/useSectionModals';

export interface SectionModalProps {
  visible: boolean;
  onHide: () => void;
  sectionType: SectionType;
  title: string;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
  scrollable?: boolean;
}

const getSizeConfig = (size: 'small' | 'medium' | 'large') => {
  switch (size) {
    case 'small':
      return {
        style: { width: '90vw', maxWidth: '400px' },
        contentStyle: { padding: '1.5rem', maxHeight: '80vh', overflow: 'auto' }
      };
    case 'medium':
      return {
        style: { width: '90vw', maxWidth: '600px' },
        contentStyle: { padding: '1.5rem', maxHeight: '80vh', overflow: 'auto' }
      };
    case 'large':
      return {
        style: { width: '90vw', maxWidth: '800px' },
        contentStyle: { padding: '1.5rem', maxHeight: '80vh', overflow: 'auto' }
      };
    default:
      return {
        style: { width: '90vw', maxWidth: '600px' },
        contentStyle: { padding: '1.5rem', maxHeight: '80vh', overflow: 'auto' }
      };
  }
};

export const SectionModal: React.FC<SectionModalProps> = ({
  visible,
  onHide,
  sectionType,
  title,
  children,
  size = 'medium',
  scrollable = true
}) => {
  const sizeConfig = getSizeConfig(size);
  const contentStyle = scrollable 
    ? sizeConfig.contentStyle 
    : { ...sizeConfig.contentStyle, overflow: 'visible' };

  const footerContent = (
    <div className="flex justify-content-end w-full">
      <Button
        label="Close"
        icon="pi pi-times"
        onClick={onHide}
        autoFocus
        aria-label={`Close ${title} modal`}
      />
    </div>
  );

  return (
    <Dialog
      header={title}
      visible={visible}
      onHide={onHide}
      footer={footerContent}
      style={sizeConfig.style}
      modal
      dismissableMask
      closeOnEscape
      resizable={false}
      draggable={false}
      className={`section-modal section-modal-${sectionType || 'default'}`}
      contentStyle={contentStyle}
      role="dialog"
      aria-labelledby={`${sectionType}-modal-header`}
      aria-describedby={`${sectionType}-modal-content`}
      focusOnShow={true}
    >
      <div
        className="flex flex-column gap-3"
        id={`${sectionType}-modal-content`}
        role="main"
      >
        {children}
      </div>
    </Dialog>
  );
};

export default SectionModal;