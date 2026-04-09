'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { Camera, X, Loader } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { heicTo, isHeic } from 'heic-to';
import { Button } from '../ui/UI';
import { uploadAvatar, deleteAvatar } from '../../services/api';
import cropImage from '../../utils/cropImage';
import { isImageUrl } from '../../utils/avatar';
import './AvatarUpload.css';
import type { Player } from '../../types';

interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Self-contained avatar upload component with crop modal.
 *
 * Shows the current avatar (image or initials), lets the user pick a photo,
 * crop it with a circular guide, and uploads immediately on confirm.
 * Does NOT participate in parent form's unsaved-changes tracking.
 */
interface AvatarUploadProps {
  currentUserPlayer: Player;
  fetchCurrentUser?: () => Promise<void>;
}

export default function AvatarUpload({ currentUserPlayer, fetchCurrentUser }: AvatarUploadProps) {
  const [showCropModal, setShowCropModal] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<PixelCrop | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URL on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);

  const avatarUrl = currentUserPlayer?.profile_picture_url;
  const hasImage = isImageUrl(avatarUrl);

  /** Derive initials from player name. */
  const getInitials = () => {
    const name = currentUserPlayer?.full_name || '';
    const parts = name.trim().split(/\s+/);
    return parts.slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || '?';
  };

  /** Open the hidden file input. */
  const handleClickUpload = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  /** Handle file selection: validate, convert HEIC if needed, open crop modal. */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so re-selecting same file still triggers onChange
    e.target.value = '';

    setError(null);

    // Basic client-side validation
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_SIZE) {
      setError('File size exceeds 5MB limit');
      return;
    }

    let processedFile = file;

    // Convert HEIC/HEIF to JPEG for browser compatibility
    if (await isHeic(file)) {
      try {
        const convertedBlob = await heicTo({
          blob: file,
          type: 'image/jpeg',
          quality: 0.9,
        });
        processedFile = new File([convertedBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
          type: 'image/jpeg',
        });
      } catch {
        setError('Failed to convert HEIC image. Please try a JPEG or PNG file.');
        return;
      }
    }

    // Create object URL for the cropper
    const objectUrl = URL.createObjectURL(processedFile);
    setImageSrc(objectUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setShowCropModal(true);
  };

  /** Called by react-easy-crop when the crop area changes. */
  const onCropComplete = useCallback((_croppedArea: unknown, croppedAreaPx: { x: number; y: number; width: number; height: number }) => {
    setCroppedAreaPixels(croppedAreaPx);
  }, []);

  /** Crop the image, upload, and refresh user data. */
  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    setUploading(true);
    setError(null);

    try {
      const blob = await cropImage(imageSrc, croppedAreaPixels);
      await uploadAvatar(blob);
      setShowCropModal(false);
      cleanupImageSrc();
      if (fetchCurrentUser) await fetchCurrentUser();
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      const detail = (e?.response as Record<string, unknown> | undefined)?.data
        ? ((e.response as Record<string, unknown>).data as Record<string, unknown>)?.detail as string | undefined
        : undefined;
      setError(detail || (e?.message as string | undefined) || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  /** Remove avatar and revert to initials. */
  const handleRemove = async () => {
    if (!window.confirm('Remove your profile photo?')) return;
    setError(null);
    setUploading(true);
    try {
      await deleteAvatar();
      if (fetchCurrentUser) await fetchCurrentUser();
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      const detail = (e?.response as Record<string, unknown> | undefined)?.data
        ? ((e.response as Record<string, unknown>).data as Record<string, unknown>)?.detail as string | undefined
        : undefined;
      setError(detail || (e?.message as string | undefined) || 'Failed to remove avatar');
    } finally {
      setUploading(false);
    }
  };

  /** Close crop modal and clean up object URL. */
  const handleCloseCropModal = () => {
    setShowCropModal(false);
    cleanupImageSrc();
  };

  const cropDialogRef = useDialog(handleCloseCropModal, showCropModal && !!imageSrc);

  /** Revoke the object URL to prevent memory leaks. */
  const cleanupImageSrc = () => {
    if (imageSrc) {
      URL.revokeObjectURL(imageSrc);
      setImageSrc(null);
    }
  };

  return (
    <div className="avatar-upload">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* Avatar preview with edit badge */}
      <div className="avatar-upload__preview" onClick={handleClickUpload}>
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl ?? undefined} alt="Profile" className="avatar-upload__image" data-testid="avatar-image" />
        ) : (
          <div className="avatar-upload__initials" data-testid="avatar-initials">{getInitials()}</div>
        )}
        <div className="avatar-upload__edit-badge">
          <Camera size={16} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="avatar-upload__actions">
        <button className="avatar-upload__change-btn" data-testid="avatar-change-btn" onClick={handleClickUpload} disabled={uploading}>
          {hasImage ? 'Change Photo' : 'Add Photo'}
        </button>
        {hasImage && (
          <button className="avatar-upload__remove-btn" data-testid="avatar-remove-btn" onClick={handleRemove} disabled={uploading}>
            Remove Photo
          </button>
        )}
      </div>

      {/* Error message */}
      {error && <div className="avatar-upload__error">{error}</div>}

      {/* Crop modal */}
      {showCropModal && imageSrc && (
        <div className="modal-overlay" onClick={handleCloseCropModal}>
          <div ref={cropDialogRef} role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title" className="modal-content avatar-crop-modal" data-testid="avatar-crop-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 id="avatar-crop-title">Crop Photo</h2>
              <button className="modal-close" onClick={handleCloseCropModal} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <div className="avatar-crop__container">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            <div className="avatar-crop__footer">
              {uploading ? (
                <div className="avatar-crop__loading">
                  <Loader size={18} className="avatar-crop__spinner" />
                  <span>Uploading...</span>
                </div>
              ) : (
                <>
                  <Button variant="ghost" onClick={handleCloseCropModal}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave}>
                    Save
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
