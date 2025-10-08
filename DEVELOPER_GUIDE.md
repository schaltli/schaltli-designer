# Developer Guide - Refactored Codebase

## 📚 Quick Reference for Common Tasks

This guide helps you navigate the refactored codebase and make changes safely.

---

## 🗺️ Where to Find Things

### Rendering Logic
All object rendering is now in separate files:

| Object Type | File Location |
|-------------|---------------|
| Labels | `components/canvas/renderers/render-label.ts` |
| MQTT Data Fields | `components/canvas/renderers/render-mqtt-field.ts` |
| Level Indicators | `components/canvas/renderers/render-level-indicator.ts` |
| Icons | `components/canvas/renderers/render-icon.ts` |
| Boxes/Rectangles | `components/canvas/renderers/render-box.ts` |
| Lines | `components/canvas/renderers/render-line.ts` |

### Font Utilities
All font-related functions are in:
- `lib/font-utils.ts`

### Main Canvas Logic
- `components/canvas/canvas.tsx` - Orchestrates rendering, handles interactions

### Project State Management
- `components/screenman-editor.tsx` - Main project state and operations

### Property Panels
- `components/property-panel/` - UI for editing object properties

---

## 🔧 Common Tasks

### Task 1: Fix a Bug in Label Rendering

**Problem**: Labels aren't aligning correctly

**Solution**:
1. Open `components/canvas/renderers/render-label.ts`
2. Find the text alignment logic (look for `calculateAlignedX`)
3. Make your changes
4. Test by creating/editing labels in the app

**Why this is safe**: Changes only affect labels, not other object types.

---

### Task 2: Change How Text Height is Calculated

**Problem**: Text objects are too tall/short

**Solution**:
1. Open `lib/font-utils.ts`
2. Find `calculateTextObjectHeight` function
3. Adjust the multiplier (currently `1.3`)
4. Save and test

**Why this is safe**: Single function affects all text objects consistently.

---

### Task 3: Add a New Text Alignment Option

**Problem**: Need to add "justify" alignment

**Solution**:
1. Add the calculation logic to `calculateAlignedX` in `lib/font-utils.ts`
2. Update `render-label.ts` to use the new alignment
3. Update `render-mqtt-field.ts` to use the new alignment
4. Add UI option in `label-properties.tsx` and `mqtt-data-field-properties.tsx`

**Files to modify**:
- `lib/font-utils.ts` (add calculation)
- `components/canvas/renderers/render-label.ts` (use it)
- `components/canvas/renderers/render-mqtt-field.ts` (use it)
- `components/property-panel/label-properties.tsx` (add UI)
- `components/property-panel/mqtt-data-field-properties.tsx` (add UI)

---

### Task 4: Add a New Object Type (e.g., "Button")

**Solution**:
1. Create `components/canvas/renderers/render-button.ts`
   ```typescript
   import type { ScreenmanObject } from "@/components/screenman-editor"
   
   interface RenderButtonOptions {
     ctx: CanvasRenderingContext2D
     obj: ScreenmanObject
     zoom: number
     isSelected: boolean
   }
   
   export function renderButton(options: RenderButtonOptions): void {
     const { ctx, obj, zoom, isSelected } = options
     
     // Your rendering logic here
     ctx.fillStyle = obj.properties.backgroundColor || "#007bff"
     ctx.fillRect(obj.x, obj.y, obj.width, obj.height)
     
     // Add text, borders, etc.
   }
   ```

2. Import and use it in `canvas.tsx`:
   ```typescript
   import { renderButton } from "./renderers/render-button"
   
   // In drawObject function:
   case "button":
     renderButton({ ctx, obj, zoom, isSelected })
     break
   ```

3. Add the type to `ScreenmanObject` interface in `screenman-editor.tsx`
4. Add toolbar button in `toolbar.tsx`
5. Create property panel in `property-panel/button-properties.tsx`

---

### Task 5: Change Baseline Guide Color

**Problem**: Red baseline is hard to see

**Solution**:
1. Open `components/canvas/renderers/render-label.ts`
2. Find the line: `ctx.strokeStyle = "rgba(220, 38, 38, 0.35)"`
3. Change to your preferred color (e.g., `"rgba(59, 130, 246, 0.5)"` for blue)
4. Repeat for `render-mqtt-field.ts` if needed

**Why this is safe**: Only affects visual guides, not functionality.

---

### Task 6: Fix MQTT Icon Matching Logic

**Problem**: Icons not showing for certain values

**Solution**:
1. Open `components/canvas/renderers/render-mqtt-field.ts`
2. Find the `renderIconMode` function
3. Look at the value matching logic (comparison operators)
4. Make your changes
5. Test with different MQTT values

**Why this is safe**: Icon logic is isolated from text rendering.

---

### Task 7: Add a New Font Loading Method

**Problem**: Need to load fonts from a different source

**Solution**:
1. Open `lib/font-utils.ts`
2. Add a new function (e.g., `loadFontFromURL`)
3. Update `ensureTTFFont` to support the new method
4. Use it in the renderers

**Why this is safe**: Font loading is centralized, easy to extend.

---

## 🎯 Best Practices

### 1. **Keep Renderers Focused**
- Each renderer should only handle drawing its object type
- Don't add business logic to renderers
- Keep them pure functions when possible

