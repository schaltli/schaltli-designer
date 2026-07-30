import JSZip from 'jszip'
import { 
  loadImageFromDataURL, 
  rasterizeSVG, 
  convertImageToColorDepth,
  type ImageData,
  type BitmapData 
} from './asset-converter'
import { getObjectTypeSortOrder } from './object-order'
import { renderBox } from '@/components/canvas/renderers/render-box'
import { renderLine } from '@/components/canvas/renderers/render-line'

export interface AssetExportOptions {
  colorDepth: '1bit' | '4bit' | '24bit'
  screenWidth: number
  screenHeight: number
}

export interface BackgroundImageExport {
  assetId: string
  filename: string
  data: Uint8Array
  format: 'pbm' | 'bmp'
}

export interface FlattenedBackgroundExport {
  screenId: string
  filename: string
  data: Uint8Array
  format: 'pbm' | 'bmp'
}

export interface IconUsageExport {
  assetId: string
  objectId: string // The icon object ID or iconpair ID
  usageId: string // Unique identifier for this usage
  filename: string
  data: Uint8Array
  format: 'pbm' | 'bmp'
  backgroundContext: {
    x: number
    y: number
    width: number
    height: number
    backgroundColor?: string
    backgroundImage?: string
  }
}

export interface SoftwareButtonExport {
  objectId: string
  normalFilename: string
  activeFilename: string
  normalData: Uint8Array
  activeData: Uint8Array
  format: 'pbm' | 'bmp'
}

/**
 * Export assets with color depth filtering
 * This is completely separate from the download project function
 */
export class AssetExporter {
  private options: AssetExportOptions

  constructor(options: AssetExportOptions) {
    this.options = options
  }

  /**
   * Render a screen's background + static (box/line/icon) objects onto a
   * canvas, same as the firmware export path uses before quantizing to
   * BMP/PBM - exposed for callers (e.g. lib/android-export.ts) that want
   * the rendered canvas itself instead of a quantized bitmap, since a
   * platform with native rendering has no reason to quantize at all.
   */
  async renderScreenBackground(screen: any, project: any): Promise<HTMLCanvasElement> {
    return this.createFlattenedBackground(screen, project)
  }

  /**
   * Export all assets from a project
   */
  async exportAssets(project: any): Promise<{
    backgroundImages: BackgroundImageExport[]
    flattenedBackgrounds: FlattenedBackgroundExport[]
    iconUsages: IconUsageExport[]
    softwareButtons: SoftwareButtonExport[]
    zipFile: Blob
  }> {
    console.log('[AssetExport] Starting asset export with options:', this.options)
    
    const zip = new JSZip()
    const assetsFolder = zip.folder('assets')
    if (!assetsFolder) throw new Error('Failed to create assets folder')

    const backgroundImages: BackgroundImageExport[] = []
    const flattenedBackgrounds: FlattenedBackgroundExport[] = []
    const iconUsages: IconUsageExport[] = []
    const softwareButtons: SoftwareButtonExport[] = []

    // Process flattened backgrounds and icon usages
    console.log('[AssetExport] Processing icon usages...')
    let iconUsageCount = 0
    
    for (const screen of project.screens) {
      // Generate flattened background once per screen (bg color + bg image + boxes + lines + icons)
      console.log(`[AssetExport] Generating flattened background for screen: ${screen.name}`)
      const flattenedBackground = await this.createFlattenedBackground(screen, project)
      
      // Export the flattened background as a file
      const flattenedBgExport = await this.exportFlattenedBackground(flattenedBackground, screen.id)
      if (flattenedBgExport) {
        flattenedBackgrounds.push(flattenedBgExport)
      }
      
      for (const obj of screen.objects) {
        // Handle regular icon objects
        if (obj.type === 'icon') {
          iconUsageCount++
          console.log(`[AssetExport] Processing icon object: ${obj.type}, assetId: ${obj.properties.assetId}`)
          
          const asset = project.assets.find((a: any) => a.id === obj.properties.assetId)
          console.log(`[AssetExport] Found icon asset:`, asset ? { id: asset.id, name: asset.name, type: asset.type } : 'NOT FOUND')
          
          if (asset) {
            const exportResult = await this.exportIconUsage(asset, obj, screen, project, flattenedBackground)
            console.log(`[AssetExport] Icon export result:`, exportResult ? { filename: exportResult.filename, dataLength: exportResult.data.length, format: exportResult.format } : 'FAILED')
            
            if (exportResult) {
              iconUsages.push(exportResult)
              assetsFolder.file(exportResult.filename, exportResult.data)
            }
          }
        }
        // Handle MQTTIconField objects with value-icon pairs
        else if (obj.type === 'MQTTIconField') {
          const valueIconPairs = obj.properties.valueIconPairs || []
          console.log(`[AssetExport] Processing MQTTIconField with ${valueIconPairs.length} icon rules`)
          
          for (let pairIndex = 0; pairIndex < valueIconPairs.length; pairIndex++) {
            const pair = valueIconPairs[pairIndex]
            if (pair.thenShowIcon) {
              iconUsageCount++
              console.log(`[AssetExport] Processing MQTT icon rule ${pairIndex}: assetId: ${pair.thenShowIcon}`)
              
              const asset = project.assets.find((a: any) => a.id === pair.thenShowIcon)
              console.log(`[AssetExport] Found icon asset:`, asset ? { id: asset.id, name: asset.name, type: asset.type } : 'NOT FOUND')
              
              if (asset) {
                const exportResult = await this.exportIconUsage(asset, obj, screen, project, flattenedBackground, pairIndex)
                console.log(`[AssetExport] Icon export result:`, exportResult ? { filename: exportResult.filename, dataLength: exportResult.data.length, format: exportResult.format } : 'FAILED')
                
                if (exportResult) {
                  iconUsages.push(exportResult)
                  assetsFolder.file(exportResult.filename, exportResult.data)
                }
              }
            }
          }
        }
        // Handle SoftwareButton objects
        else if (obj.type === 'SoftwareButton') {
          console.log(`[AssetExport] Processing SoftwareButton: ${obj.id}`)
          
          const buttonExport = await this.exportSoftwareButton(obj, screen, project, flattenedBackground)
          if (buttonExport) {
            softwareButtons.push(buttonExport)
            assetsFolder.file(buttonExport.normalFilename, buttonExport.normalData)
            assetsFolder.file(buttonExport.activeFilename, buttonExport.activeData)
            console.log(`[AssetExport] Exported SoftwareButton: ${buttonExport.normalFilename} and ${buttonExport.activeFilename}`)
          }
        }
      }
    }
    
    console.log(`[AssetExport] Total icon objects found: ${iconUsageCount}, successfully exported: ${iconUsages.length}`)
    console.log(`[AssetExport] Total software buttons exported: ${softwareButtons.length}`)

    // Generate zip file
    const zipFile = await zip.generateAsync({ type: 'blob' })

    return {
      backgroundImages,
      flattenedBackgrounds,
      iconUsages,
      softwareButtons,
      zipFile
    }
  }

