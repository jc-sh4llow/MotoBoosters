import { useState } from 'react';
import { FaQuestionCircle } from 'react-icons/fa';
import { useTutorial } from '../contexts/TutorialContext';

interface HelpButtonProps {
  currentPage?: string;
  isMobile?: boolean;
}

export function HelpButton({ currentPage, isMobile }: HelpButtonProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { startTutorial, getAvailableTutorials } = useTutorial();
  
  const availableTutorials = getAvailableTutorials(currentPage);
  
  const handleTutorialSelect = (tutorialId: string) => {
    setIsDropdownOpen(false);
    startTutorial(tutorialId);
  };
  
  // Don't show help button if no tutorials available
  if (availableTutorials.length === 0) {
    return null;
  }
  
  return (
    <div className="help-button-container">
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="help-button"
        title="View tutorials"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '0.25rem' : '0.5rem',
          padding: isMobile ? '0.25rem 0.5rem' : '0.5rem 0.75rem',
          backgroundColor: 'var(--tutorial-bg)',
          color: 'var(--tutorial-text)',
          border: '1px solid var(--tutorial-border)',
          borderRadius: '0.375rem',
          fontSize: isMobile ? '0.75rem' : '0.875rem',
          cursor: 'pointer',
        }}
      >
        {isMobile ? '(?)' : <><FaQuestionCircle /> Help</>}
      </button>
      
      {isDropdownOpen && (
        <div className="help-dropdown">
          {availableTutorials.map(tutorial => (
            <button
              key={tutorial.id}
              onClick={() => handleTutorialSelect(tutorial.id)}
              className="help-dropdown-item"
            >
              <div className="tutorial-item-title">{tutorial.title}</div>
              <div className="tutorial-item-description">{tutorial.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
