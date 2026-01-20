import { useState, useEffect } from 'react';
import { FaTimes, FaChevronLeft, FaChevronRight, FaExclamationTriangle } from 'react-icons/fa';
import type { Tutorial } from '../config/tutorialConfig';
import { ContactDeveloperModal } from './ContactDeveloperModal';

interface TutorialModalProps {
  tutorial: Tutorial;
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
}

export function TutorialModal({ tutorial, isOpen, onClose, isMobile }: TutorialModalProps) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadingErrors, setLoadingErrors] = useState<Set<number>>(new Set());
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  
  const currentScreenshot = tutorial.screenshots[currentImageIndex];
  const imageUrl = isMobile && currentScreenshot.mobileImage 
    ? currentScreenshot.mobileImage 
    : currentScreenshot.image;
  
  // Preload all images when modal opens
  useEffect(() => {
    if (isOpen && tutorial) {
      const imageUrls = tutorial.screenshots.map(screenshot => 
        isMobile && screenshot.mobileImage ? screenshot.mobileImage : screenshot.image
      );
      
      let loadedCount = 0;
      const errors = new Set<number>();
      
      imageUrls.forEach((url, index) => {
        const img = new Image();
        img.onload = () => {
          loadedCount++;
          if (loadedCount === imageUrls.length) {
            setImagesLoaded(true);
          }
        };
        img.onerror = () => {
          errors.add(index);
          setLoadingErrors(errors);
          loadedCount++;
          if (loadedCount === imageUrls.length) {
            setImagesLoaded(true);
          }
        };
        img.src = url;
      });
    }
  }, [isOpen, tutorial, isMobile]);
  
  const handleContactDeveloper = () => {
    setIsContactModalOpen(true);
  };
  
  const handlePrev = () => {
    setCurrentImageIndex(prev => Math.max(0, prev - 1));
  };
  
  const handleNext = () => {
    setCurrentImageIndex(prev => Math.min(tutorial.screenshots.length - 1, prev + 1));
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="tutorial-modal-overlay">
      <div className="tutorial-modal">
        {/* Header */}
        <div className="tutorial-modal-header">
          <h2>{tutorial.title}</h2>
          <button onClick={onClose} className="close-button">
            <FaTimes />
          </button>
        </div>
        
        {/* Content */}
        <div className="tutorial-modal-content">
          {!imagesLoaded && (
            <div className="tutorial-loading">
              <div className="loading-spinner" />
              <p>Loading tutorial images...</p>
            </div>
          )}
          
          {imagesLoaded && (
            <>
              {/* Image */}
              <div className="tutorial-image-container">
                {loadingErrors.has(currentImageIndex) ? (
                  <div className="image-error">
                    <FaExclamationTriangle />
                    <p>Image loading error</p>
                    <p className="error-contact">Contact developer for assistance</p>
                    <button 
                      onClick={handleContactDeveloper}
                      className="contact-developer-btn"
                    >
                      Contact Developer
                    </button>
                  </div>
                ) : (
                  <img 
                    src={imageUrl} 
                    alt={currentScreenshot.title}
                    className="tutorial-image"
                  />
                )}
              </div>
              
              {/* Description */}
              <div className="tutorial-description">
                <h3>{currentScreenshot.title}</h3>
                <p>{currentScreenshot.description}</p>
              </div>
              
              {/* Navigation */}
              <div className="tutorial-navigation">
                <button 
                  onClick={handlePrev}
                  disabled={currentImageIndex === 0}
                  className="nav-button prev"
                >
                  <FaChevronLeft /> Previous
                </button>
                
                <span className="image-counter">
                  {currentImageIndex + 1} / {tutorial.screenshots.length}
                </span>
                
                <button 
                  onClick={handleNext}
                  disabled={currentImageIndex === tutorial.screenshots.length - 1}
                  className="nav-button next"
                >
                  Next <FaChevronRight />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Contact Developer Modal */}
      {isContactModalOpen && (
        <ContactDeveloperModal 
          onClose={() => setIsContactModalOpen(false)}
          tutorialId={tutorial.id}
          imageIndex={currentImageIndex}
        />
      )}
    </div>
  );
}
