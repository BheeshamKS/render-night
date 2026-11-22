// Render Night - Off-Thread Image Decoder Engine
// SPDX-License-Identifier: GPL-3.0-or-later

use std::fs::File;
use std::io::Read;
use std::path::Path;
use std::result::Result as StdResult;
use std::time::Instant;

use exr::prelude::read_first_rgba_layer_from_file;
use image::GenericImageView;

use super::lru_cache::DecodedFrame;

pub struct FrameDecoder;

impl FrameDecoder {
    /// Decodes an image file into contiguous RGBA bytes.
    /// If target_width / target_height are provided and smaller than source, downsamples during decode.
    pub fn decode_file(
        path: &Path,
        frame_number: i32,
        target_dimensions: Option<(u32, u32)>,
    ) -> StdResult<DecodedFrame, String> {
        let t0 = Instant::now();

        if !path.exists() {
            return Err(format!("File does not exist: {}", path.display()));
        }

        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let (width, height, rgba) = if ext == "exr" {
            Self::decode_exr(path)?
        } else if ext == "jpg" || ext == "jpeg" {
            Self::decode_jpeg(path)?
        } else {
            Self::decode_generic(path)?
        };

        // Downsample if target dimension is requested and source > display
        if let Some((target_w, target_h)) = target_dimensions {
            if target_w > 0 && target_h > 0 && (width > target_w || height > target_h) {
                let (new_w, new_h, downscaled) =
                    Self::downscale_rgba(width, height, &rgba, target_w, target_h);
                let duration_ms = (Instant::now() - t0).as_secs_f64() * 1000.0;
                return Ok(DecodedFrame::new(
                    frame_number,
                    new_w,
                    new_h,
                    downscaled,
                    false,
                    duration_ms,
                ));
            }
        }

        let duration_ms = (Instant::now() - t0).as_secs_f64() * 1000.0;
        Ok(DecodedFrame::new(
            frame_number,
            width,
            height,
            rgba,
            false,
            duration_ms,
        ))
    }

    fn decode_jpeg(path: &Path) -> StdResult<(u32, u32, Vec<u8>), String> {
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf).map_err(|e| e.to_string())?;

        let mut decoder = zune_jpeg::JpegDecoder::new(&buf);
        match decoder.decode() {
            Ok(pixels) => {
                let info = decoder.info().ok_or("Failed to get JPEG info")?;
                let width = info.width as u32;
                let height = info.height as u32;

                // Convert RGB to RGBA
                let mut rgba = Vec::with_capacity((width * height * 4) as usize);
                #[allow(clippy::chunks_exact_to_as_chunks)]
                for chunk in pixels.chunks_exact(3) {
                    rgba.push(chunk[0]);
                    rgba.push(chunk[1]);
                    rgba.push(chunk[2]);
                    rgba.push(255);
                }
                Ok((width, height, rgba))
            }
            Err(_) => Self::decode_generic(path),
        }
    }

    fn decode_exr(path: &Path) -> StdResult<(u32, u32, Vec<u8>), String> {
        let image = read_first_rgba_layer_from_file(
            path,
            |resolution, _| {
                let w = resolution.width();
                let h = resolution.height();
                vec![[0.0f32; 4]; w * h]
            },
            |pixel_vector, position, (r, g, b, a): (f32, f32, f32, f32)| {
                pixel_vector[position.y() * position.width() + position.x()] = [r, g, b, a];
            },
        )
        .map_err(|e| format!("EXR decode error: {}", e))?;

        let width = image.layer_data.size.width() as u32;
        let height = image.layer_data.size.height() as u32;

        let mut rgba = Vec::with_capacity((width * height * 4) as usize);
        for pixel in image.layer_data.channel_data.pixels {
            // sRGB tone map & clamp HDR float values into 8-bit RGBA
            let r = (pixel[0].clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0) as u8;
            let g = (pixel[1].clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0) as u8;
            let b = (pixel[2].clamp(0.0, 1.0).powf(1.0 / 2.2) * 255.0) as u8;
            let a = (pixel[3].clamp(0.0, 1.0) * 255.0) as u8;
            rgba.push(r);
            rgba.push(g);
            rgba.push(b);
            rgba.push(a);
        }

        Ok((width, height, rgba))
    }

    fn decode_generic(path: &Path) -> StdResult<(u32, u32, Vec<u8>), String> {
        let img = image::open(path).map_err(|e| format!("Image decode error: {}", e))?;
        let (width, height) = img.dimensions();
        let rgba = img.to_rgba8().into_raw();
        Ok((width, height, rgba))
    }

    /// Fast box/bilinear downscaling when source dimensions exceed display viewport
    pub fn downscale_rgba(
        src_w: u32,
        src_h: u32,
        src_rgba: &[u8],
        target_w: u32,
        target_h: u32,
    ) -> (u32, u32, Vec<u8>) {
        let scale_x = src_w as f32 / target_w as f32;
        let scale_y = src_h as f32 / target_h as f32;
        let scale = scale_x.max(scale_y);

        let out_w = ((src_w as f32) / scale).round().max(1.0) as u32;
        let out_h = ((src_h as f32) / scale).round().max(1.0) as u32;

        let mut out_rgba = Vec::with_capacity((out_w * out_h * 4) as usize);

        for y in 0..out_h {
            let src_y = ((y as f32 * scale).floor() as u32).min(src_h - 1);
            for x in 0..out_w {
                let src_x = ((x as f32 * scale).floor() as u32).min(src_w - 1);
                let idx = ((src_y * src_w + src_x) * 4) as usize;
                if idx + 3 < src_rgba.len() {
                    out_rgba.push(src_rgba[idx]);
                    out_rgba.push(src_rgba[idx + 1]);
                    out_rgba.push(src_rgba[idx + 2]);
                    out_rgba.push(src_rgba[idx + 3]);
                } else {
                    out_rgba.extend_from_slice(&[0, 0, 0, 255]);
                }
            }
        }

        (out_w, out_h, out_rgba)
    }
}
