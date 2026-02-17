import { test, expect } from '../fixtures/test-fixtures.js';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';

/**
 * E2E tests for the profile edit tab on /home?tab=profile.
 *
 * Uses `testUser` (profile already completed) + `authedPage` (tokens injected).
 * Tests viewing, editing, saving profile fields, and avatar upload/delete.
 */

/**
 * Navigate to the Profile tab from the authed home page.
 */
async function openProfileTab(page) {
  await page.click('[data-testid="profile-tab"]');
  await page.waitForSelector('.profile-page__form', { timeout: 15000 });
}

/**
 * Create a 200x200 red PNG in a temp file for avatar upload tests.
 * Large enough for react-easy-crop to produce valid crop coordinates.
 * Returns the absolute path to the file.
 */
function createTestImage() {
  const width = 200;
  const height = 200;

  // Build raw scanline data: filter byte (0) + RGB pixels per row
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 3);
    rawData[rowOffset] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 3;
      rawData[px] = 255;     // R
      rawData[px + 1] = 0;   // G
      rawData[px + 2] = 0;   // B
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // Helper to write a 4-byte big-endian unsigned int
  function writeUInt32BE(buf, value, offset) {
    buf[offset] = (value >>> 24) & 0xff;
    buf[offset + 1] = (value >>> 16) & 0xff;
    buf[offset + 2] = (value >>> 8) & 0xff;
    buf[offset + 3] = value & 0xff;
  }

  // Build PNG file
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  writeUInt32BE(ihdrData, width, 0);
  writeUInt32BE(ihdrData, height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = buildChunk('IHDR', ihdrData);

  // IDAT chunk
  const idatChunk = buildChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = buildChunk('IEND', Buffer.alloc(0));

  function buildChunk(type, data) {
    const chunk = Buffer.alloc(4 + 4 + data.length + 4);
    writeUInt32BE(chunk, data.length, 0);
    chunk.write(type, 4, 4, 'ascii');
    data.copy(chunk, 8);
    // CRC32 over type + data
    const crcBuf = Buffer.alloc(4 + data.length);
    chunk.copy(crcBuf, 0, 4, 8 + data.length);
    const crc = crc32(crcBuf);
    writeUInt32BE(chunk, crc, 8 + data.length);
    return chunk;
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const pngBuffer = Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  const tmpPath = path.join(process.cwd(), 'tests', 'e2e', 'profile', 'test-avatar.png');
  fs.writeFileSync(tmpPath, pngBuffer);
  return tmpPath;
}

test.describe('Edit Profile Tab', () => {
  test('view profile tab shows current values', async ({ authedPage }) => {
    const page = authedPage;
    await openProfileTab(page);

    // Account info section
    await expect(page.locator('text=Account Information')).toBeVisible();

    // Player profile section
    await expect(page.locator('text=Player Profile')).toBeVisible();

    // Form fields should be populated with values from completeTestUserProfile
    await expect(page.locator('select[name="gender"]')).toHaveValue('male');
    await expect(page.locator('select[name="level"]')).toHaveValue('intermediate');
    await expect(page.locator('select[name="location_id"]')).toHaveValue('socal_sd');

    // Full name should be filled
    const fullName = page.locator('input[name="full_name"]');
    await expect(fullName).toBeVisible();
    await expect(fullName).not.toHaveValue('');

    // Save button should exist but be disabled (no changes yet)
    const saveBtn = page.locator('button.save-button');
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toContainText('Save Changes');
  });

  test('edit profile fields and save', async ({ authedPage }) => {
    const page = authedPage;
    await openProfileTab(page);

    // Change skill level
    await page.locator('select[name="level"]').selectOption('advanced');

    // Change preferred side
    await page.locator('select[name="preferred_side"]').selectOption('right');

    // Save button should now be enabled
    const saveBtn = page.locator('button.save-button');
    await expect(saveBtn).toBeEnabled();

    // Click save
    await saveBtn.click();

    // "Saved!" state should appear (checkmark icon + text change)
    await expect(saveBtn).toContainText('Saved!', { timeout: 10000 });

    // Reload to verify persistence
    const authMePromise = page.waitForResponse(
      resp => resp.url().includes('/api/auth/me'),
      { timeout: 15000 },
    );
    await page.reload();
    await authMePromise;

    await openProfileTab(page);

    // Values should persist
    await expect(page.locator('select[name="level"]')).toHaveValue('advanced');
    await expect(page.locator('select[name="preferred_side"]')).toHaveValue('right');
  });

  test('upload avatar via crop modal', async ({ authedPage }) => {
    const page = authedPage;
    await openProfileTab(page);

    // Mock avatar upload API (S3 not available in test env)
    await page.route('**/api/users/me/avatar', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ profile_picture_url: 'https://test-bucket.s3.amazonaws.com/test-avatar.jpg' }),
      });
    });

    // Create a test image file
    const imgPath = createTestImage();

    try {
      // Click "Add Photo" button to trigger file input
      const addPhotoBtn = page.locator('[data-testid="avatar-change-btn"]');
      await expect(addPhotoBtn).toBeVisible({ timeout: 10000 });

      // Set up file chooser listener before clicking
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        addPhotoBtn.click(),
      ]);
      await fileChooser.setFiles(imgPath);

      // Crop modal should appear
      const cropModal = page.locator('[data-testid="avatar-crop-modal"]');
      await expect(cropModal).toBeVisible({ timeout: 10000 });

      // Click "Save" in the crop modal to upload
      await cropModal.locator('button', { hasText: 'Save' }).click();

      // Wait for modal to close (upload complete)
      await expect(cropModal).toBeHidden({ timeout: 30000 });

      // Avatar image should now be visible (not initials)
      await expect(page.locator('[data-testid="avatar-image"]')).toBeVisible({ timeout: 10000 });
    } finally {
      // Clean up temp file
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
  });

  test('delete avatar reverts to initials', async ({ authedPage }) => {
    const page = authedPage;
    await openProfileTab(page);

    // Mock avatar API (S3 not available in test env)
    await page.route('**/api/users/me/avatar', route => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Avatar deleted' }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ profile_picture_url: 'https://test-bucket.s3.amazonaws.com/test-avatar.jpg' }),
        });
      }
    });

    // First check if avatar exists; if not, upload one
    const avatarImage = page.locator('[data-testid="avatar-image"]');
    const removeBtn = page.locator('[data-testid="avatar-remove-btn"]');

    // If no avatar exists, upload one first
    if (!(await removeBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      const imgPath = createTestImage();
      try {
        const addPhotoBtn = page.locator('[data-testid="avatar-change-btn"]');
        const [fileChooser] = await Promise.all([
          page.waitForEvent('filechooser'),
          addPhotoBtn.click(),
        ]);
        await fileChooser.setFiles(imgPath);
        const cropModal = page.locator('[data-testid="avatar-crop-modal"]');
        await expect(cropModal).toBeVisible({ timeout: 10000 });
        await cropModal.locator('button', { hasText: 'Save' }).click();
        await expect(cropModal).toBeHidden({ timeout: 30000 });
        await expect(avatarImage).toBeVisible({ timeout: 10000 });
      } finally {
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      }
    }

    // Now remove the avatar
    await expect(removeBtn).toBeVisible({ timeout: 10000 });
    await removeBtn.click();

    // Avatar image should disappear, initials should show
    await expect(avatarImage).toBeHidden({ timeout: 15000 });
    await expect(page.locator('[data-testid="avatar-initials"]')).toBeVisible({ timeout: 10000 });
  });
});
