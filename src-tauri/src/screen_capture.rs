use anyhow::{Context, Result};
use std::mem;
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
    GetDC, GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
    BI_RGB, DIB_RGB_COLORS, SRCCOPY,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowRect,
};
use windows::Graphics::Imaging::{BitmapDecoder, BitmapPixelFormat, SoftwareBitmap};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
use windows::Globalization::Language;

/// Captured screenshot data
#[derive(Debug, Clone)]
pub struct Screenshot {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>, // RGBA pixel data
}

impl Screenshot {
    /// Convert to PNG bytes
    pub fn to_png(&self) -> Result<Vec<u8>> {
        use image::{ImageBuffer, Rgba};

        // Create image from raw BGRA data (Windows uses BGRA)
        let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_fn(
            self.width,
            self.height,
            |x, y| {
                let idx = ((y * self.width + x) * 4) as usize;
                if idx + 3 < self.data.len() {
                    // Convert BGRA to RGBA
                    Rgba([
                        self.data[idx + 2], // R
                        self.data[idx + 1], // G
                        self.data[idx],     // B
                        255,                // A
                    ])
                } else {
                    Rgba([0, 0, 0, 255])
                }
            },
        );

        let mut png_data = Vec::new();
        let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
        encoder
            .encode(
                &img,
                self.width,
                self.height,
                image::ColorType::Rgba8,
            )
            .context("Failed to encode PNG")?;

        Ok(png_data)
    }

    /// Convert to base64 PNG
    pub fn to_base64_png(&self) -> Result<String> {
        let png_data = self.to_png()?;
        Ok(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &png_data))
    }
}

/// Capture the foreground window
pub fn capture_foreground_window() -> Result<Screenshot> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0 == 0 {
            return Err(anyhow::anyhow!("No foreground window found"));
        }
        capture_window(hwnd)
    }
}

/// Capture a specific window by handle
pub fn capture_window(hwnd: HWND) -> Result<Screenshot> {
    unsafe {
        // Get window dimensions
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect)
            .context("Failed to get window rect")?;

        let width = (rect.right - rect.left) as u32;
        let height = (rect.bottom - rect.top) as u32;

        if width == 0 || height == 0 {
            return Err(anyhow::anyhow!("Invalid window dimensions: {}x{}", width, height));
        }

        println!("[ScreenCapture] Capturing window: {}x{}", width, height);

        // Get device context
        let hdc_screen = GetDC(hwnd);
        if hdc_screen.0 == 0 {
            return Err(anyhow::anyhow!("Failed to get window DC"));
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        if hdc_mem.0 == 0 {
            ReleaseDC(hwnd, hdc_screen);
            return Err(anyhow::anyhow!("Failed to create compatible DC"));
        }

        let hbm = CreateCompatibleBitmap(hdc_screen, width as i32, height as i32);
        if hbm.0 == 0 {
            DeleteDC(hdc_mem);
            ReleaseDC(hwnd, hdc_screen);
            return Err(anyhow::anyhow!("Failed to create compatible bitmap"));
        }

        let old_obj = SelectObject(hdc_mem, hbm);

        // Copy the window content
        let _ = BitBlt(
            hdc_mem,
            0,
            0,
            width as i32,
            height as i32,
            hdc_screen,
            0,
            0,
            SRCCOPY,
        );

        // Prepare bitmap info
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32), // Negative for top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0 as u32,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [Default::default()],
        };

        // Allocate buffer for pixel data
        let mut data = vec![0u8; (width * height * 4) as usize];

        // Get the bitmap bits
        let result = GetDIBits(
            hdc_mem,
            hbm,
            0,
            height,
            Some(data.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        // Cleanup
        SelectObject(hdc_mem, old_obj);
        DeleteObject(hbm);
        DeleteDC(hdc_mem);
        ReleaseDC(hwnd, hdc_screen);

        if result == 0 {
            return Err(anyhow::anyhow!("Failed to get bitmap bits"));
        }

        println!("[ScreenCapture] Captured {} bytes of image data", data.len());

        Ok(Screenshot {
            width,
            height,
            data,
        })
    }
}