  /**
   * Create a flattened background canvas for a screen
   * Includes: bg color + bg image + boxes + lines + icons (all static content)
   */
  private async createFlattenedBackground(screen: any, project: any): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get canvas context')

    canvas.width = this.options.screenWidth
    canvas.height = this.options.screenHeight

    // 1. Fill with background color
    if (screen.backgroundColor) {
      ctx.fillStyle = screen.backgroundColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    } else {
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    // 2. Draw background image if it exists
    if (screen.backgroundImageAssetId) {
      try {
        const backgroundAsset = project.assets.find((a: any) => a.id === screen.backgroundImageAssetId)
        if (backgroundAsset && backgroundAsset.data) {
          await new Promise<void>((resolve, reject) => {
            const img = new Image()
            img.onload = () => {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
              resolve()
            }
            img.onerror = () => resolve() // Fail silently
            img.src = backgroundAsset.data
          })
        }
      } catch (error) {
        console.error('[AssetExport] Error rendering background image:', error)
      }
    }

    // 3. Get all static objects in drawing order (boxes, lines, icons only)
    const staticObjects = screen.objects.filter((obj: any) => {
      return obj.type === 'box' || obj.type === 'line' || obj.type === 'icon'
    })

    // Sort by type-based drawing order
    staticObjects.sort((a: any, b: any) => {
      const orderA = getObjectTypeSortOrder(a.type)
      const orderB = getObjectTypeSortOrder(b.type)
      
      if (orderA !== orderB) {
        return orderA - orderB
      }
      
      return a.id.localeCompare(b.id)
    })

    // 4. Render each static object
    for (const obj of staticObjects) {
      await this.renderStaticObject(ctx, obj, project)
    }

    console.log(`[AssetExport] Flattened background created for screen: ${screen.name}`)
    return canvas
  }

