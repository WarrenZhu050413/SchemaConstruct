/**
 * FontSizeSelector component
 * Provides UI for selecting text size (Small, Medium, Large)
 * Uses button group with A⁻ A A⁺ icons
 */

import React from 'react';
import { useFontSize } from '@/shared/hooks/useFontSize';
import type { FontSize } from '@/types/settings';

export const FontSizeSelector: React.FC = () => {
  const { fontSize, setFontSize } = useFontSize();

  const handleSizeChange = async (size: FontSize) => {
    try {
      await setFontSize(size);
    } catch (error) {
      console.error('[FontSizeSelector] Error changing font size:', error);
    }
  };

  return (
    <div style={styles.container} data-testid="font-size-selector">
      <button
        type="button"
        onClick={() => handleSizeChange('small')}
        style={{
          ...styles.button,
          ...(fontSize === 'small' ? styles.active : {}),
        }}
        title="Small text"
        data-testid="font-size-small"
        aria-pressed={fontSize === 'small'}
        data-active={fontSize === 'small' ? 'true' : 'false'}
      >
        A⁻
      </button>
      <button
        type="button"
        onClick={() => handleSizeChange('medium')}
        style={{
          ...styles.button,
          ...(fontSize === 'medium' ? styles.active : {}),
        }}
        title="Medium text (default)"
        data-testid="font-size-medium"
        aria-pressed={fontSize === 'medium'}
        data-active={fontSize === 'medium' ? 'true' : 'false'}
      >
        A
      </button>
      <button
        type="button"
        onClick={() => handleSizeChange('large')}
        style={{
          ...styles.button,
          ...(fontSize === 'large' ? styles.active : {}),
        }}
        title="Large text"
        data-testid="font-size-large"
        aria-pressed={fontSize === 'large'}
        data-active={fontSize === 'large' ? 'true' : 'false'}
      >
        A⁺
      </button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
  button: {
    width: '28px',
    height: '28px',
    padding: '0',
    border: '1px solid rgba(184, 156, 130, 0.3)',
    background: 'rgba(255, 255, 255, 0.8)',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 600,
    color: '#5C4D42',
    transition: 'all 0.2s ease',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  active: {
    background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.3), rgba(255, 215, 0, 0.3))',
    border: '1px solid rgba(212, 175, 55, 0.6)',
    color: '#3E3226',
    boxShadow: '0 0 0 1px rgba(212, 175, 55, 0.4)',
  },
};
