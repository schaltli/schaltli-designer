import type { ScreenmanProject, ScreenmanObject } from "@/components/screenman-editor"

export interface ESP32Object {
  id: string
  type: "MqttDataField" | "label" | "icon" | "line" | "box"
  x: number
  y: number
  width: number
  height: number
  properties: Record<string, any>
  zIndex: number
}

export interface ESP32Screen {
  id: string
  name: string
  objects: ESP32Object[]
  backgroundImageAssetId?: string // Added background asset reference to export format
}

export interface ESP32Export {
  projectName: string
  version: string
  exportedAt: string
  screenWidth: number
  screenHeight: number
  screens: ESP32Screen[]
  assets: {
    id: string
    name: string
    type: string
    data: string
  }[]
  topics: {
    topic: string
    type: "numeric" | "text" | "json"
    examples: string
  }[]
  metadata: {
    totalScreens: number
    totalObjects: number
    exportFormat: string
  }
}

export interface ArduinoExport {
  headerFile: string
  implementationFile: string
  readme: string
}

export class ExportManager {
  static exportToESP32(project: ScreenmanProject): ESP32Export {
    const totalObjects = project.screens.reduce((sum, screen) => sum + screen.objects.length, 0)

    return {
      projectName: project.name,
      version: "1.0",
      exportedAt: new Date().toISOString(),
      screenWidth: project.screenWidth,
      screenHeight: project.screenHeight,
      screens: project.screens.map((screen) => ({
        id: screen.id,
        name: screen.name,
        objects: screen.objects.map((obj) => ({
          id: obj.id,
          type: obj.type,
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
          properties: this.sanitizePropertiesForESP32(obj),
          zIndex: obj.zIndex,
        })),
        backgroundImageAssetId: screen.backgroundImageAssetId,
      })),
      assets: project.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        data: asset.data,
      })),
      topics: (project.topics || []).map((topic) => ({
        topic: topic.topic,
        type: topic.type,
        examples: Array.isArray(topic.examples) ? topic.examples.join(", ") : topic.examples,
      })),
      metadata: {
        totalScreens: project.screens.length,
        totalObjects,
        exportFormat: "esp32",
      },
    }
  }

  static exportToArduino(project: ScreenmanProject): ArduinoExport {
    const className = this.toCamelCase(project.name)
    const headerFile = this.generateArduinoHeader(project, className)
    const implementationFile = this.generateArduinoImplementation(project, className)
    const readme = this.generateArduinoReadme(project)

    return {
      headerFile,
      implementationFile,
      readme,
    }
  }

  static exportToJSON(project: ScreenmanProject): string {
    return JSON.stringify(project, null, 2)
  }

  private static sanitizePropertiesForESP32(obj: ScreenmanObject): Record<string, any> {
    const sanitized: Record<string, any> = {}

    Object.entries(obj.properties).forEach(([key, value]) => {
      if (key === "topic" && typeof value === "string") {
        // Store the topic name directly
        sanitized["topic"] = value
      }
      // Convert recolorations array to a simple color map for ESP32
      else if (key === "recolorations" && Array.isArray(value)) {
        const colorMap: Record<string, { r: number; g: number; b: number }> = {}
        value.forEach((recoloration: any) => {
          if (recoloration.originalColor && recoloration.newColor) {
            colorMap[recoloration.originalColor] = this.convertColorToRGB(recoloration.newColor)
          }
        })
        sanitized["colorReplacements"] = colorMap
      }
      // Convert color values to RGB format for ESP32
      else if (key.includes("color") || key.includes("Color")) {
        if (typeof value === "string") {
          sanitized[key] = this.convertColorToRGB(value)
        } else {
          // Skip non-string color values (like arrays or objects)
          console.warn(`[v0] Skipping non-string color value for key ${key}:`, value)
        }
      } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        sanitized[key] = value
      }
    })

    return sanitized
  }

  private static convertColorToRGB(color: string): { r: number; g: number; b: number } {
    if (typeof color !== "string") {
      console.warn("[v0] convertColorToRGB received non-string value:", color)
      return { r: 0, g: 0, b: 0 }
    }

    // Handle hex colors
    if (color.startsWith("#")) {
      const hex = color.slice(1)
      const r = Number.parseInt(hex.slice(0, 2), 16)
      const g = Number.parseInt(hex.slice(2, 4), 16)
      const b = Number.parseInt(hex.slice(4, 6), 16)
      return { r, g, b }
    }

    // Handle hsl colors (basic conversion)
    if (color.startsWith("hsl")) {
      // For simplicity, return a default color for hsl
      return { r: 0, g: 0, b: 0 }
    }

    if (color.startsWith("rgb")) {
      const matches = color.match(/\d+/g)
      if (matches && matches.length >= 3) {
        return {
          r: Number.parseInt(matches[0]),
          g: Number.parseInt(matches[1]),
          b: Number.parseInt(matches[2]),
        }
      }
    }

    // Default to black
    return { r: 0, g: 0, b: 0 }
  }

  private static toCamelCase(str: string): string {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase()
      })
      .replace(/\s+/g, "")
  }

  private static generateArduinoHeader(project: ScreenmanProject, className: string): string {
    return `#ifndef ${className.toUpperCase()}_H
#define ${className.toUpperCase()}_H

#include <Arduino.h>
#include <ArduinoJson.h>

class ${className} {
public:
    ${className}();
    void init();
    void drawScreen(int screenIndex);
    void drawObject(JsonObject obj);
    int getScreenCount();
    
private:
    static const int SCREEN_COUNT = ${project.screens.length};
    void drawMqttDataField(JsonObject obj);
    void drawLabel(JsonObject obj);
    void drawIcon(JsonObject obj);
    void drawLine(JsonObject obj);
    void drawBox(JsonObject obj);
};

#endif // ${className.toUpperCase()}_H`
  }

  private static generateArduinoImplementation(project: ScreenmanProject, className: string): string {
    const screensData = JSON.stringify(this.exportToESP32(project), null, 2)

    return `#include "${className}.h"

// Project data generated by Screenman
const char* projectData = R"(${screensData})";

${className}::${className}() {
    // Constructor
}

void ${className}::init() {
    // Initialize display and JSON parser
    Serial.begin(115200);
    Serial.println("${project.name} initialized");
    
    DynamicJsonDocument doc(8192);
    deserializeJson(doc, projectData);
    JsonArray topics = doc["topics"];
    Serial.print("Loaded ");
    Serial.print(topics.size());
    Serial.println(" MQTT topics");
}

void ${className}::drawScreen(int screenIndex) {
    DynamicJsonDocument doc(8192);
    deserializeJson(doc, projectData);
    
    JsonArray screens = doc["screens"];
    if (screenIndex >= 0 && screenIndex < screens.size()) {
        JsonObject screen = screens[screenIndex];
        JsonArray objects = screen["objects"];
        String backgroundImageAssetId = screen["backgroundImageAssetId"] | "";
        
        // Clear screen
        // display.clearDisplay(); // Uncomment for your display library
        
        // Draw background image if available
        if (backgroundImageAssetId != "") {
            // Code to draw background image
            // display.drawBitmap(x, y, bitmapData, width, height, SSD1306_WHITE);
        }
        
        // Draw all objects
        for (JsonObject obj : objects) {
            drawObject(obj);
        }
        
        // Update display
        // display.display(); // Uncomment for your display library
    }
}

void ${className}::drawObject(JsonObject obj) {
    String type = obj["type"];
    
    if (type == "MqttDataField") {
        drawMqttDataField(obj);
    } else if (type == "label") {
        drawLabel(obj);
    } else if (type == "icon") {
        drawIcon(obj);
    } else if (type == "line") {
        drawLine(obj);
    } else if (type == "box") {
        drawBox(obj);
    }
}

void ${className}::drawMqttDataField(JsonObject obj) {
    int x = obj["x"];
    int y = obj["y"];
    int width = obj["width"];
    int height = obj["height"];
    
    // Draw MQTT data field border
    // display.drawRect(x, y, width, height, SSD1306_WHITE);
    
    // Draw placeholder text
    JsonObject props = obj["properties"];
    String topic = props["topic"] | "MqttDataField";
    // display.setCursor(x + 2, y + 2);
    // display.print(topic);
    
    // You can now lookup topic configuration from the topics array
    // DynamicJsonDocument doc(8192);
    // deserializeJson(doc, projectData);
    // JsonArray topics = doc["topics"];
    // for (JsonObject topicObj : topics) {
    //     if (topicObj["topic"] == topic) {
    //         String type = topicObj["type"];
    //         String examples = topicObj["examples"];
    //         // Use topic configuration for display formatting
    //         break;
    //     }
    // }
}

void ${className}::drawLabel(JsonObject obj) {
    int x = obj["x"];
    int y = obj["y"];
    
    JsonObject props = obj["properties"];
    String text = props["text"] | "Label";
    int fontSize = props["fontSize"] | 14;
    
    // Set text size based on fontSize
    // display.setTextSize(fontSize / 8); // Adjust for your display
    // display.setCursor(x, y);
    // display.print(text);
}

void ${className}::drawIcon(JsonObject obj) {
    int x = obj["x"];
    int y = obj["y"];
    int width = obj["width"];
    int height = obj["height"];
    
    // Draw icon placeholder
    // display.drawRect(x, y, width, height, SSD1306_WHITE);
    // display.setCursor(x + width/4, y + height/4);
    // display.print("I");
}

void ${className}::drawLine(JsonObject obj) {
    int x = obj["x"];
    int y = obj["y"];
    int width = obj["width"];
    int height = obj["height"];
    
    // Draw line
    // display.drawLine(x, y, x + width, y + height, SSD1306_WHITE);
}

void ${className}::drawBox(JsonObject obj) {
    int x = obj["x"];
    int y = obj["y"];
    int width = obj["width"];
    int height = obj["height"];
    
    JsonObject props = obj["properties"];
    // You can access fill and stroke colors from props
    
    // Draw filled rectangle
    // display.fillRect(x, y, width, height, SSD1306_WHITE);
}

int ${className}::getScreenCount() {
    return SCREEN_COUNT;
}`
  }

  private static generateArduinoReadme(project: ScreenmanProject): string {
    return `# ${project.name} - Arduino Project

This Arduino project was generated by Screenman, a web-based screen editor for embedded displays.

## Project Information
- **Project Name**: ${project.name}
- **Total Screens**: ${project.screens.length}
- **Total Objects**: ${project.screens.reduce((sum, screen) => sum + screen.objects.length, 0)}
- **Generated**: ${new Date().toLocaleDateString()}

## Screen Dimensions
- **All Screens**: ${project.screenWidth} × ${project.screenHeight} pixels

## Required Libraries
- ArduinoJson (for parsing project data)
- Display library (e.g., Adafruit_SSD1306, U8g2, etc.)

## Installation
1. Install the required libraries through the Arduino Library Manager
2. Copy the generated .h and .cpp files to your Arduino project
3. Include the header file in your main sketch
4. Uncomment and adapt the display-specific code for your hardware

## Usage Example
\`\`\`cpp
#include "${this.toCamelCase(project.name)}.h"

${this.toCamelCase(project.name)} screenManager;

void setup() {
    screenManager.init();
    // Initialize your display here
}

void loop() {
    // Draw screen 0
    screenManager.drawScreen(0);
    delay(1000);
    
    // Cycle through all screens
    for (int i = 0; i < screenManager.getScreenCount(); i++) {
        screenManager.drawScreen(i);
        delay(2000);
    }
}
\`\`\`

## Customization
The generated code includes placeholder comments for display-specific functions. 
You'll need to uncomment and adapt these for your specific display library:

- \`display.clearDisplay()\` - Clear the display
- \`display.drawRect()\` - Draw rectangles
- \`display.setCursor()\` - Set text cursor position
- \`display.print()\` - Print text
- \`display.display()\` - Update the display

## Support
This code was generated by Screenman. For issues with the generated code, 
please check your display library documentation and adapt the drawing functions accordingly.
`
  }
}