  /**
   * Render a static object (box, line, or icon) on the canvas
   */
  private async renderStaticObject(ctx: CanvasRenderingContext2D, obj: any, project: any): Promise<void> {
    if (obj.type === 'box') {
      // Was its own hand-rolled fillRect/strokeRect pair, drifted from the
      // live canvas's render-box.ts: strokeRect() centers a 1px stroke ON
      // the path, which straddles a pixel boundary and anti-aliases into a
      // visibly blurred border - render-box.ts instead draws an inset fill
      // (outer box in strokeColor, smaller inner box in fillColor on top),
      // which is always pixel-crisp since it's fillRect-only, no stroke.
      // Reusing the real renderer here means this can't drift again, and
      // picks up its colorDepth quantization for free (this path never
      // quantized static box colors at all before, e.g. on a 1-bit
      // firmware export) (2026-07-27 finding, Android HIL blurred-border).
      renderBox({ ctx, obj, zoom: 1, colorDepth: this.options.colorDepth })
    } else if (obj.type === 'line') {
      // Was its own hand-rolled native ctx.stroke() path - same class of
      // bug as the box case above (anti-aliased instead of pixel-crisp),
      // and pre-dates segmented/filleted lines entirely (only ever read
      // obj.x/y/width/height, a single segment). renderLine() handles a
      // line's real points array (falling back to the same x/y/width/height
      // derivation for an old two-point line with no points array yet),
      // multi-segment Bresenham/fillThickLine, and fillet-radius arcs -
      // reusing it here means the flattened background PNG this produces
      // (only Android consumes it this way; the firmware renders every
      // object, including "line", live from project.json every redraw via
      // its own ScreenRenderer::renderLine(), not a pre-flattened image)
      // always matches the live canvas exactly instead of a second
      // implementation that can drift.
      renderLine({ ctx, obj, zoom: 1, colorDepth: this.options.colorDepth })
    } else if (obj.type === 'icon') {
      // Render icon
      const asset = project.assets.find((a: any) => a.id === obj.properties.assetId)
      if (asset && asset.data) {
        // Draw background if specified
        if (obj.properties.backgroundColor && obj.properties.backgroundColor !== 'transparent') {
          ctx.fillStyle = obj.properties.backgroundColor
          ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
        }
        
        // Load and draw the icon
        await new Promise<void>((resolve, reject) => {
          const img = new Image()
          img.onload = () => {
            ctx.drawImage(img, obj.x, obj.y, obj.width, obj.height)
            resolve()
          }
          img.onerror = () => resolve() // Fail silently
          img.src = asset.data
        })
      }
    }
  }

  /**
   * Export a flattened background canvas to a file
   */
  private async exportFlattenedBackground(canvas: HTMLCanvasElement, screenId: string): Promise<FlattenedBackgroundExport | null> {
    try {
      console.log(`[AssetExport] ========== EXPORTING FLATTENED BACKGROUND ==========`)
      console.log(`[AssetExport] Screen ID: ${screenId}`)
      console.log(`[AssetExport] Canvas size: ${canvas.width}x${canvas.height}`)
      console.log(`[AssetExport] Target color depth: ${this.options.colorDepth}`)
      
      // Extract image data from canvas
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not get canvas context')
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      console.log(`[AssetExport] Extracted imageData - First few pixels (RGBA):`, 
        Array.from(imageData.data.slice(0, 20)))
      
      const processedImageData: ImageData = {
        width: canvas.width,
        height: canvas.height,
        data: imageData.data
      }
      
      // Convert to target color depth
      console.log(`[AssetExport] Converting to color depth: ${this.options.colorDepth}`)
      const bitmapData = convertImageToColorDepth(processedImageData, this.options.colorDepth)
      console.log(`[AssetExport] Converted bitmap data - First few values:`, 
        Array.from(bitmapData.data.slice(0, 20)))
      
      // Generate filename
      const filename = `${screenId}.${this.getFileExtension()}`
      const exportData = this.bitmapToFile(bitmapData)
      
      console.log(`[AssetExport] Exported flattened background: ${filename}`)
      
      return {
        screenId,
        filename,
        data: exportData,
        format: this.getFileFormat()
      }
    } catch (error) {
      console.error(`[AssetExport] Failed to export flattened background:`, error)
      return null
    }
  }

