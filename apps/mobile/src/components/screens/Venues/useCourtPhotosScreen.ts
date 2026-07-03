/**
 * Data hook for the Court Photos gallery screen.
 *
 * Fetches the photo list for a court, derives a header (court name +
 * address) from the court detail endpoint, and exposes an upload helper
 * that picks an image and POSTs it to the backend.
 */

import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { Court, CourtPhoto } from '@beach-kings/shared';

export interface CourtPhotosHeader {
  readonly id: number | null;
  readonly name: string;
  readonly address: string | null;
}

export interface UseCourtPhotosScreenResult {
  readonly photos: readonly CourtPhoto[];
  readonly header: CourtPhotosHeader;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly isUploading: boolean;
  readonly uploadError: Error | null;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
  readonly onUploadPhoto: (caption?: string) => Promise<void>;
}

interface PhotosScreenData {
  readonly court: Court | null;
  readonly photos: readonly CourtPhoto[];
}

function buildHeader(court: Court | null): CourtPhotosHeader {
  if (court == null) {
    return { id: null, name: 'Court Photos', address: null };
  }
  const cityState = [court.city, court.state].filter(Boolean).join(', ');
  const address =
    court.address != null && court.address.length > 0
      ? cityState.length > 0
        ? `${court.address} · ${cityState}`
        : court.address
      : cityState.length > 0
        ? cityState
        : null;
  return {
    id: typeof court.id === 'string' ? Number(court.id) : court.id,
    name: court.name ?? 'Court Photos',
    address,
  };
}

/**
 * Fetches photos + court header for a court by id or slug.
 *
 * The court detail call is best-effort: if it fails we still render the
 * photos with a generic header rather than blocking the gallery.
 */
export function useCourtPhotosScreen(
  idOrSlug: number | string,
): UseCourtPhotosScreenResult {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<Error | null>(null);

  const { data, isLoading, error, refetch } = useApi<PhotosScreenData>(
    async () => {
      const [photos, court] = await Promise.all([
        api.getCourtPhotos(idOrSlug),
        api.getCourtById(idOrSlug).catch(() => null as Court | null),
      ]);
      return { photos, court };
    },
    [idOrSlug],
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    void refetch().finally(() => setIsRefreshing(false));
  }, [refetch]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const onUploadPhoto = useCallback(
    async (caption?: string) => {
      setUploadError(null);
      const courtId =
        data?.court != null
          ? typeof data.court.id === 'string'
            ? Number(data.court.id)
            : data.court.id
          : typeof idOrSlug === 'string'
            ? Number(idOrSlug)
            : idOrSlug;
      if (!Number.isFinite(courtId)) {
        const err = new Error('Cannot upload — court id is not numeric');
        setUploadError(err);
        throw err;
      }

      // No media-library permission request: the system photo picker
      // (iOS PHPickerViewController / Android Photo Picker) runs out-of-process
      // and returns only the user-selected asset, so it needs no permission.
      // Gating on requestMediaLibraryPermissionsAsync would needlessly block
      // users on "Limited Access" without improving privacy.
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
      });
      if (picked.canceled || picked.assets.length === 0) return;

      const asset = picked.assets[0];
      const filename =
        asset.fileName ?? asset.uri.split('/').pop() ?? `court-${Date.now()}.jpg`;
      const inferredType =
        asset.mimeType ?? (filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
      const file = { uri: asset.uri, name: filename, type: inferredType };

      setIsUploading(true);
      try {
        await api.uploadCourtPhoto(courtId as number, file, caption);
        await refetch();
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error('Upload failed');
        setUploadError(wrapped);
        throw wrapped;
      } finally {
        setIsUploading(false);
      }
    },
    [data, idOrSlug, refetch],
  );

  return {
    photos: data?.photos ?? [],
    header: buildHeader(data?.court ?? null),
    isLoading,
    error,
    isRefreshing,
    isUploading,
    uploadError,
    onRefresh,
    onRetry,
    onUploadPhoto,
  };
}
