import { useState, useEffect } from 'react';
import { FaTimes, FaChevronLeft, FaChevronRight, FaExclamationTriangle } from 'react-icons/fa';
import type { Tutorial } from '../config/tutorialConfig';
import { ContactDeveloperModal } from './ContactDeveloperModal';
import { can } from '../config/permissions';
import { useEffectiveRoleIds } from '../hooks/useEffectiveRoleIds';

interface TutorialModalProps {
  tutorial: Tutorial;
  isOpen: boolean;
  onClose: () => void;
  isMobile: boolean;
}

export function TutorialModal({ tutorial, isOpen, onClose, isMobile }: TutorialModalProps) {
  const { effectiveRoleIds } = useEffectiveRoleIds();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadingErrors, setLoadingErrors] = useState<Set<number>>(new Set());
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  
  // Filter screenshots based on permissions
  const visibleScreenshots = tutorial.screenshots.filter(screenshot => 
    !screenshot.requiredPermissions || 
    screenshot.requiredPermissions.some(permission => can(effectiveRoleIds, permission as any))
  );
  
  const currentScreenshot = visibleScreenshots[currentImageIndex];
  const imageUrl = isMobile && currentScreenshot?.mobileImage 
    ? currentScreenshot.mobileImage 
    : currentScreenshot?.image;
  
  // Preload all images when modal opens
  useEffect(() => {
    if (isOpen && tutorial) {
      const imageUrls = visibleScreenshots.map(screenshot => 
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
  }, [isOpen, tutorial, isMobile, visibleScreenshots]);
  
  const handleContactDeveloper = () => {
    setIsContactModalOpen(true);
  };
  
  const handlePrev = () => {
    setCurrentImageIndex(prev => Math.max(0, prev - 1));
  };
  
  const handleNext = () => {
    setCurrentImageIndex(prev => Math.min(visibleScreenshots.length - 1, prev + 1));
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="tutorial-modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '1rem'
    }}>
      <div className="tutorial-modal" style={{
        backgroundColor: '#ffffff',
        borderRadius: '0.75rem',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        {/* Header */}
        <div className="tutorial-modal-header" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1.5rem 2rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.5rem',
            fontWeight: 600,
            color: '#111827'
          }}>{tutorial.title}</h2>
          <button onClick={onClose} className="close-button" style={{
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: '#6b7280',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FaTimes />
          </button>
        </div>
        
        {/* Content */}
        <div className="tutorial-modal-content" style={{
          padding: '2rem',
          maxHeight: 'calc(90vh - 120px)',
          overflowY: 'auto'
        }}>
          {!imagesLoaded && (
            <div className="tutorial-loading">
              <div className="loading-spinner" />
              <p>Loading tutorial images...</p>
            </div>
          )}
          
          {imagesLoaded && (
            <>
              {/* Image */}
              <div className="tutorial-image-container" style={{
                marginBottom: '2rem',
                textAlign: 'center',
                justifyContent: 'center',
                display: 'flex',
                alignItems: 'center',
              }}>
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
                    style={{
                      maxWidth: '100%',
                      maxHeight: '400px',
                      borderRadius: '0.5rem',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                )}
              </div>
              
              {/* Description */}
              <div className="tutorial-description" style={{
                marginBottom: '2rem',
                textAlign: 'center'
              }}>
                <h3 style={{
                  margin: '0 0 1rem 0',
                  fontSize: '1.25rem',
                  fontWeight: 600,
                  color: '#111827'
                }}>{currentScreenshot.title}</h3>
                <p style={{
                  margin: 0,
                  color: '#6b7280',
                  lineHeight: 1.6,
                  fontSize: '0.95rem',
                  textAlign: 'left',
                  padding: '0 1rem'
                }}>{currentScreenshot.description}</p>
              </div>
              
              {/* Navigation */}
              <div className="tutorial-navigation" style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '1rem',
                paddingTop: '1.5rem',
                borderTop: '1px solid #e5e7eb'
              }}>
                <button 
                  onClick={handlePrev}
                  disabled={currentImageIndex === 0}
                  className="nav-button prev"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    backgroundColor: currentImageIndex === 0 ? '#e5e7eb' : '#3b82f6',
                    color: currentImageIndex === 0 ? '#9ca3af' : '#ffffff',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: currentImageIndex === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500
                  }}
                >
                  <FaChevronLeft /> Previous
                </button>
                
                <span className="image-counter" style={{
                  color: '#6b7280',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  minWidth: '60px',
                  textAlign: 'center'
                }}>
                  {currentImageIndex + 1} / {visibleScreenshots.length}
                </span>
                
                <button 
                  onClick={handleNext}
                  disabled={currentImageIndex === visibleScreenshots.length - 1}
                  className="nav-button next"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    backgroundColor: currentImageIndex === visibleScreenshots.length - 1 ? '#e5e7eb' : '#3b82f6',
                    color: currentImageIndex === visibleScreenshots.length - 1 ? '#9ca3af' : '#ffffff',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: currentImageIndex === visibleScreenshots.length - 1 ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 500
                  }}
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