  /**
   * Export a background image resized to screen size
   */
  private async exportBackgroundImage(asset: any, screen: any): Promise<BackgroundImageExport | null> {
    try {
      console.log(`[AssetExport] ========== EXPORTING BACKGROUND IMAGE ==========`)
      console.log(`[AssetExport] Asset ID: ${asset.id}`)
      console.log(`[AssetExport] Asset name: ${asset.name}`)
      console.log(`[AssetExport] Asset type: ${asset.type}`)
      console.log(`[AssetExport] Asset data type:`, typeof asset.data)
      console.log(`[AssetExport] Asset data length:`, asset.data?.length)
      console.log(`[AssetExport] Asset data starts with:`, asset.data?.substring(0, 50))
      console.log(`[AssetExport] Target dimensions: ${this.options.screenWidth}x${this.options.screenHeight}`)
      console.log(`[AssetExport] Target color depth: ${this.options.colorDepth}`)
      
      // Load and resize image to screen size
      console.log(`[AssetExport] Step 1: Loading and resizing image...`)
      const imageData = await this.loadAndResizeImage(asset.data, this.options.screenWidth, this.options.screenHeight)
      console.log(`[AssetExport] Step 1 COMPLETE - Loaded image data:`, { width: imageData.width, height: imageData.height, dataLength: imageData.data.length })
      
      // Convert to target color depth
      console.log(`[AssetExport] Step 2: Converting to color depth...`)
      const bitmapData = convertImageToColorDepth(imageData, this.options.colorDepth)
      console.log(`[AssetExport] Step 2 COMPLETE - Converted bitmap data:`, { width: bitmapData.width, height: bitmapData.height, dataLength: bitmapData.data.length })
      
      // Generate filename and export data
      const filename = `${asset.id}_background.${this.getFileExtension()}`
      console.log(`[AssetExport] Step 3: Generating file data...`)
      console.log(`[AssetExport] Generated filename: ${filename}`)
      
      const exportData = this.bitmapToFile(bitmapData)
      console.log(`[AssetExport] Step 3 COMPLETE - Generated export data:`, { length: exportData.length, format: this.getFileFormat() })
      
      const result = {
        assetId: asset.id,
        filename,
        data: exportData,
        format: this.getFileFormat() as 'pbm' | 'bmp'
      }
      
      console.log(`[AssetExport] ========== BACKGROUND IMAGE EXPORT SUCCESS ==========`)
      return result
    } catch (error) {
      console.error(`[AssetExport] ========== BACKGROUND IMAGE EXPORT FAILED ==========`)
      console.error(`[AssetExport] Error type:`, error instanceof Error ? error.constructor.name : typeof error)
      console.error(`[AssetExport] Error message:`, error instanceof Error ? error.message : String(error))
      console.error(`[AssetExport] Error stack:`, error instanceof Error ? error.stack : 'No stack trace')
      console.error(`[AssetExport] Full error object:`, error)
      return null
    }
  }

  /**
   * Export a software button in both normal and active states
   */
  private async exportSoftwareButton(
    buttonObject: any,
    screen: any,
    project: any,
    flattenedBackground: HTMLCanvasElement
  ): Promise<SoftwareButtonExport | null> {
    try {
      console.log(`[AssetExport] Exporting software button: ${buttonObject.id}`)
      console.log(`[AssetExport] Button dimensions: ${buttonObject.width}x${buttonObject.height}`)
      console.log(`[AssetExport] Target color depth: ${this.options.colorDepth}`)

      // Create normal version
      const normalCanvas = await this.renderSoftwareButtonOnBackground(
        buttonObject,
        project,
        flattenedBackground,
        false // not active
      )

      // Create active version (with darker background)
      const activeCanvas = await this.renderSoftwareButtonOnBackground(
        buttonObject,
        project,
        flattenedBackground,
        true // active
      )

      // Convert both to bitmaps
      const normalImageData = normalCanvas.getContext('2d')!.getImageData(0, 0, normalCanvas.width, normalCanvas.height)
      const activeImageData = activeCanvas.getContext('2d')!.getImageData(0, 0, activeCanvas.width, activeCanvas.height)

      const normalBitmap = convertImageToColorDepth(
        { width: normalCanvas.width, height: normalCanvas.height, data: normalImageData.data },
        this.options.colorDepth
      )

      const activeBitmap = convertImageToColorDepth(
        { width: activeCanvas.width, height: activeCanvas.height, data: activeImageData.data },
        this.options.colorDepth
      )

      // Generate filenames
      const normalFilename = `${buttonObject.id}-button-normal.${this.getFileExtension()}`
      const activeFilename = `${buttonObject.id}-button-active.${this.getFileExtension()}`

      // Convert to file format
      const normalData = this.bitmapToFile(normalBitmap)
      const activeData = this.bitmapToFile(activeBitmap)

      console.log(`[AssetExport] Generated button files: ${normalFilename}, ${activeFilename}`)

      return {
        objectId: buttonObject.id,
        normalFilename,
        activeFilename,
        normalData,
        activeData,
        format: this.getFileFormat()
      }
    } catch (error) {
      console.error(`[AssetExport] Failed to export software button ${buttonObject.id}:`, error)
      return null
    }
  }

  /**
   * Render a software button on its background
   */
  private async renderSoftwareButtonOnBackground(
    buttonObject: any,
    project: any,
    flattenedBackground: HTMLCanvasElement,
    isActive: boolean
  ): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get canvas context')

    canvas.width = buttonObject.width
    canvas.height = buttonObject.height

    // Copy background region
    ctx.drawImage(
      flattenedBackground,
      buttonObject.x, buttonObject.y, buttonObject.width, buttonObject.height,
      0, 0, buttonObject.width, buttonObject.height
    )