/// Capture a specific region of the foreground window
pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> Result<Screenshot> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0 == 0 {
            return Err(anyhow::anyhow!("No foreground window found"));
        }

        println!("[ScreenCapture] Capturing region: {}x{} at ({}, {})", width, height, x, y);

        // Get device context for the entire screen
        let hdc_screen = GetDC(HWND(0)); // 0 = entire screen
        if hdc_screen.0 == 0 {
            return Err(anyhow::anyhow!("Failed to get screen DC"));
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        if hdc_mem.0 == 0 {
            ReleaseDC(HWND(0), hdc_screen);
            return Err(anyhow::anyhow!("Failed to create compatible DC"));
        }

        let hbm = CreateCompatibleBitmap(hdc_screen, width as i32, height as i32);
        if hbm.0 == 0 {
            DeleteDC(hdc_mem);
            ReleaseDC(HWND(0), hdc_screen);
            return Err(anyhow::anyhow!("Failed to create compatible bitmap"));
        }

        let old_obj = SelectObject(hdc_mem, hbm);

        // Copy the region
        let _ = BitBlt(
            hdc_mem,
            0,
            0,
            width as i32,
            height as i32,
            hdc_screen,
            x,
            y,
            SRCCOPY,
        );

        // Prepare bitmap info
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0 as u32,
                biSizeImage: 0,
                biXPelsPerMeter: 0,
                biYPelsPerMeter: 0,
                biClrUsed: 0,
                biClrImportant: 0,
            },
            bmiColors: [Default::default()],
        };

        let mut data = vec![0u8; (width * height * 4) as usize];

        let result = GetDIBits(
            hdc_mem,
            hbm,
            0,
            height,
            Some(data.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        // Cleanup
        SelectObject(hdc_mem, old_obj);
        DeleteObject(hbm);
        DeleteDC(hdc_mem);
        ReleaseDC(HWND(0), hdc_screen);

        if result == 0 {
            return Err(anyhow::anyhow!("Failed to get bitmap bits"));
        }

        Ok(Screenshot {
            width,
            height,
            data,
        })
    }
}

/// Perform OCR on a screenshot using Windows OCR
pub fn perform_ocr(screenshot: &Screenshot) -> Result<Vec<String>> {
    println!("[OCR] Starting OCR on {}x{} image...", screenshot.width, screenshot.height);

    // Convert screenshot to PNG
    let png_data = screenshot.to_png()?;
    println!("[OCR] PNG encoded: {} bytes", png_data.len());

    // Create an in-memory stream from the PNG data
    let stream = InMemoryRandomAccessStream::new()
        .context("Failed to create memory stream")?;

    // Write PNG data to stream
    {
        let writer = DataWriter::CreateDataWriter(&stream)
            .context("Failed to create data writer")?;
        writer.WriteBytes(&png_data)
            .context("Failed to write bytes")?;
        writer.StoreAsync()
            .context("Failed to store async")?
            .get()
            .context("Failed to get store result")?;
        writer.FlushAsync()
            .context("Failed to flush async")?
            .get()
            .context("Failed to get flush result")?;
        writer.DetachStream()
            .context("Failed to detach stream")?;
    }

    // Reset stream position to beginning
    stream.Seek(0)
        .context("Failed to seek stream")?;

    // Decode the image
    let decoder = BitmapDecoder::CreateAsync(&stream)
        .context("Failed to create decoder async")?
        .get()
        .context("Failed to get decoder")?;

    // Get software bitmap for OCR
    let software_bitmap = decoder.GetSoftwareBitmapAsync()
        .context("Failed to get software bitmap async")?
        .get()
        .context("Failed to get software bitmap")?;

    // Convert to format supported by OCR (Gray8 or Bgra8)
    let converted_bitmap = SoftwareBitmap::Convert(&software_bitmap, BitmapPixelFormat::Gray8)
        .context("Failed to convert bitmap")?;

    // Try to get French OCR engine, fallback to default
    let engine = OcrEngine::TryCreateFromLanguage(&Language::CreateLanguage(&windows::core::HSTRING::from("fr-FR"))?)
        .or_else(|_| OcrEngine::TryCreateFromUserProfileLanguages())
        .context("Failed to create OCR engine - no language available")?;

    println!("[OCR] Using OCR engine for language: {:?}", engine.RecognizerLanguage()?.LanguageTag());

    // Perform OCR
    let ocr_result = engine.RecognizeAsync(&converted_bitmap)
        .context("Failed to start OCR")?
        .get()
        .context("Failed to get OCR result")?;

    // Extract text lines
    let mut lines: Vec<String> = Vec::new();

    let ocr_lines = ocr_result.Lines()
        .context("Failed to get OCR lines")?;

    for i in 0..ocr_lines.Size()? {
        let line = ocr_lines.GetAt(i)?;
        let text = line.Text()?.to_string();
        if !text.trim().is_empty() {
            println!("[OCR] Line {}: {}", i, text);
            lines.push(text);
        }
    }

    println!("[OCR] Extracted {} lines of text", lines.len());

    Ok(lines)
}

/// Capture the foreground window and perform OCR
pub fn capture_and_ocr() -> Result<Vec<String>> {
    let screenshot = capture_foreground_window()?;
    perform_ocr(&screenshot)
}

/// Capture a specific region and perform OCR
pub fn capture_region_and_ocr(x: i32, y: i32, width: u32, height: u32) -> Result<Vec<String>> {
    let screenshot = capture_region(x, y, width, height)?;
    perform_ocr(&screenshot)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capture_foreground() {
        // This will only work if a window is in foreground
        let result = capture_foreground_window();
        println!("Capture result: {:?}", result.is_ok());
    }
}
