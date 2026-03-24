/**
 * Canvas helper to extract a cropped region from an image as a JPEG blob.
 *
 * Used by AvatarUpload to apply the crop area selected via react-easy-crop.
 *
 * @param {string} imageSrc - Object URL or data URL of the source image
 * @param {Object} pixelCrop - Crop area in pixels { x, y, width, height }
 * @param {number} [outputSize=512] - Output image dimension (square)
 * @returns {Promise<Blob>} - JPEG blob of the cropped image
 */
export default function cropImage(imageSrc, pixelCrop, outputSize = 512) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');

      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        outputSize,
        outputSize
      );

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob returned null'));
          }
        },
        'image/jpeg',
        0.9
      );
    };
    image.onerror = () => reject(new Error('Failed to load image for cropping'));
    image.src = imageSrc;
  });
}