    // Render the button on top
    await this.renderSoftwareButton(ctx, buttonObject, project, canvas.width, canvas.height, isActive)

    return canvas
  }

  /**
   * Render a software button on a canvas context
   */
  private async renderSoftwareButton(
    ctx: CanvasRenderingContext2D,
    obj: any,
    project: any,
    width: number,
    height: number,
    isActive: boolean
  ): Promise<void> {
    // Button 3D effect constants
    const shadowOffset = 3
    const buttonWidth = width - shadowOffset
    const buttonHeight = height - shadowOffset
    
    // Normal state: button in upper-left (0,0), shadow in lower-right
    // Active state: button shifted to lower-right (3,3), no shadow
    const buttonX = isActive ? shadowOffset : 0
    const buttonY = isActive ? shadowOffset : 0

    // Draw shadow only in normal state
    if (!isActive) {
      const shadowColor = "rgba(0, 0, 0, 0.3)"
      ctx.fillStyle = shadowColor
      
      if (obj.properties.cornerRadius) {
        this.drawRoundedRect(ctx, shadowOffset, shadowOffset, buttonWidth, buttonHeight, obj.properties.cornerRadius)
        ctx.fill()
      } else {
        ctx.fillRect(shadowOffset, shadowOffset, buttonWidth, buttonHeight)
      }
    }

    // Draw button background
    const bgColor = obj.properties.backgroundColor || '#ffffff'
    if (bgColor !== 'transparent') {
      ctx.fillStyle = bgColor
      
      if (obj.properties.cornerRadius) {
        this.drawRoundedRect(ctx, buttonX, buttonY, buttonWidth, buttonHeight, obj.properties.cornerRadius)
        ctx.fill()
      } else {
        ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight)
      }
    }

    // Draw border with pixel-perfect rendering
    const borderColor = obj.properties.borderColor || '#cccccc'
    if (borderColor !== 'transparent') {
      ctx.strokeStyle = borderColor
      const borderWidth = obj.properties.borderWidth || 1
      ctx.lineWidth = borderWidth
      
      // For odd-width strokes, offset by 0.5 to get crisp lines
      const offset = borderWidth % 2 === 1 ? 0.5 : 0
      
      if (obj.properties.cornerRadius) {
        this.drawRoundedRect(ctx, buttonX + offset, buttonY + offset, buttonWidth - borderWidth, buttonHeight - borderWidth, obj.properties.cornerRadius)
        ctx.stroke()
      } else {
        ctx.strokeRect(buttonX + offset, buttonY + offset, buttonWidth - borderWidth, buttonHeight - borderWidth)
      }
    }

    // Calculate available area for content (within the smaller button rect)
    let contentStartX = buttonX
    let contentWidth = buttonWidth
    const padding = 8

    // Render icon on the left if specified
    if (obj.properties.iconAssetId) {
      const asset = project.assets.find((a: any) => a.id === obj.properties.iconAssetId)
      if (asset && asset.type === 'icon' && asset.data) {
        const iconSize = Math.min(buttonHeight - padding * 2, buttonWidth * 0.3)
        const iconX = buttonX + padding
        const iconY = buttonY + (buttonHeight - iconSize) / 2

        // Load and draw the icon at the correct position
        await new Promise<void>((resolve, reject) => {
          const img = new Image()
          img.onload = () => {
            ctx.drawImage(img, iconX, iconY, iconSize, iconSize)
            resolve()
          }
          img.onerror = () => resolve() // Fail silently
          img.src = asset.data
        })
        
        contentStartX = iconX + iconSize + padding
        contentWidth = buttonWidth - (contentStartX - buttonX) - padding
      }
    }

    // Render text centered in available area
    const text = obj.properties.text || 'Button'
    const fontMeta = project.fonts?.find((f: any) => f.id === obj.properties.fontId)
    const fontSize = fontMeta?.size || 14
    const familyName = fontMeta?.name || 'sans-serif'
    const fontWeight = obj.properties.fontWeight || 'normal'
    const textColor = obj.properties.textColor || '#000000'

    ctx.fillStyle = textColor
    ctx.font = `${fontWeight} ${fontSize}px ${familyName}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    const textX = contentStartX + contentWidth / 2
    const textY = buttonY + buttonHeight / 2
    ctx.fillText(text, textX, textY)
  }

  /**
   * Darken a color by a percentage
   */
  private darkenColor(color: string, amount: number): string {
    // Parse hex color
    const hex = color.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)

    // Darken each channel
    const newR = Math.max(0, Math.floor(r * (1 - amount)))
    const newG = Math.max(0, Math.floor(g * (1 - amount)))
    const newB = Math.max(0, Math.floor(b * (1 - amount)))

    // Convert back to hex
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`
  }

  /**
   * Export an icon usage pre-rendered on its background
   */
  private async exportIconUsage(
    asset: any, 
    iconObject: any, 
    screen: any, 
    project: any, 
    flattenedBackground: HTMLCanvasElement,
    pairIndex?: number
  ): Promise<IconUsageExport | null> {
    try {
      console.log(`[AssetExport] Exporting icon usage: ${asset.name} at (${iconObject.x}, ${iconObject.y})`)
      console.log(`[AssetExport] Icon dimensions: ${iconObject.width}x${iconObject.height}`)
      console.log(`[AssetExport] Target color depth: ${this.options.colorDepth}`)
      
      // Create a canvas to render the icon on its background
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not get canvas context')

      canvas.width = iconObject.width
      canvas.height = iconObject.height

      // Clone the flattened background by cropping the relevant region
      ctx.drawImage(
        flattenedBackground,
        iconObject.x, iconObject.y, iconObject.width, iconObject.height, // Source region
        0, 0, iconObject.width, iconObject.height // Destination
      )

      // Render the icon on top
      await this.renderIconOnCanvas(ctx, asset.data, iconObject, canvas.width, canvas.height)

      // Extract the rendered image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const processedImageData: ImageData = {
        width: canvas.width,
        height: canvas.height,
        data: imageData.data
      }
      
      console.log(`[AssetExport] Rendered icon image data:`, { width: processedImageData.width, height: processedImageData.height, dataLength: processedImageData.data.length })

      // Convert to target color depth
      const bitmapData = convertImageToColorDepth(processedImageData, this.options.colorDepth)
      console.log(`[AssetExport] Converted icon bitmap data:`, { width: bitmapData.width, height: bitmapData.height, dataLength: bitmapData.data.length })
      
      // Generate filename and objectId based on type
      let objectId: string
      let filename: string
      
      if (pairIndex !== undefined) {
        // For iconpairs in MQTTIconField
        const pairs = iconObject.properties.valueIconPairs || []
        const pair = pairs[pairIndex]
        objectId = pair.id || `iconpair-${pairIndex}`
        filename = `${objectId}.${this.getFileExtension()}`
      } else {
        // For regular icon objects
        objectId = iconObject.id
        filename = `${objectId}.${this.getFileExtension()}`
      }
      
      const usageId = pairIndex !== undefined 
        ? `${asset.id}_${iconObject.id}_rule${pairIndex}_${iconObject.x}_${iconObject.y}`
        : `${asset.id}_${iconObject.id}_${iconObject.x}_${iconObject.y}`
      
      console.log(`[AssetExport] Generated icon filename: ${filename}`)
      
      const exportData = this.bitmapToFile(bitmapData)
      console.log(`[AssetExport] Generated icon export data:`, { length: exportData.length, format: this.getFileFormat() })

      return {
        assetId: asset.id,
        objectId,
        usageId,
        filename,
        data: exportData,
        format: this.getFileFormat(),
        backgroundContext: {
          x: iconObject.x,
          y: iconObject.y,
          width: iconObject.width,
          height: iconObject.height,
          backgroundColor: screen.backgroundColor,
          backgroundImage: screen.backgroundImageAssetId
        }
      }
    } catch (error) {
      console.error(`[AssetExport] Failed to export icon usage ${asset.name}:`, error)
      return null
    }
  }


  /**
   * Render an icon on the canvas
   */
  private async renderIconOnCanvas(
    ctx: CanvasRenderingContext2D,
    iconData: string,
    iconObject: any,
    canvasWidth: number,
    canvasHeight: number
  ): Promise<void> {
    try {
      if (iconData.startsWith('data:image/svg+xml')) {
        // Handle SVG icons
        const img = new Image()
        
        return new Promise((resolve, reject) => {
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight)
            resolve()
          }
          img.onerror = reject
          img.src = iconData
        })
      } else {
        // Handle other image formats
        const img = new Image()
        
        return new Promise((resolve, reject) => {
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight)
            resolve()
          }
          img.onerror = reject
          img.src = iconData
        })
      }
    } catch (error) {
      console.error('[AssetExport] Failed to render icon on canvas:', error)
      throw error
    }
  }

  /**
   * Load and resize an image to target dimensions
   */
  private async loadAndResizeImage(dataUrl: string, targetWidth: number, targetHeight: number): Promise<ImageData> {
    console.log(`[AssetExport] Loading and resizing image to ${targetWidth}x${targetHeight}`)
    console.log(`[AssetExport] Data URL starts with:`, dataUrl.substring(0, 50))
    
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get canvas context')

    canvas.width = targetWidth
    canvas.height = targetHeight

    const img = new Image()
    
    return new Promise((resolve, reject) => {
      img.onload = () => {
        console.log(`[AssetExport] Image loaded successfully, natural size: ${img.naturalWidth}x${img.naturalHeight}`)
        
        // Draw image scaled to target size (this changes aspect ratio if needed)
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight)
        
        console.log(`[AssetExport] Image drawn to canvas, extracted image data:`, { 
          width: imageData.width, 
          height: imageData.height, 
          dataLength: imageData.data.length 
        })
        
        resolve({
          width: targetWidth,
          height: targetHeight,
          data: imageData.data
        })
      }
      img.onerror = (error) => {
        console.error(`[AssetExport] Failed to load image:`, error)
        reject(error)
      }
      img.src = dataUrl
    })
  }

  /**
   * Draw a rounded rectangle path
   */
  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ): void {
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + width - radius, y)
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
    ctx.lineTo(x + width, y + height - radius)
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
    ctx.lineTo(x + radius, y + height)
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
    ctx.lineTo(x, y + radius)
    ctx.quadraticCurveTo(x, y, x + radius, y)
    ctx.closePath()
  }

  /**
   * Get file extension based on color depth
   */
  private getFileExtension(): string {
    switch (this.options.colorDepth) {
      case '1bit':
        return 'pbm'
      case '4bit':
      case '24bit':
        return 'bmp'
      default:
        return 'bmp'
    }
  }

  /**
   * Get file format based on color depth
   */
  private getFileFormat(): 'pbm' | 'bmp' {
    return this.options.colorDepth === '1bit' ? 'pbm' : 'bmp'
  }

  /**
   * Convert bitmap data to file format
   */
  private bitmapToFile(bitmap: BitmapData): Uint8Array {
    console.log(`[AssetExport] Converting bitmap to file format for color depth: ${this.options.colorDepth}`)
    
    switch (this.options.colorDepth) {
      case '1bit':
        console.log('[AssetExport] Using PBM format for 1-bit')
        return this.bitmapToPBM(bitmap)
      case '4bit':
        console.log('[AssetExport] Using BMP4Bit format for 4-bit')
        return this.bitmapToBMP4Bit(bitmap)
      case '24bit':
        console.log('[AssetExport] Using BMP24Bit format for 24-bit')
        return this.bitmapToBMP24Bit(bitmap)
      default:
        console.log('[AssetExport] Using default BMP24Bit format')
        return this.bitmapToBMP24Bit(bitmap)
    }
  }

  /**
   * Convert bitmap to PBM format (1-bit)
   */
  private bitmapToPBM(bitmap: BitmapData): Uint8Array {
    const { width, height, data } = bitmap
    
    // PBM P4 format header
    const header = `P4\n${width} ${height}\n`
    const headerBytes = new TextEncoder().encode(header)
    
    // Pack 1-bit data into bytes
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
    
    return result
  }

  /**
   * Convert bitmap to BMP format (4-bit grayscale)
   */
  private bitmapToBMP4Bit(bitmap: BitmapData): Uint8Array {
    const { width, height, data } = bitmap
    
    console.log('[AssetExport] bitmapToBMP4Bit - Input data:', {
      width, height,
      dataLength: data.length,
      expectedLength: width * height,
      firstPixels: Array.from(data.slice(0, 20))
    })
    
    // BMP header for 4-bit grayscale
    const bmpHeader = new Uint8Array(54)
    
    // File header
    bmpHeader[0] = 0x42 // 'B'
    bmpHeader[1] = 0x4D // 'M'
    
    const bytesPerRow = Math.ceil(width / 2) // 2 pixels per byte
    const rowSize = Math.ceil(bytesPerRow / 4) * 4 // Align to 4-byte boundary
    const dataSize = rowSize * height // 4 bits per pixel with row padding
    const paletteSize = 16 * 4 // 16 colors * 4 bytes each (BGR + reserved)
    const fileSize = 54 + paletteSize + dataSize
    
    bmpHeader[2] = fileSize & 0xFF
    bmpHeader[3] = (fileSize >> 8) & 0xFF
    bmpHeader[4] = (fileSize >> 16) & 0xFF
    bmpHeader[5] = (fileSize >> 24) & 0xFF
    
    bmpHeader[10] = 54 + paletteSize // Offset to pixel data
    
    // DIB header
    bmpHeader[14] = 40 // DIB header size
    bmpHeader[18] = width & 0xFF
    bmpHeader[19] = (width >> 8) & 0xFF
    bmpHeader[20] = (width >> 16) & 0xFF
    bmpHeader[21] = (width >> 24) & 0xFF
    
    bmpHeader[22] = height & 0xFF
    bmpHeader[23] = (height >> 8) & 0xFF
    bmpHeader[24] = (height >> 16) & 0xFF
    bmpHeader[25] = (height >> 24) & 0xFF
    
    bmpHeader[26] = 1 // Planes
    bmpHeader[28] = 4 // Bits per pixel
    
    // Create grayscale palette (16 shades)
    const palette = new Uint8Array(paletteSize)
    for (let i = 0; i < 16; i++) {
      const grayValue = (i * 255) / 15
      const paletteIndex = i * 4
      palette[paletteIndex] = grayValue // B
      palette[paletteIndex + 1] = grayValue // G
      palette[paletteIndex + 2] = grayValue // R
      palette[paletteIndex + 3] = 0 // Reserved
    }
    
    // Pack pixel data (4 bits per pixel)
    const pixelData = new Uint8Array(rowSize * height)
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x += 2) {
        const pixelIndex = y * width + x
        const dataIndex = (height - 1 - y) * rowSize + Math.floor(x / 2)
        
        const pixel1 = Math.round(data[pixelIndex] / 17) // Convert to 4-bit
        const pixel2 = x + 1 < width ? Math.round(data[pixelIndex + 1] / 17) : 0
        
        pixelData[dataIndex] = (pixel1 << 4) | pixel2
      }
    }
    
    // Combine all parts
    const result = new Uint8Array(bmpHeader.length + palette.length + pixelData.length)
    result.set(bmpHeader, 0)
    result.set(palette, bmpHeader.length)
    result.set(pixelData, bmpHeader.length + palette.length)
    
    console.log('[AssetExport] bitmapToBMP4Bit - Output:', {
      headerLength: bmpHeader.length,
      paletteLength: palette.length,
      pixelDataLength: pixelData.length,
      totalLength: result.length,
      bitsPerPixel: bmpHeader[28],
      firstHeaderBytes: Array.from(result.slice(0, 20)),
      firstPaletteBytes: Array.from(result.slice(54, 74))
    })
    
    return result
  }

  /**
   * Convert bitmap to BMP format (24-bit RGB)
   */
  private bitmapToBMP24Bit(bitmap: BitmapData): Uint8Array {
    const { width, height, data } = bitmap
    
    console.log(`[AssetExport] bitmapToBMP24Bit called with:`, {
      width,
      height,
      dataLength: data.length,
      expectedLength: width * height * 3,
      isCorrectLength: data.length === width * height * 3
    })
    
    // BMP header for 24-bit RGB
    const bmpHeader = new Uint8Array(54)
    
    // File header
    bmpHeader[0] = 0x42 // 'B'
    bmpHeader[1] = 0x4D // 'M'
    
    const rowSize = Math.ceil((width * 3) / 4) * 4 // Align to 4-byte boundary
    const dataSize = rowSize * height
    const fileSize = 54 + dataSize
    
    bmpHeader[2] = fileSize & 0xFF
    bmpHeader[3] = (fileSize >> 8) & 0xFF
    bmpHeader[4] = (fileSize >> 16) & 0xFF
    bmpHeader[5] = (fileSize >> 24) & 0xFF
    
    bmpHeader[10] = 54 // Offset to pixel data
    
    // DIB header
    bmpHeader[14] = 40 // DIB header size
    bmpHeader[18] = width & 0xFF
    bmpHeader[19] = (width >> 8) & 0xFF
    bmpHeader[20] = (width >> 16) & 0xFF
    bmpHeader[21] = (width >> 24) & 0xFF
    
    bmpHeader[22] = height & 0xFF
    bmpHeader[23] = (height >> 8) & 0xFF
    bmpHeader[24] = (height >> 16) & 0xFF
    bmpHeader[25] = (height >> 24) & 0xFF
    
    bmpHeader[26] = 1 // Planes
    bmpHeader[28] = 24 // Bits per pixel
    
    // Convert pixel data (BMP is bottom-up, so flip Y)
    const pixelData = new Uint8Array(dataSize)
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Source index: RGB data is stored as [R,G,B,R,G,B,...]
        const srcIndex = ((height - 1 - y) * width + x) * 3
        const dstIndex = y * rowSize + x * 3
        
        // Data is already in RGB format, but BMP expects BGR
        pixelData[dstIndex] = data[srcIndex + 2] // B
        pixelData[dstIndex + 1] = data[srcIndex + 1] // G  
        pixelData[dstIndex + 2] = data[srcIndex] // R
      }
    }
    
    console.log(`[AssetExport] BMP24Bit conversion complete:`, {
      headerSize: bmpHeader.length,
      pixelDataSize: pixelData.length,
      totalSize: bmpHeader.length + pixelData.length,
      rowSize,
      dataSize,
      fileSize
    })
    
    // Combine header and pixel data
    const result = new Uint8Array(bmpHeader.length + pixelData.length)
    result.set(bmpHeader, 0)
    result.set(pixelData, bmpHeader.length)
    
    return result
  }
}
