/**
 * ImageUploadZone Component - Drag and drop zone for images
 *
 * Wraps content and provides drag-and-drop image upload functionality
 */

import React, { useState, useCallback, DragEvent } from 'react';

export interface ImageUploadZoneProps {
  onImageUpload: (file: File) => Promise<void>;
  children?: React.ReactNode;
  overlay?: boolean; // Show overlay on drag-over
  disabled?: boolean;
}

export const ImageUploadZone: React.FC<ImageUploadZoneProps> = ({
  onImageUpload,
  children,
  overlay = true,
  disabled = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    // Check if dragging files
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Only set to false if leaving the zone entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      console.warn('[ImageUploadZone] No image files found in drop');
      return;
    }

    // Upload first image file
    const file = imageFiles[0];
    try {
      await onImageUpload(file);
      console.log('[ImageUploadZone] Image uploaded:', file.name);
    } catch (error) {
      console.error('[ImageUploadZone] Upload failed:', error);
    }
  }, [onImageUpload, disabled]);

  return (
    <div
      className="nabokov-image-upload-zone"
      data-testid="image-upload-zone"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={styles.container}
    >
      {children}

      {/* Overlay shown when dragging */}
      {overlay && isDragging && (
        <div style={styles.overlay}>
          <div style={styles.overlayContent}>
            <div style={styles.overlayIcon}>📁</div>
            <div style={styles.overlayText}>Drop image to upload</div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(44, 62, 80, 0.95)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999999,
    pointerEvents: 'none',
  },
  overlayContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  overlayIcon: {
    fontSize: '64px',
    animation: 'bounce 0.6s infinite',
  },
  overlayText: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#FFD700',
    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
  },
};
