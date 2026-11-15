import { Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";

/** Photo selection is local UI input; no upload or model call happens here. */
export async function pickScoresheetPhoto(
  camera: boolean,
): Promise<ImagePicker.ImagePickerAsset | null> {
  if (camera) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Camera access needed",
        "Allow camera access in Settings to photograph a scoresheet, or choose a photo from your library.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => {
              void Linking.openSettings();
            },
          },
        ],
      );
      return null;
    }
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 1,
    allowsEditing: false,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  };
  const picked = camera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  if (picked.canceled) return null;
  const asset = picked.assets[0];
  if (!asset)
    throw new Error("The photo could not be read. Please choose it again.");
  if (asset.fileSize != null && asset.fileSize > 10 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 10 MB.");
  if (
    asset.mimeType &&
    !["image/jpeg", "image/png", "image/heic", "image/heif"].includes(
      asset.mimeType,
    )
  )
    throw new Error("Choose a JPEG, PNG, or HEIC photo.");
  return asset;
}
