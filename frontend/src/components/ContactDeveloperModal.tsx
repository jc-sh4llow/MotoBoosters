import { useState } from 'react';
import { can } from '../config/permissions';
import { useEffectiveRoleIds } from '../hooks/useEffectiveRoleIds';
import { useAuth } from '../contexts/AuthContext';

interface ContactDeveloperModalProps {
  onClose: () => void;
  tutorialId: string;
  imageIndex: number;
}

export function ContactDeveloperModal({ onClose, tutorialId, imageIndex }: ContactDeveloperModalProps) {
  const { user } = useAuth();
  const { effectiveRoleIds } = useEffectiveRoleIds();
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState('');
  
  const canContactDeveloper = can(effectiveRoleIds, 'users.view.developer');
  
  const handleSendEmail = () => {
    setIsSending(true);
    
    const emailSubject = `Tutorial Image Issue - ${tutorialId} - Image ${imageIndex + 1}`;
    const emailBody = `
User: ${user?.name} (${user?.id})
Tutorial: ${tutorialId}
Image: ${imageIndex + 1}
Message: ${message}

Timestamp: ${new Date().toISOString()}
    `.trim();
    
    // Open email client with pre-filled content
    const mailtoLink = `mailto:developer@example.com?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(mailtoLink);
    
    setIsSending(false);
    onClose();
  };
  
  if (!canContactDeveloper) {
    return (
      <div className="contact-modal-overlay">
        <div className="contact-modal">
          <h3>Contact Restricted</h3>
          <p>You don't have permission to contact the developer directly.</p>
          <p>Please contact your system administrator.</p>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="contact-modal-overlay">
      <div className="contact-modal">
        <h3>Contact Developer</h3>
        <p>Report tutorial image issues to the developer.</p>
        
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe the issue you're experiencing..."
          rows={4}
          className="contact-message-textarea"
        />
        
        <div className="contact-modal-actions">
          <button onClick={onClose} disabled={isSending} className="contact-btn-cancel">
            Cancel
          </button>
          <button 
            onClick={handleSendEmail} 
            disabled={isSending || !message.trim()}
            className="contact-btn-send"
          >
            {isSending ? 'Opening Email...' : 'Send Email'}
          </button>
        </div>
      </div>
    </div>
  );
}
