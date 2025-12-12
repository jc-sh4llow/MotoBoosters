import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * iOS-style toggle switch component
 */
const Switch: React.FC<SwitchProps> = ({ 
  checked, 
  onChange, 
  disabled = false,
  size = 'md'
}) => {
  // Size configurations
  const sizes = {
    sm: { width: 36, height: 20, knobSize: 16, translate: 16 },
    md: { width: 44, height: 24, knobSize: 20, translate: 20 },
    lg: { width: 52, height: 28, knobSize: 24, translate: 24 },
  };

  const { width, height, knobSize, translate } = sizes[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative',
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: `${height}px`,
        border: 'none',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: checked ? '#34C759' : '#E5E5EA',
        transition: 'background-color 0.2s ease-in-out',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '50%',
          left: checked ? `${translate}px` : '2px',
          transform: 'translateY(-50%)',
          width: `${knobSize}px`,
          height: `${knobSize}px`,
          borderRadius: '50%',
          backgroundColor: '#FFFFFF',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
          transition: 'left 0.2s ease-in-out',
        }}
      />
    </button>
  );
};

export default Switch;
