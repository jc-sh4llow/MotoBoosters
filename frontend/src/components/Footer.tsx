// src/components/Footer.tsx
import React from 'react';

export function Footer() {
  return (
    <footer style={{
      backgroundColor: 'rgba(26, 86, 219, 0.95)',
      color: 'rgba(255, 255, 255, 0.8)',
      padding: '1rem',
      textAlign: 'center',
      fontSize: '0.875rem',
      backdropFilter: 'blur(8px)',
      borderTop: '1px solid rgba(255, 255, 255, 0.1)'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        © {new Date().getFullYear()} MotoBooster. All rights reserved.
      </div>
    </footer>
  );
}