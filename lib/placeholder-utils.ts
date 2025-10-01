// Utility functions for processing placeholder tokens in label text

export interface PlaceholderContext {
  screenName: string
  screenWidth: number
  screenHeight: number
  projectName: string
  exportDate: string
  exportTime: string
  exportDateTime: string
}

export const AVAILABLE_PLACEHOLDERS = [
  { token: "{screen}", description: "Current screen name" },
  { token: "{screen_width}", description: "Screen width in pixels" },
  { token: "{screen_height}", description: "Screen height in pixels" },
  { token: "{project}", description: "Project name" },
  { token: "{export_date}", description: "Current date (YYYY-MM-DD)" },
  { token: "{export_time}", description: "Current time (HH:MM:SS)" },
  { token: "{export_datetime}", description: "Current date and time" },
] as const

/**
 * Process placeholder tokens in text and replace them with actual values
 */
export function processPlaceholders(text: string, context: PlaceholderContext): string {
  if (!text) return text

  let processedText = text

  // Replace each placeholder token with its corresponding value
  processedText = processedText.replace(/\{screen\}/g, context.screenName)
  processedText = processedText.replace(/\{screen_width\}/g, context.screenWidth.toString())
  processedText = processedText.replace(/\{screen_height\}/g, context.screenHeight.toString())
  processedText = processedText.replace(/\{project\}/g, context.projectName)
  processedText = processedText.replace(/\{export_date\}/g, context.exportDate)
  processedText = processedText.replace(/\{export_time\}/g, context.exportTime)
  processedText = processedText.replace(/\{export_datetime\}/g, context.exportDateTime)

  return processedText
}

/**
 * Create a placeholder context from current application state
 */
export function createPlaceholderContext(
  screenName: string,
  screenWidth: number,
  screenHeight: number,
  projectName: string,
): PlaceholderContext {
  const now = new Date()

  return {
    screenName,
    screenWidth,
    screenHeight,
    projectName,
    exportDate: now.toISOString().split("T")[0], // YYYY-MM-DD
    exportTime: now.toTimeString().split(" ")[0], // HH:MM:SS
    exportDateTime: now.toLocaleString(),
  }
}