### 2. **Use Utility Functions**
- If you need the same calculation in multiple places, add it to `font-utils.ts`
- Don't duplicate code between renderers

### 3. **Test Incrementally**
- Make small changes
- Test after each change
- Use the browser's dev tools to debug canvas rendering

### 4. **Update Documentation**
- If you add a new renderer, document it in `REFACTORING_SUMMARY.md`
- Add comments for complex logic

### 5. **Follow the Pattern**
- Look at existing renderers for examples
- Use the same parameter patterns
- Keep consistent naming conventions

---

## 🐛 Debugging Tips

### Canvas Not Rendering?
1. Check browser console for errors
2. Verify the renderer is being called (add `console.log`)
3. Check if the object type matches the switch case
4. Verify canvas context is valid

### Text Not Appearing?
1. Check if font is loaded (look for font loading errors)
2. Verify `baselineOffset` is calculated correctly
3. Check text color isn't same as background
4. Verify text alignment calculations

### Icons Not Showing?
1. Check if asset exists in `projectAssets`
2. Verify SVG data is valid
3. Check icon cache (might need to clear)
4. Look for image loading errors in console

### Objects Not Snapping?
1. Snapping logic is still in `canvas.tsx` (not yet refactored)
2. Check `calculateSnap` function
3. Verify snap guides are being generated

---

## 📖 Code Reading Guide

### Understanding a Renderer

When reading a renderer file, look for these sections:

1. **Imports** - What dependencies does it have?
2. **Interface** - What parameters does it need?
3. **Main function** - The exported render function
4. **Helper functions** - Supporting logic (if any)

Example structure:
```typescript
// 1. Imports
import type { ScreenmanObject } from "@/components/screenman-editor"
import { getBaselineY } from "@/lib/font-utils"

// 2. Interface
interface RenderOptions {
  ctx: CanvasRenderingContext2D
  obj: ScreenmanObject
  // ... other params
}

// 3. Main function
export function renderSomething(options: RenderOptions): void {
  const { ctx, obj } = options
  
  // Drawing logic here
}

// 4. Helper functions (optional)
function helperFunction() {
  // Supporting logic
}
```

### Understanding Font Utilities

The `font-utils.ts` file has these key functions:

1. **`calculateTextObjectHeight`** - Determines object height from font size
2. **`getBaselineY`** - Calculates where to draw text baseline
3. **`loadTTFFont`** - Loads a TrueType font
4. **`ensureTTFFont`** - Loads font with caching
5. **`calculateAlignedX`** - Calculates X position for text alignment

---

## 🚨 Common Pitfalls

### ❌ DON'T: Modify canvas.tsx for rendering changes
```typescript
// BAD - Don't add rendering logic to canvas.tsx
case "label":
  ctx.fillStyle = "red" // Don't do this!
  renderLabel(...)
```

### ✅ DO: Modify the specific renderer
```typescript
// GOOD - Change the renderer file
// In render-label.ts:
ctx.fillStyle = obj.properties.color || "#000000"
```

---

### ❌ DON'T: Duplicate font calculations
```typescript
// BAD - Don't calculate height inline
const height = Math.round(fontSize * 1.3)
```

### ✅ DO: Use the utility function
```typescript
// GOOD - Use the centralized function
import { calculateTextObjectHeight } from "@/lib/font-utils"
const height = calculateTextObjectHeight(fontSize)
```

---

### ❌ DON'T: Mix rendering logic between object types
```typescript
// BAD - Don't share rendering code between types
case "label":
  drawTextAndIcon() // Mixing label and icon logic
```

### ✅ DO: Keep each renderer independent
```typescript
// GOOD - Each renderer is self-contained
case "label":
  renderLabel(...)
case "icon":
  renderIcon(...)
```

---

## 📞 Getting Help

### Questions?
1. Read the `REFACTORING_SUMMARY.md` for overview
2. Look at similar existing code
3. Check browser console for errors
4. Add `console.log` statements to debug

### Found a Bug?
1. Identify which renderer is affected
2. Open the specific renderer file
3. Add logging to understand the issue
4. Fix and test

### Want to Add a Feature?
1. Determine which files need changes
2. Follow the patterns in existing code
3. Test thoroughly
4. Update documentation

---

## 🎓 Learning Resources

### Understanding Canvas Rendering
- [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Canvas Text Rendering](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Drawing_text)

### Understanding Font Metrics
- [Font Baseline](https://developer.mozilla.org/en-US/docs/Web/CSS/vertical-align)
- [TextMetrics API](https://developer.mozilla.org/en-US/docs/Web/API/TextMetrics)

### TypeScript Patterns
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [React TypeScript](https://react-typescript-cheatsheet.netlify.app/)

---

## ✅ Checklist for Making Changes

Before submitting your changes:

- [ ] Code compiles without errors
- [ ] No linter warnings
- [ ] Tested the specific object type you modified
- [ ] Tested that other object types still work
- [ ] Added comments for complex logic
- [ ] Updated documentation if needed
- [ ] Followed existing code patterns
- [ ] No console errors in browser

---

**Happy Coding! 🚀**

If you have questions or suggestions for improving this guide, please update it!
