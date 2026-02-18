'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { useAuthModal } from '../../../../src/contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../../../../src/contexts/ModalContext';
import { getUserLeagues, createLeague, uploadCourtPhoto } from '../../../../src/services/api';
import NavBar from '../../../../src/components/layout/NavBar';
import { Button } from '../../../../src/components/ui/UI';
import { ArrowLeft, Camera, X } from 'lucide-react';
import '../../../../src/components/court/CourtDetail.css';
import './CourtPhotos.css';

/**
 * Client component for the court photos page.
 * Displays a full grid of all photos (court photos + review photos)
 * and an upload form for adding new photos.
 */
export default function CourtPhotosClient({ court, slug }) {
  const router = useRouter();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  const [userLeagues, setUserLeagues] = useState([]);
  const [photos, setPhotos] = useState(court?.all_photos || []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    getUserLeagues()
      .then(setUserLeagues)
      .catch((err) => console.error('Error loading user leagues:', err));
  }, [isAuthenticated]);

  const handleSignOut = async () => {
    try { await logout(); } catch (e) { console.error('Logout error:', e); }
    router.push('/');
  };

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (action === 'view-league' && leagueId) {
      router.push(`/league/${leagueId}`);
    } else if (action === 'create-league') {
      openModal(MODAL_TYPES.CREATE_LEAGUE, {
        onSubmit: async (leagueData) => {
          const newLeague = await createLeague(leagueData);
          setUserLeagues(await getUserLeagues());
          router.push(`/league/${newLeague.id}?tab=details`);
        },
      });
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadError('');
  };

  const handleCancelPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile || !court?.id) return;
    setUploading(true);
    setUploadError('');
    try {
      const newPhoto = await uploadCourtPhoto(court.id, selectedFile);
      setPhotos((prev) => [newPhoto, ...prev]);
      handleCancelPreview();
    } catch (err) {
      setUploadError(err.response?.data?.detail || 'Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const navProps = {
    isLoggedIn: isAuthenticated,
    user,
    currentUserPlayer,
    userLeagues,
    onLeaguesMenuClick: handleLeaguesMenuClick,
    onSignOut: handleSignOut,
    onSignIn: () => openAuthModal('sign-in'),
    onSignUp: () => openAuthModal('sign-up'),
  };

  if (!court) {
    return (
      <>
        <NavBar {...navProps} />
        <div className="court-detail court-detail--not-found">
          <h1>Court Not Found</h1>
          <p>The court you&apos;re looking for doesn&apos;t exist or has been removed.</p>
          <a href="/courts">Browse all courts</a>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar {...navProps} />

      <div className="court-detail">
        <a href={`/courts/${slug}`} className="court-detail__back-link">
          <ArrowLeft size={18} /> Return to court
        </a>

        <div className="court-photos__header">
          <div>
            <h1 className="court-photos__title">{court.name}</h1>
            {court.address && (
              <p className="court-photos__subtitle">{court.address}</p>
            )}
          </div>
          <Button
            variant="default"
            size="small"
            onClick={() => {
              if (!isAuthenticated) {
                openAuthModal('sign-in');
                return;
              }
              fileInputRef.current?.click();
            }}
          >
            <Camera size={14} /> Add Photos
          </Button>
        </div>

        <p className="court-photos__guidance">
          Add photos that help other players get an idea of the courts. Avoid adding photos of people.
        </p>

        {/* Upload preview */}
        {previewUrl && (
          <div className="court-photos__upload-preview">
            <div className="court-photos__preview-wrapper">
              <img src={previewUrl} alt="Upload preview" className="court-photos__preview-img" />
              <button
                className="court-photos__preview-remove"
                onClick={handleCancelPreview}
                aria-label="Remove selected photo"
              >
                <X size={14} />
              </button>
            </div>
            <div className="court-photos__upload-actions">
              <Button
                variant="default"
                size="small"
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? 'Uploading...' : 'Upload Photo'}
              </Button>
              <Button variant="ghost" size="small" onClick={handleCancelPreview}>
                Cancel
              </Button>
            </div>
            {uploadError && <p className="court-photos__error">{uploadError}</p>}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {/* Photo grid */}
        {photos.length > 0 ? (
          <div className="court-photos__grid">
            {photos.map((photo) => (
              <img
                key={photo.id}
                src={photo.url}
                alt="Court photo"
                className="court-photos__grid-img"
                loading="lazy"
              />
            ))}
          </div>
        ) : (
          <div className="court-photos__empty">
            <p>No photos yet. Be the first to add one!</p>
          </div>
        )}
      </div>
    </>
  );
}
