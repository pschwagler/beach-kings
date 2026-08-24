#!/usr/bin/env python3
"""Generate the Beach League mobile raster brand kit from source artwork."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image


MOBILE_ROOT = Path(__file__).resolve().parents[1]
BRAND_ROOT = MOBILE_ROOT / "assets" / "brand"
SOURCE_ROOT = BRAND_ROOT / "source"
RESAMPLE = Image.Resampling.LANCZOS


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def smoothstep(value: np.ndarray) -> np.ndarray:
    value = np.clip(value, 0.0, 1.0)
    return value * value * (3.0 - 2.0 * value)


def remove_flat_background(
    image: Image.Image,
    background: tuple[int, int, int],
    transparent_distance: float,
    opaque_distance: float,
) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    distance = np.linalg.norm(rgb - np.asarray(background, dtype=np.float32), axis=2)
    alpha = smoothstep(
        (distance - transparent_distance) / (opaque_distance - transparent_distance)
    )
    alpha[alpha < 0.02] = 0

    rgba = np.empty((*rgb.shape[:2], 4), dtype=np.uint8)
    rgba[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    rgba[..., 3] = np.round(alpha * 255).astype(np.uint8)
    rgba[rgba[..., 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def crop_alpha(image: Image.Image, padding: int) -> Image.Image:
    alpha = np.asarray(image.getchannel("A"))
    ys, xs = np.nonzero(alpha > 8)
    if not len(xs):
        raise ValueError("Cannot crop an image with no visible pixels")

    left = max(0, int(xs.min()) - padding)
    top = max(0, int(ys.min()) - padding)
    right = min(image.width, int(xs.max()) + padding + 1)
    bottom = min(image.height, int(ys.max()) + padding + 1)
    return image.crop((left, top, right, bottom))


def resize_rgba(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Resize RGBA artwork in premultiplied space to avoid dark edge halos."""
    rgba = np.asarray(image.convert("RGBA"), dtype=np.float32) / 255.0
    alpha = rgba[..., 3:4]
    premultiplied = rgba[..., :3] * alpha

    resized_channels = []
    for channel in range(3):
        plane = Image.fromarray(premultiplied[..., channel], mode="F")
        resized_channels.append(np.asarray(plane.resize(size, RESAMPLE), dtype=np.float32))

    alpha_plane = Image.fromarray(alpha[..., 0], mode="F")
    resized_alpha = np.asarray(alpha_plane.resize(size, RESAMPLE), dtype=np.float32)
    resized_premultiplied = np.stack(resized_channels, axis=2)
    safe_alpha = np.maximum(resized_alpha[..., None], 1e-6)
    resized_rgb = np.where(
        resized_alpha[..., None] > 0,
        resized_premultiplied / safe_alpha,
        0,
    )

    output = np.empty((*size[::-1], 4), dtype=np.uint8)
    output[..., :3] = np.round(np.clip(resized_rgb, 0, 1) * 255).astype(np.uint8)
    output[..., 3] = np.round(np.clip(resized_alpha, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(output, "RGBA")


def fit_within(image: Image.Image, width: int, height: int) -> Image.Image:
    scale = min(width / image.width, height / image.height)
    target = (
        max(1, round(image.width * scale)),
        max(1, round(image.height * scale)),
    )
    return resize_rgba(image, target)


def centered_canvas(image: Image.Image, size: int, content_size: int) -> Image.Image:
    fitted = fit_within(image, content_size, content_size)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(
        fitted,
        ((size - fitted.width) // 2, (size - fitted.height) // 2),
    )
    return canvas


def create_launcher_master(original: Image.Image, generated: Image.Image) -> Image.Image:
    """Keep the original logo pixels while borrowing only a full-bleed navy edge."""
    base = generated.convert("RGB").resize((1024, 1024), RESAMPLE)
    source = original.convert("RGB").resize((1024, 1024), RESAMPLE)

    yy, xx = np.mgrid[0:1024, 0:1024]
    radius = np.sqrt((xx - 511.5) ** 2 + (yy - 511.5) ** 2)
    blend = 1.0 - smoothstep((radius - 420.0) / 50.0)
    blend = blend[..., None]

    source_rgb = np.asarray(source, dtype=np.float32)
    base_rgb = np.asarray(base, dtype=np.float32)
    composited = source_rgb * blend + base_rgb * (1.0 - blend)
    return Image.fromarray(np.round(composited).astype(np.uint8), "RGB")


def create_gold_mark(original: Image.Image) -> Image.Image:
    rgb = np.asarray(original.convert("RGB"), dtype=np.float32)
    navy = np.asarray((10, 42, 67), dtype=np.float32)
    distance = np.linalg.norm(rgb - navy, axis=2)

    yy, xx = np.mgrid[0 : original.height, 0 : original.width]
    inside_emblem = (xx - original.width / 2) ** 2 + (
        yy - original.height / 2
    ) ** 2 <= 455**2
    alpha = smoothstep((distance - 16.0) / 58.0) * inside_emblem

    rgba = np.empty((*rgb.shape[:2], 4), dtype=np.uint8)
    rgba[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    rgba[..., 3] = np.round(alpha * 255).astype(np.uint8)
    rgba[rgba[..., 3] == 0, :3] = 0
    return crop_alpha(Image.fromarray(rgba, "RGBA"), padding=24)


def export_widths(image: Image.Image, widths: tuple[int, ...], stem: str) -> None:
    output_dir = BRAND_ROOT / "lockups"
    for width in widths:
        height = max(1, round(image.height * width / image.width))
        save_png(resize_rgba(image, (width, height)), output_dir / f"{stem}-{width}.png")


def export_marks(image: Image.Image, sizes: tuple[int, ...], stem: str) -> None:
    output_dir = BRAND_ROOT / "marks"
    for size in sizes:
        save_png(centered_canvas(image, size, round(size * 0.9)), output_dir / f"{stem}-{size}.png")


def main() -> None:
    original_icon = Image.open(SOURCE_ROOT / "app-icon-original.png")
    generated_icon = Image.open(SOURCE_ROOT / "app-icon-full-bleed-generated.png")
    light_lockup_source = Image.open(SOURCE_ROOT / "lockup-light-original.png")
    dark_lockup_source = Image.open(SOURCE_ROOT / "lockup-dark-original.png")

    launcher = create_launcher_master(original_icon, generated_icon)
    for size in (1024, 512, 256):
        save_png(
            launcher.resize((size, size), RESAMPLE),
            BRAND_ROOT / "launcher" / f"app-icon-{size}.png",
        )
    save_png(
        launcher.resize((48, 48), RESAMPLE),
        MOBILE_ROOT / "assets" / "favicon.png",
    )
    ios_icon = (
        MOBILE_ROOT
        / "ios"
        / "BeachLeague"
        / "Images.xcassets"
        / "AppIcon.appiconset"
        / "App-Icon-1024x1024@1x.png"
    )
    if ios_icon.parent.exists():
        save_png(launcher, ios_icon)

    gold_mark = create_gold_mark(original_icon)
    save_png(
        centered_canvas(gold_mark, 1024, 640),
        BRAND_ROOT / "launcher" / "adaptive-foreground-1024.png",
    )
    splash_mark = centered_canvas(gold_mark, 1024, 700)
    save_png(splash_mark, BRAND_ROOT / "splash" / "splash-mark-1024.png")
    ios_splash_dir = (
        MOBILE_ROOT
        / "ios"
        / "BeachLeague"
        / "Images.xcassets"
        / "SplashScreenLogo.imageset"
    )
    if ios_splash_dir.exists():
        for filename in ("image.png", "image@2x.png", "image@3x.png"):
            save_png(splash_mark, ios_splash_dir / filename)

    for size in (64, 128, 256, 512, 1024):
        save_png(
            launcher.resize((size, size), RESAMPLE),
            BRAND_ROOT / "tiles" / f"brand-tile-{size}.png",
        )

    light_lockup = crop_alpha(
        remove_flat_background(light_lockup_source, (253, 252, 250), 8, 42),
        padding=24,
    )
    dark_lockup = crop_alpha(
        remove_flat_background(dark_lockup_source, (6, 36, 61), 10, 44),
        padding=24,
    )
    save_png(light_lockup, BRAND_ROOT / "lockups" / "lockup-on-light-master.png")
    save_png(dark_lockup, BRAND_ROOT / "lockups" / "lockup-on-dark-master.png")
    export_widths(light_lockup, (320, 480, 640, 960, 1280), "lockup-on-light")
    export_widths(dark_lockup, (320, 480, 640, 960, 1280), "lockup-on-dark")

    light_mark = crop_alpha(
        remove_flat_background(light_lockup_source.crop((40, 70, 470, 540)), (253, 252, 250), 8, 42),
        padding=12,
    )
    dark_mark = crop_alpha(
        remove_flat_background(dark_lockup_source.crop((40, 70, 470, 540)), (6, 36, 61), 10, 44),
        padding=12,
    )
    export_marks(light_mark, (48, 64, 96, 128, 256, 512), "mark-on-light")
    export_marks(dark_mark, (48, 64, 96, 128, 256, 512), "mark-on-dark")


if __name__ == "__main__":
    main()
