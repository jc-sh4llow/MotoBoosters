import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Tutorial } from '../config/tutorialConfig';
import { TUTORIAL_CONFIG } from '../config/tutorialConfig';
import { can } from '../config/permissions';
import type { PermissionKey } from '../config/permissions';
import { useEffectiveRoleIds } from '../hooks/useEffectiveRoleIds';

interface TutorialContextType {
  startTutorial: (tutorialId: string) => void;
  stopTutorial: () => void;
  isTutorialActive: boolean;
  currentTutorial: Tutorial | null;
  currentImageIndex: number;
  setCurrentImageIndex: (index: number) => void;
  getAvailableTutorials: (currentPage?: string) => Tutorial[];
  trackAnalytics: (event: string, data?: any) => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [isTutorialActive, setIsTutorialActive] = useState(false);
  const [currentTutorial, setCurrentTutorial] = useState<Tutorial | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [viewedImages, setViewedImages] = useState<Set<string>>(new Set());
  
  const { effectiveRoleIds } = useEffectiveRoleIds();
  
  const startTutorial = (tutorialId: string, currentPage?: string) => {
    const page = currentPage || window.location.pathname;
    const availableTutorials = TUTORIAL_CONFIG[page] || [];
    const tutorial = availableTutorials.find((t: Tutorial) => t.id === tutorialId);
    
    if (tutorial) {
      setCurrentTutorial(tutorial);
      setIsTutorialActive(true);
      setCurrentImageIndex(0);
      setViewedImages(new Set());
      
      trackAnalytics('tutorial_start', { tutorialId, currentPage });
    }
  };
  
  const stopTutorial = () => {
    if (currentTutorial) {
      trackAnalytics('tutorial_stop', { 
        tutorialId: currentTutorial.id,
        viewedImages: Array.from(viewedImages),
        lastImageIndex: currentImageIndex
      });
    }
    
    setIsTutorialActive(false);
    setCurrentTutorial(null);
    setCurrentImageIndex(0);
    setViewedImages(new Set());
  };
  
  const trackImageView = (tutorialId: string, imageIndex: number) => {
    const imageKey = `${tutorialId}-${imageIndex}`;
    setViewedImages(prev => new Set([...prev, imageKey]));
    
    trackAnalytics('image_viewed', { tutorialId, imageIndex });
  };
  
  const getAvailableTutorials = (currentPage?: string) => {
    const page = currentPage || window.location.pathname;
    const tutorials = TUTORIAL_CONFIG[page] || [];
    
    return tutorials.filter((tutorial: Tutorial) => 
      tutorial.requiredPermissions.every(permission => 
        can(effectiveRoleIds, permission as PermissionKey)
      )
    );
  };
  
  const trackAnalytics = (event: string, data?: any) => {
    const analyticsData = {
      event,
      timestamp: Date.now(),
      data,
      userAgent: navigator.userAgent,
    };
    
    // Store in localStorage for debugging
    const existing = JSON.parse(localStorage.getItem('tutorial_analytics') || '[]');
    existing.push(analyticsData);
    
    // Keep only last 100 events
    if (existing.length > 100) {
      existing.splice(0, existing.length - 100);
    }
    
    localStorage.setItem('tutorial_analytics', JSON.stringify(existing));
    console.log('Tutorial Analytics:', analyticsData);
  };
  
  // Track image views when index changes
  useEffect(() => {
    if (currentTutorial && isTutorialActive) {
      trackImageView(currentTutorial.id, currentImageIndex);
    }
  }, [currentImageIndex, currentTutorial, isTutorialActive]);
  
  return (
    <TutorialContext.Provider value={{
      startTutorial,
      stopTutorial,
      isTutorialActive,
      currentTutorial,
      currentImageIndex,
      setCurrentImageIndex,
      getAvailableTutorials,
      trackAnalytics,
    }}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  const context = useContext(TutorialContext);
  if (context === undefined) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
}
