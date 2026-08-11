import JSZip from 'jszip'

export interface ImageData {
  width: number
  height: number
  data: Uint8ClampedArray // RGBA data
}

export interface BitmapData {
  width: number
  height: number
  data: Uint8Array // 1-bit data (0 or 1) or 24-bit RGB data
}

/**
 * Convert image data to target color depth with optional dithering
 */
export function convertImageToColorDepth(
  imageData: ImageData,
  colorDepth: '1bit' | '4bit' | '24bit'
): BitmapData {
  console.log('[v0] convertImageToColorDepth called with:', {
    imageDataWidth: imageData.width,
    imageDataHeight: imageData.height,
    imageDataLength: imageData.data.length,
    colorDepth,
    expectedLength: imageData.width * imageData.height * 4
  })
  
  if (colorDepth === '24bit') {
    // Convert RGBA to RGB (remove alpha channel)
    const rgbData = new Uint8Array(imageData.width * imageData.height * 3)
    let rgbIndex = 0
    
    for (let i = 0; i < imageData.data.length; i += 4) {
      rgbData[rgbIndex++] = imageData.data[i]     // R
      rgbData[rgbIndex++] = imageData.data[i + 1] // G
      rgbData[rgbIndex++] = imageData.data[i + 2] // B
      // Skip alpha channel
    }
    
    const result = {
      width: imageData.width,
      height: imageData.height,
      data: rgbData
    }
    
    console.log('[v0] convertImageToColorDepth 24-bit result:', {
      width: result.width,
      height: result.height,
      dataLength: result.data.length,
      expectedLength: result.width * result.height * 3
    })
    
    return result
  } else if (colorDepth === '4bit') {
    // Convert to 4-bit grayscale (16 shades) with Floyd-Steinberg dithering
    const result = floydSteinberg4BitDithering(imageData)
    
    console.log('[v0] convertImageToColorDepth 4-bit result:', {
      width: result.width,
      height: result.height,
      dataLength: result.data.length,
      expectedLength: result.width * result.height
    })
    
    return result
  } else {
    // Convert to 1-bit with luminance threshold method
    const result = thresholdTo1Bit(imageData)
    
    console.log('[v0] convertImageToColorDepth 1-bit result:', {
      width: result.width,
      height: result.height,
      dataLength: result.data.length,
      expectedLength: result.width * result.height
    })
    
    return result
  }
}

/**
 * Floyd-Steinberg dithering algorithm for 4-bit grayscale conversion
 */
function floydSteinberg4BitDithering(imageData: ImageData): BitmapData {
  const { width, height, data } = imageData
  
  // Create a copy of the image data to work with
  const workingData = new Float32Array(width * height)
  
  // Initialize working data with grayscale values (0-255 range)
  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const alpha = data[i + 3]
    
    // Convert to grayscale
    const gray = (r * 0.299 + g * 0.587 + b * 0.114) * (alpha / 255)
    workingData[pixelIndex] = gray
  }
  
  // Apply Floyd-Steinberg dithering for 4-bit (16 levels)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const oldPixel = workingData[index]
      
      // Quantize to nearest 4-bit level (0-15)
      const level = Math.round(oldPixel / 255 * 15)
      const newPixel = (level / 15) * 255 // Convert back to 0-255 range
      
      workingData[index] = newPixel
      const error = oldPixel - newPixel
      
      // Distribute error to neighboring pixels
      if (x + 1 < width) {
        workingData[index + 1] += error * 7 / 16
      }
      if (y + 1 < height) {
        if (x > 0) {
          workingData[index + width - 1] += error * 3 / 16
        }
        workingData[index + width] += error * 5 / 16
        if (x + 1 < width) {
          workingData[index + width + 1] += error * 1 / 16
        }
      }
    }
  }
  
  // Convert to 4-bit data (store as 0-255 range for now, will be packed later)
  const bitmapData = new Uint8Array(width * height)
  for (let i = 0; i < workingData.length; i++) {
    // Clamp to 0-255 and round to nearest 4-bit level
    const clamped = Math.max(0, Math.min(255, workingData[i]))
    const level = Math.round(clamped / 255 * 15)
    bitmapData[i] = (level / 15) * 255
  }
  
  return {
    width,
    height,
    data: bitmapData
  }
}

/**
 * Convert to a plain 8-bit grayscale mask - one byte per pixel, no
 * thresholding/packing. Used for the M5 Dial's page-icon export (see
 * AssetExporter.exportPageIcon()): a hard 1-bit mask (thresholdTo1Bit
 * below) throws away the antialiasing rasterizeSVG() already produced,
 * which looked visibly blocky at the small sizes a screen-switch
 * navigator's tablets actually use - keeping real 0-255 luminance lets a
 * device blend smoothly between its own foreground/background colors
 * instead of a hard per-pixel on/off choice. Same luminance formula and
 * white-background alpha blending as thresholdTo1Bit, just not thresholded
 * to a single bit at the end.
 */
