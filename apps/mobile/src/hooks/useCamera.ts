/**
 * Hook for camera and photo library access
 */

import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export function useCamera() {
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function requestPermissions() {
    if (Platform.OS !== 'web') {
      const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
      const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (cameraStatus !== 'granted' || mediaStatus !== 'granted') {
        alert('Sorry, we need camera and media library permissions!');
        return false;
      }
    }
    return true;
  }

  async function takePhoto() {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return null;

    setIsLoading(true);
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setImage(result.assets[0].uri);
        return result.assets[0].uri;
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      alert('Error taking photo');
    } finally {
      setIsLoading(false);
    }
    return null;
  }

  async function pickImage() {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return null;

    setIsLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setImage(result.assets[0].uri);
        return result.assets[0].uri;
      }
    } catch (error) {
      console.error('Error picking image:', error);
      alert('Error picking image');
    } finally {
      setIsLoading(false);
    }
    return null;
  }

  function clearImage() {
    setImage(null);
  }

  return {
    image,
    isLoading,
    takePhoto,
    pickImage,
    clearImage,
  };
}

