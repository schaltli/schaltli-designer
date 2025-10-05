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
  colorDepth: '1bit' | '24bit'
): BitmapData {
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
    
    return {
      width: imageData.width,
      height: imageData.height,
      data: rgbData
    }
  } else {
    // Convert to 1-bit with Floyd-Steinberg dithering
    return floydSteinbergDithering(imageData)
  }
}

/**
 * Floyd-Steinberg dithering algorithm for 1-bit conversion
 */
function floydSteinbergDithering(imageData: ImageData): BitmapData {
  const { width, height, data } = imageData
  
  // Create a copy of the image data to work with
  const workingData = new Float32Array(width * height)
  
  // Initialize working data with grayscale values
  for (let i = 0; i < data.length; i += 4) {
    const pixelIndex = i / 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const alpha = data[i + 3]
    
    // Convert to grayscale and normalize to 0-1 range
    const gray = (r * 0.299 + g * 0.587 + b * 0.114) * (alpha / 255)
    workingData[pixelIndex] = gray
  }
  
  // Apply Floyd-Steinberg dithering
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const oldPixel = workingData[index]
      const newPixel = oldPixel > 0.5 ? 1 : 0
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
  
  // Convert to 1-bit data
  const bitmapData = new Uint8Array(width * height)
  for (let i = 0; i < workingData.length; i++) {
    bitmapData[i] = workingData[i] > 0.5 ? 1 : 0
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
export function rasterizeSVG(svgString: string, width: number, height: number): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    if (!ctx) {
      reject(new Error('Could not get canvas context'))
      return
    }
    
    canvas.width = width
    canvas.height = height
    
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height)
      const imageData = ctx.getImageData(0, 0, width, height)
      
      resolve({
        width,
        height,
        data: imageData.data
      })
    }
    
    img.onerror = () => {
      reject(new Error('Failed to rasterize SVG'))
    }
    
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    img.src = url
    
    // Clean up
    img.onload = () => {
      URL.revokeObjectURL(url)
      ctx.drawImage(img, 0, 0, width, height)
      const imageData = ctx.getImageData(0, 0, width, height)
      
      resolve({
        width,
        height,
        data: imageData.data
      })
    }
  })
}