export function convertToGrayscale(imageData: ImageData): BitmapData {
  const { width, height, data } = imageData
  const bitmapData = new Uint8Array(width * height)

  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const alpha = data[i + 3]

    const luminance = r * 0.299 + g * 0.587 + b * 0.114
    const finalLuminance = luminance * (alpha / 255) + 255 * (1 - alpha / 255)

    bitmapData[pixelIndex] = Math.round(Math.max(0, Math.min(255, finalLuminance)))
  }

  return {
    width,
    height,
    data: bitmapData,
  }
}

/**
 * Threshold-based conversion to 1-bit using luminance
 * Pixels with luminance > 50% become white (1), others become black (0)
 */
function thresholdTo1Bit(imageData: ImageData): BitmapData {
  const { width, height, data } = imageData
  const bitmapData = new Uint8Array(width * height)
  
  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const alpha = data[i + 3]
    
    // Calculate luminance (0-255 range)
    // Using standard luminance formula: 0.299*R + 0.587*G + 0.114*B
    const luminance = r * 0.299 + g * 0.587 + b * 0.114
    
    // Apply alpha blending to background (assuming white background)
    const finalLuminance = luminance * (alpha / 255) + 255 * (1 - alpha / 255)
    
    // Threshold at 50% luminance (127.5)
    // If luminance > 50%, pixel becomes white (1), otherwise black (0)
    bitmapData[pixelIndex] = finalLuminance > 127.5 ? 1 : 0
  }
  
  return {
    width,
    height,
    data: bitmapData
  }
}

/**
 * Floyd-Steinberg dithering algorithm for 1-bit conversion
 */
function floydSteinbergDithering(imageData: ImageData): BitmapData {
  const { width, height, data } = imageData
  
  // Create a copy of the image data to work with
  const workingData = new Float32Array(width * height)
  
  // Initialize working data with grayscale values (0-255 range)
  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const alpha = data[i + 3]
    
    // Convert to grayscale (0-255 range), accounting for alpha
    const gray = (r * 0.299 + g * 0.587 + b * 0.114) * (alpha / 255)
    workingData[pixelIndex] = gray
  }
  
  // Apply Floyd-Steinberg dithering
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const oldPixel = workingData[index]
      // Threshold at 127.5 (middle of 0-255 range)
      const newPixel = oldPixel > 127.5 ? 255 : 0
      workingData[index] = newPixel
      
      const error = oldPixel - newPixel
      
      // Distribute error to neighboring pixels
      if (x + 1 < width) {
        workingData[index + 1] += error * 7 / 16
      }
      if (y + 1 < height) {
        if (x > 0) {
          workingData[index + width - 1] += error * 3 / 16
        }
        workingData[index + width] += error * 5 / 16
        if (x + 1 < width) {
          workingData[index + width + 1] += error * 1 / 16
        }
      }
    }
  }
  
  // Convert to 1-bit data (0 or 1)
  const bitmapData = new Uint8Array(width * height)
  for (let i = 0; i < workingData.length; i++) {
    bitmapData[i] = workingData[i] > 127.5 ? 1 : 0
  }
  
  return {
    width,
    height,
    data: bitmapData
  }
}

/**
 * Convert bitmap data to XBM format
 */
export function bitmapToXBM(bitmap: BitmapData, name: string): string {
  const { width, height, data } = bitmap
  
  let xbm = `#define ${name}_width ${width}\n`
  xbm += `#define ${name}_height ${height}\n`
  xbm += `static unsigned char ${name}_bits[] = {\n`
  
  if (bitmap.data.length === width * height) {
    // 1-bit data - pack into bytes
    const bytesPerRow = Math.ceil(width / 8)
    const totalBytes = bytesPerRow * height
    
    for (let byteIndex = 0; byteIndex < totalBytes; byteIndex++) {
      let byte = 0
      const row = Math.floor(byteIndex / bytesPerRow)
      const col = (byteIndex % bytesPerRow) * 8
      
      for (let bit = 0; bit < 8; bit++) {
        const pixelX = col + bit
        if (pixelX < width) {
          const pixelIndex = row * width + pixelX
          if (data[pixelIndex]) {
            byte |= (1 << (7 - bit))
          }
        }
      }
      
      xbm += `0x${byte.toString(16).padStart(2, '0')}`
      if (byteIndex < totalBytes - 1) {
        xbm += ','
      }
      if ((byteIndex + 1) % 12 === 0) {
        xbm += '\n'
      } else {
        xbm += ' '
      }
    }
  } else {
    // 24-bit data - store as RGB bytes
    const totalBytes = width * height * 3
    
    for (let i = 0; i < totalBytes; i++) {
      xbm += `0x${data[i].toString(16).padStart(2, '0')}`
      if (i < totalBytes - 1) {
        xbm += ','
      }
      if ((i + 1) % 12 === 0) {
        xbm += '\n'
      } else {
        xbm += ' '
      }
    }
  }
  
  xbm += '\n};\n'
  return xbm
}

