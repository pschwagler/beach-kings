'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Upload, Image, Camera, AlertCircle, Loader } from 'lucide-react';
import { Button } from '../ui/UI';
import { uploadMatchPhoto } from '../../services/api';
import { heicTo, isHeic } from 'heic-to';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];

/**
 * Convert HEIC/HEIF file to JPEG
 * @param {File} file - The HEIC file to convert
 * @returns {Promise<File>} - The converted JPEG file
 */
async function convertHeicToJpeg(file) {
  // heic-to API: heicTo({ blob, type, quality })
  const convertedBlob = await heicTo({
    blob: file,
    type: 'image/jpeg',
    quality: 0.9
  });
  
  // Create a new File with the original name but .jpg extension
  const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
  return new File([convertedBlob], newFileName, { type: 'image/jpeg' });
}

/**
 * Modal for uploading photos of game scores for AI processing
 */
export default function UploadPhotoModal({
  isOpen,
  onClose,
  leagueId,
  seasonId,
  onProceedToReview
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [userPrompt, setUserPrompt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUserPrompt('');
    setError(null);
    setIsUploading(false);
    setIsConverting(false);
    setDragActive(false);
  }, []);

  const handleClose = useCallback(() => {
    if (!isUploading && !isConverting) {
      resetState();
      onClose();
    }
  }, [isUploading, isConverting, onClose, resetState]);

  const validateFile = useCallback((file) => {
    if (!file) {
      return 'Please select a file';
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`;
    }

    // Check file type
    const fileType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();
    const extension = '.' + fileName.split('.').pop();

    if (!ALLOWED_TYPES.includes(fileType) && !ALLOWED_EXTENSIONS.includes(extension)) {
      return `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }

    return null;
  }, []);

  const handleFileSelect = useCallback(async (file) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    
    let processedFile = file;
    
    // Convert HEIC/HEIF to JPEG for browser compatibility
    if (await isHeic(file)) {
      setIsConverting(true);
      try {
        console.log('[UploadPhotoModal] Converting HEIC file to JPEG...');
        processedFile = await convertHeicToJpeg(file);
        console.log('[UploadPhotoModal] HEIC conversion complete:', processedFile.name);
      } catch (err) {
        console.error('[UploadPhotoModal] HEIC conversion failed:', err);
        setError('Failed to convert HEIC image. Please try a JPEG or PNG file.');
        setIsConverting(false);
        return;
      }
      setIsConverting(false);
    }
    
    setSelectedFile(processedFile);

    // Create preview URL from the processed (possibly converted) file
    const url = URL.createObjectURL(processedFile);
    setPreviewUrl(url);
  }, [validateFile]);

  const handleInputChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || isUploading) return;

    setIsUploading(true);
    setError(null);

    try {
      console.log('[UploadPhotoModal] Starting upload for league:', leagueId);
      const result = await uploadMatchPhoto(leagueId, selectedFile, userPrompt || null, seasonId || null);
      console.log('[UploadPhotoModal] Upload succeeded, job_id:', result.job_id, 'session_id:', result.session_id);
      onProceedToReview(result.job_id, result.session_id);
    } catch (err) {
      console.error('[UploadPhotoModal] Upload error:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to upload photo';
      setError(errorMessage);
      setIsUploading(false);
    }
  }, [selectedFile, isUploading, leagueId, userPrompt, seasonId, onProceedToReview]);

  const handleRemoveFile = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
  }, [previewUrl]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content upload-photo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <Camera size={20} style={{ marginRight: '8px' }} />
            Upload Score Photo
          </h2>
          <Button variant="close" onClick={handleClose} disabled={isUploading || isConverting}>
            <X size={20} />
          </Button>
        </div>

        <div className="modal-body">
          {/* Error Display */}
          {error && (
            <div className="upload-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Drop Zone / Preview */}
          {isConverting ? (
            <div className="upload-converting">
              <Loader size={48} className="converting-spinner" />
              <p className="converting-text">Converting HEIC to JPEG...</p>
              <p className="converting-hint">This may take a few seconds</p>
            </div>
          ) : !selectedFile ? (
            <div
              className={`upload-dropzone ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_EXTENSIONS.join(',')}
                onChange={handleInputChange}
                style={{ display: 'none' }}
              />
              <Upload size={48} className="upload-icon" />
              <p className="upload-text">
                Drag & drop a photo here, or click to select
              </p>
              <p className="upload-hint">
                Supports JPEG, PNG, HEIC (max 10MB)
              </p>
            </div>
          ) : (
            <div className="upload-preview">
              <div className="preview-image-container">
                <img src={previewUrl} alt="Preview" className="preview-image" />
                <button
                  className="preview-remove-btn"
                  onClick={handleRemoveFile}
                  disabled={isUploading}
                >
                  <X size={16} />
                </button>
              </div>
              <p className="preview-filename">{selectedFile.name}</p>
            </div>
          )}

          {/* Optional Prompt Input */}
          <div className="upload-prompt-section">
            <label htmlFor="user-prompt">
              Additional Context (optional)
            </label>
            <textarea
              id="user-prompt"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="E.g., 'Scores are from today's Tuesday night session' or 'Player names might be abbreviated'"
              rows={2}
              disabled={isUploading}
            />
          </div>

          {/* Info Box */}
          <div className="upload-info">
            <Image size={16} />
            <span>
              Upload a photo of scores from a whiteboard, paper, or spreadsheet. 
              AI will extract the games and match players to league members.
            </span>
          </div>
        </div>

        <div className="modal-actions">
          <Button onClick={handleClose} disabled={isUploading || isConverting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleUpload}
            disabled={!selectedFile || isUploading || isConverting}
          >
            {isUploading ? 'Uploading...' : 'Upload & Process'}
          </Button>
        </div>
      </div>

      <style jsx>{`
        .upload-photo-modal {
          max-width: 500px;
        }

        .upload-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: var(--error-bg, #fef2f2);
          color: var(--error-text, #dc2626);
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }

        .upload-dropzone {
          border: 2px dashed var(--border-color, #e5e7eb);
          border-radius: 12px;
          padding: 40px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: var(--bg-secondary, #f9fafb);
        }

        .upload-dropzone:hover,
        .upload-dropzone.drag-active {
          border-color: var(--primary-color, #3b82f6);
          background: var(--primary-bg-light, #eff6ff);
        }

        .upload-converting {
          border: 2px dashed var(--border-color, #e5e7eb);
          border-radius: 12px;
          padding: 40px 20px;
          text-align: center;
          background: var(--bg-secondary, #f9fafb);
        }

        .converting-spinner {
          color: var(--primary-color, #3b82f6);
          margin-bottom: 12px;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .converting-text {
          font-size: 16px;
          color: var(--text-primary, #374151);
          margin: 0 0 4px 0;
        }

        .converting-hint {
          font-size: 13px;
          color: var(--text-muted, #9ca3af);
          margin: 0;
        }

        .upload-icon {
          color: var(--text-muted, #9ca3af);
          margin-bottom: 12px;
        }

        .upload-text {
          font-size: 16px;
          color: var(--text-primary, #374151);
          margin: 0 0 4px 0;
        }

        .upload-hint {
          font-size: 13px;
          color: var(--text-muted, #9ca3af);
          margin: 0;
        }

        .upload-preview {
          text-align: center;
        }

        .preview-image-container {
          position: relative;
          display: inline-block;
          max-width: 100%;
        }

        .preview-image {
          max-width: 100%;
          max-height: 300px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .preview-remove-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: none;
          background: rgba(0, 0, 0, 0.6);
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }

        .preview-remove-btn:hover {
          background: rgba(0, 0, 0, 0.8);
        }

        .preview-remove-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .preview-filename {
          font-size: 13px;
          color: var(--text-muted, #9ca3af);
          margin-top: 8px;
          word-break: break-all;
        }

        .upload-prompt-section {
          margin-top: 20px;
        }

        .upload-prompt-section label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary, #374151);
          margin-bottom: 6px;
        }

        .upload-prompt-section textarea {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color, #e5e7eb);
          border-radius: 8px;
          font-size: 14px;
          resize: vertical;
          min-height: 60px;
          font-family: inherit;
        }

        .upload-prompt-section textarea:focus {
          outline: none;
          border-color: var(--primary-color, #3b82f6);
          box-shadow: 0 0 0 3px var(--primary-bg-light, rgba(59, 130, 246, 0.1));
        }

        .upload-prompt-section textarea:disabled {
          background: var(--bg-secondary, #f9fafb);
          cursor: not-allowed;
        }

        .upload-info {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 12px;
          background: var(--info-bg, #eff6ff);
          border-radius: 8px;
          margin-top: 16px;
          font-size: 13px;
          color: var(--info-text, #1e40af);
        }

        .upload-info svg {
          flex-shrink: 0;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}
