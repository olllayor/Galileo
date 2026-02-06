#![allow(unexpected_cfgs)]

use base64::engine::general_purpose;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveBackgroundArgs {
    pub image_base64: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveBackgroundResult {
    pub mask_png_base64: String,
    pub width: u32,
    pub height: u32,
    pub revision: Option<i32>,
}

#[tauri::command]
pub fn remove_background(args: RemoveBackgroundArgs) -> Result<RemoveBackgroundResult, String> {
    #[cfg(target_os = "macos")]
    {
        remove_background_macos(args)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = args;
        Err("unsupported_platform".to_string())
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{RemoveBackgroundArgs, RemoveBackgroundResult};
    use image::{ImageBuffer, ImageFormat, Luma, Rgba};
    use objc::rc::autoreleasepool;
    use objc::runtime::{Object, BOOL, NO};
    use base64::Engine;
    use objc::{class, msg_send, sel, sel_impl};
    use std::ffi::CStr;
    use std::io::Cursor;
    use std::os::raw::{c_char, c_void};
    use std::ptr;

    #[link(name = "Foundation", kind = "framework")]
    extern "C" {}

    #[link(name = "Vision", kind = "framework")]
    extern "C" {}

    #[link(name = "ImageIO", kind = "framework")]
    extern "C" {}

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {}

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(cf: *const c_void);
    }

    type CFTypeRef = *const c_void;
    type CFDataRef = *const c_void;
    type CFDictionaryRef = *const c_void;
    type CGImageSourceRef = *const c_void;
    type CGImageRef = *const c_void;

    extern "C" {
        fn CGImageSourceCreateWithData(data: CFDataRef, options: CFDictionaryRef) -> CGImageSourceRef;
        fn CGImageSourceCreateImageAtIndex(source: CGImageSourceRef, index: usize, options: CFDictionaryRef) -> CGImageRef;
        fn CGImageGetWidth(image: CGImageRef) -> usize;
        fn CGImageGetHeight(image: CGImageRef) -> usize;
    }

    #[link(name = "CoreVideo", kind = "framework")]
    extern "C" {
        fn CVPixelBufferLockBaseAddress(pixel_buffer: *mut c_void, lock_flags: u64) -> i32;
        fn CVPixelBufferUnlockBaseAddress(pixel_buffer: *mut c_void, lock_flags: u64) -> i32;
        fn CVPixelBufferGetWidth(pixel_buffer: *const c_void) -> usize;
        fn CVPixelBufferGetHeight(pixel_buffer: *const c_void) -> usize;
        fn CVPixelBufferGetBytesPerRow(pixel_buffer: *const c_void) -> usize;
        fn CVPixelBufferGetBaseAddress(pixel_buffer: *mut c_void) -> *mut c_void;
    }

    const PIXEL_BUFFER_LOCK_READONLY: u64 = 0;

    pub fn remove_background_macos(args: RemoveBackgroundArgs) -> Result<RemoveBackgroundResult, String> {
        let bytes = super::general_purpose::STANDARD
            .decode(args.image_base64)
            .map_err(|e| format!("Failed to decode image bytes: {e}"))?;

        let (target_width, target_height) =
            decode_image_dimensions(&bytes).map_err(|e| format!("Failed to decode image: {e}"))?;

        let (mask, mask_width, mask_height, revision) =
            unsafe { generate_mask_from_vision(&bytes)? };

        let scaled_mask = if mask_width != target_width || mask_height != target_height {
            let mask_img: ImageBuffer<Luma<u8>, Vec<u8>> =
                ImageBuffer::from_raw(mask_width, mask_height, mask)
                    .ok_or_else(|| "Failed to create mask image".to_string())?;
            image::imageops::resize(&mask_img, target_width, target_height, image::imageops::FilterType::Triangle)
                .into_raw()
        } else {
            mask
        };

        let mut rgba: Vec<u8> = Vec::with_capacity((target_width * target_height * 4) as usize);
        for value in scaled_mask {
            rgba.extend_from_slice(&[255, 255, 255, value]);
        }

        let image: ImageBuffer<Rgba<u8>, Vec<u8>> =
            ImageBuffer::from_raw(target_width, target_height, rgba)
                .ok_or_else(|| "Failed to build mask PNG".to_string())?;

        let mut png_bytes: Vec<u8> = Vec::new();
        let mut cursor = Cursor::new(&mut png_bytes);
        image
            .write_to(&mut cursor, ImageFormat::Png)
            .map_err(|e| format!("Failed to encode mask PNG: {e}"))?;

        Ok(RemoveBackgroundResult {
            mask_png_base64: super::general_purpose::STANDARD.encode(&png_bytes),
            width: target_width,
            height: target_height,
            revision,
        })
    }

    unsafe fn generate_mask_from_vision(
        image_bytes: &[u8],
    ) -> Result<(Vec<u8>, u32, u32, Option<i32>), String> {
        autoreleasepool(|| {
            let nsdata: *mut Object = msg_send![class!(NSData), dataWithBytes: image_bytes.as_ptr() length: image_bytes.len()];
            if nsdata.is_null() {
                return Err("Failed to create NSData".to_string());
            }

            let request: *mut Object = msg_send![class!(VNGenerateForegroundInstanceMaskRequest), new];
            if request.is_null() {
                return Err("Failed to create Vision request".to_string());
            }

            let revision: i32 = msg_send![request, revision];

            let handler: *mut Object = msg_send![class!(VNImageRequestHandler), alloc];
            let handler: *mut Object = msg_send![handler, initWithData: nsdata options: std::ptr::null::<Object>()];
            if handler.is_null() {
                return Err("Failed to create Vision handler".to_string());
            }

            let requests: *mut Object = msg_send![class!(NSArray), arrayWithObject: request];
            let mut error: *mut Object = std::ptr::null_mut();
            let success: BOOL = msg_send![handler, performRequests: requests error: &mut error];
            if success == NO {
                let message = if error.is_null() {
                    "Vision request failed".to_string()
                } else {
                    nsstring_to_string(msg_send![error, localizedDescription])
                };
                return Err(message);
            }

            let results: *mut Object = msg_send![request, results];
            let count: usize = msg_send![results, count];
            if count == 0 {
                return Err("no_subject_detected".to_string());
            }

            let observation: *mut Object = msg_send![results, objectAtIndex: 0];
            if observation.is_null() {
                return Err("no_subject_detected".to_string());
            }

            let pixel_buffer: *mut c_void = msg_send![observation, instanceMask];
            if pixel_buffer.is_null() {
                return Err("Failed to access mask pixels".to_string());
            }

            let lock_status = CVPixelBufferLockBaseAddress(pixel_buffer, PIXEL_BUFFER_LOCK_READONLY);
            if lock_status != 0 {
                return Err("Failed to lock mask buffer".to_string());
            }

            let width = CVPixelBufferGetWidth(pixel_buffer) as usize;
            let height = CVPixelBufferGetHeight(pixel_buffer) as usize;
            let bytes_per_row = CVPixelBufferGetBytesPerRow(pixel_buffer);
            let base = CVPixelBufferGetBaseAddress(pixel_buffer) as *const u8;
            if base.is_null() {
                CVPixelBufferUnlockBaseAddress(pixel_buffer, PIXEL_BUFFER_LOCK_READONLY);
                return Err("Failed to read mask buffer".to_string());
            }

            let bytes_per_pixel = if width > 0 { bytes_per_row / width } else { 0 };
            if bytes_per_pixel == 0 {
                CVPixelBufferUnlockBaseAddress(pixel_buffer, PIXEL_BUFFER_LOCK_READONLY);
                return Err("Invalid mask buffer stride".to_string());
            }

            let mut mask: Vec<u8> = vec![0; width * height];
            for y in 0..height {
                let row = base.add(y * bytes_per_row);
                for x in 0..width {
                    let value = *row.add(x * bytes_per_pixel);
                    mask[y * width + x] = if value > 0 { 255 } else { 0 };
                }
            }

            CVPixelBufferUnlockBaseAddress(pixel_buffer, PIXEL_BUFFER_LOCK_READONLY);

            Ok((mask, width as u32, height as u32, Some(revision)))
        })
    }

    unsafe fn nsstring_to_string(ns_string: *mut Object) -> String {
        if ns_string.is_null() {
            return "Unknown error".to_string();
        }
        let c_str: *const c_char = msg_send![ns_string, UTF8String];
        if c_str.is_null() {
            return "Unknown error".to_string();
        }
        CStr::from_ptr(c_str).to_string_lossy().into_owned()
    }

    fn decode_image_dimensions(image_bytes: &[u8]) -> Result<(u32, u32), String> {
        unsafe {
            let nsdata: *mut Object = msg_send![class!(NSData), dataWithBytes: image_bytes.as_ptr() length: image_bytes.len()];
            if nsdata.is_null() {
                return Err("Failed to create NSData".to_string());
            }
            let source = CGImageSourceCreateWithData(nsdata as CFDataRef, ptr::null());
            if source.is_null() {
                return Err("Failed to create image source".to_string());
            }
            let image = CGImageSourceCreateImageAtIndex(source, 0, ptr::null());
            if image.is_null() {
                CFRelease(source as CFTypeRef);
                return Err("Failed to decode image".to_string());
            }
            let width = CGImageGetWidth(image) as u32;
            let height = CGImageGetHeight(image) as u32;
            CFRelease(image as CFTypeRef);
            CFRelease(source as CFTypeRef);
            Ok((width, height))
        }
    }
}

#[cfg(target_os = "macos")]
use macos::remove_background_macos;