/**
 * Convert bitmap data to PBM (P4) format
 * P4 is the binary PBM format
 */
export function bitmapToPBM(bitmap: BitmapData): Uint8Array {
  const { width, height, data } = bitmap
  
  console.log('[v0] bitmapToPBM called with:', {
    width,
    height,
    dataLength: data.length,
    expectedLength1bit: width * height,
    expectedLength24bit: width * height * 3,
    is1bit: data.length === width * height,
    is24bit: data.length === width * height * 3
  })
  
  // PBM P4 format header
  const header = `P4\n${width} ${height}\n`
  const headerBytes = new TextEncoder().encode(header)
  
  if (data.length === width * height) {
    // 1-bit data - pack into bytes
    const bytesPerRow = Math.ceil(width / 8)
    const totalBytes = bytesPerRow * height
    const bitmapBytes = new Uint8Array(totalBytes)
    
    for (let byteIndex = 0; byteIndex < totalBytes; byteIndex++) {
      let byte = 0
      const row = Math.floor(byteIndex / bytesPerRow)
      const col = (byteIndex % bytesPerRow) * 8
      
      for (let bit = 0; bit < 8; bit++) {
        const pixelX = col + bit
        if (pixelX < width) {
          const pixelIndex = row * width + pixelX
          // Invert: in PBM, 1=black, 0=white; in bitmap data, 1=white, 0=black
          if (!data[pixelIndex]) {
            byte |= (1 << (7 - bit))
          }
        }
      }
      
      bitmapBytes[byteIndex] = byte
    }
    
    // Combine header and bitmap data
    const result = new Uint8Array(headerBytes.length + bitmapBytes.length)
    result.set(headerBytes, 0)
    result.set(bitmapBytes, headerBytes.length)
    
    console.log('[v0] bitmapToPBM 1-bit result:', {
      headerLength: headerBytes.length,
      bitmapBytesLength: bitmapBytes.length,
      totalLength: result.length,
      header: header,
      firstFewBytes: Array.from(result.slice(0, 20))
    })
    
    return result
  } else {
    // 24-bit data - convert to grayscale for PBM
    const bytesPerRow = Math.ceil(width / 8)
    const totalBytes = bytesPerRow * height
    const bitmapBytes = new Uint8Array(totalBytes)
    
    for (let byteIndex = 0; byteIndex < totalBytes; byteIndex++) {
      let byte = 0
      const row = Math.floor(byteIndex / bytesPerRow)
      const col = (byteIndex % bytesPerRow) * 8
      
      for (let bit = 0; bit < 8; bit++) {
        const pixelX = col + bit
        if (pixelX < width) {
          const pixelIndex = (row * width + pixelX) * 3
          const r = data[pixelIndex]
          const g = data[pixelIndex + 1]
          const b = data[pixelIndex + 2]
          // Convert to grayscale and threshold
          // Invert: in PBM, 1=black, 0=white; dark colors should set the bit
          const gray = (r * 0.299 + g * 0.587 + b * 0.114)
          if (gray < 127) {
            byte |= (1 << (7 - bit))
          }
        }
      }
      
      bitmapBytes[byteIndex] = byte
    }
    
    // Combine header and bitmap data
    const result = new Uint8Array(headerBytes.length + bitmapBytes.length)
    result.set(headerBytes, 0)
    result.set(bitmapBytes, headerBytes.length)
    
    console.log('[v0] bitmapToPBM 24-bit result:', {
      headerLength: headerBytes.length,
      bitmapBytesLength: bitmapBytes.length,
      totalLength: result.length,
      header: header,
      firstFewBytes: Array.from(result.slice(0, 20))
    })
    
    return result
  }
}

/**
 * Convert a grayscale bitmap (see convertToGrayscale above) to PGM (P5,
 * the binary/raw variant) - the real standard sibling of PBM/P4, not an
 * invented format: a 3-line text header (magic, dimensions, maxval) then
 * one raw byte per pixel, no packing. Used for the M5 Dial's page-icon
 * export (AssetExporter.exportPageIcon()) - see convertToGrayscale's own
 * comment for why a hard 1-bit mask (bitmapToPBM above) wasn't good enough
 * for that.
 */
