import { useTutorial } from '../contexts/TutorialContext';
import { TutorialModal } from './TutorialModal';

export function TutorialModalWrapper() {
  const { isTutorialActive, currentTutorial, stopTutorial } = useTutorial();
  
  if (!isTutorialActive || !currentTutorial) {
    return null;
  }
  
  return (
    <TutorialModal
      tutorial={currentTutorial}
      isOpen={isTutorialActive}
      onClose={stopTutorial}
      isMobile={window.innerWidth < 768}
    />
  );
}