export function bitmapToPGM(bitmap: BitmapData): Uint8Array {
  const { width, height, data } = bitmap
  const header = `P5\n${width} ${height}\n255\n`
  const headerBytes = new TextEncoder().encode(header)

  const result = new Uint8Array(headerBytes.length + data.length)
  result.set(headerBytes, 0)
  result.set(data, headerBytes.length)
  return result
}

/**
 * Load image from data URL and return ImageData
 */
export function loadImageFromDataURL(dataURL: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }
      
      canvas.width = img.width
      canvas.height = img.height
      
      ctx.drawImage(img, 0, 0)
      const imageData = ctx.getImageData(0, 0, img.width, img.height)
      
      resolve({
        width: img.width,
        height: img.height,
        data: imageData.data
      })
    }
    
    img.onerror = () => {
      reject(new Error('Failed to load image'))
    }
    
    img.src = dataURL
  })
}

/**
 * Rasterize SVG to ImageData
 */
export function rasterizeSVG(svgData: string, width: number, height: number): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    console.log('[v0] rasterizeSVG called with:', {
      svgDataType: typeof svgData,
      svgDataLength: svgData.length,
      isDataUrl: svgData.startsWith('data:'),
      dataUrlPrefix: svgData.substring(0, 100),
      width,
      height
    })
    
    // Decode and inspect SVG content
    if (svgData.startsWith('data:image/svg+xml;base64,')) {
      try {
        const base64Data = svgData.split(',')[1]
        const decodedSvg = atob(base64Data)
        console.log('[v0] Decoded SVG content:', {
          svgLength: decodedSvg.length,
          svgStart: decodedSvg.substring(0, 200),
          hasViewBox: decodedSvg.includes('viewBox'),
          hasWidth: decodedSvg.includes('width'),
          hasHeight: decodedSvg.includes('height')
        })
      } catch (e) {
        console.error('[v0] Failed to decode base64 SVG:', e)
      }
    }
    
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'))
      return
    }
    
    canvas.width = width
    canvas.height = height
    
    const img = new Image()
    let url: string | null = null
    
    img.onload = () => {
      console.log('[v0] SVG image loaded successfully, drawing to canvas')
      console.log('[v0] Image natural dimensions:', {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        targetWidth: width,
        targetHeight: height
      })
      
      try {
        // Ensure we have valid dimensions - if natural dimensions are 0, use target size
        const drawWidth = img.naturalWidth > 0 ? width : width
        const drawHeight = img.naturalHeight > 0 ? height : height
        
        console.log('[v0] Drawing with dimensions:', { drawWidth, drawHeight })
        
        // Fill with white background first
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        
        // Set stroke color to black for currentColor resolution
        ctx.strokeStyle = '#000000'
        ctx.fillStyle = '#000000'
        
        ctx.drawImage(img, 0, 0, drawWidth, drawHeight)
        const imageData = ctx.getImageData(0, 0, width, height)
        
        // Debug: Check if image data is all zeros
        const hasNonZeroData = imageData.data.some((value, index) => {
          // Check RGBA channels (skip alpha for now)
          if (index % 4 !== 3) return value !== 0
          return false
        })
        
        console.log('[v0] SVG rasterized successfully:', {
          imageDataLength: imageData.data.length,
          expectedLength: width * height * 4,
          hasNonZeroData,
          firstFewPixels: Array.from(imageData.data.slice(0, 16)),
          imgNaturalWidth: img.naturalWidth,
          imgNaturalHeight: img.naturalHeight,
          imgWidth: img.width,
          imgHeight: img.height
        })
        
        resolve({
          width,
          height,
          data: imageData.data
        })
      } catch (error) {
        console.error('[v0] Failed to draw SVG to canvas:', error)
        reject(new Error(`Failed to draw SVG: ${error}`))
      } finally {
        // Clean up object URL if we created one
        if (url) {
          URL.revokeObjectURL(url)
        }
      }
    }
    
    img.onerror = (error) => {
      console.error('[v0] SVG image failed to load:', error)
      reject(new Error('Failed to rasterize SVG'))
      // Clean up object URL if we created one
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
    
    // Simply use the SVG data as-is - let the canvas handle the rendering
    // The canvas will automatically scale the SVG to the target dimensions
    console.log('[v0] Using SVG data directly - canvas will handle rendering and scaling')
    
    if (svgData.startsWith('data:')) {
      img.src = svgData
    } else {
      // Create a blob and object URL for raw SVG string
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
      url = URL.createObjectURL(svgBlob)
      img.src = url
    }
  })
}
