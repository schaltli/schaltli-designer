"use client"
import type { ScreenmanObject, ScreenmanAsset, ScreenmanFont, MQTTTopic, HardwareButton } from "../screenman-editor"
import { MqttDataFieldProperties } from "./mqtt-data-field-properties"
import { MqttIconFieldProperties } from "./mqtt-icon-field-properties"
import { TextFieldProperties } from "./text-field-properties"
import { LabelProperties } from "./label-properties"
import { BoxProperties } from "./box-properties"
import { LineProperties } from "./line-properties"
import { MqttDataLineProperties } from "./mqtt-data-line-properties"
import { IconProperties } from "./icon-properties"
import { LevelIndicatorProperties } from "./level-indicator-properties"
import { SoftwareButtonProperties } from "./software-button-properties"
import { ScreenProperties } from "./screen-properties"
import { MultiSelectionProperties } from "./multi-selection-properties"
import { HardwareButtonSidePanel } from "../hardware-button-side-panel"
import type { HardwareButton } from "../screenman-editor"
import { TabControlProperties } from "./tab-control-properties"
import { PanelProperties } from "./panel-properties"

// A "panel" object has no reference to its own parent - it only ever shows
// up as a tab-control's child - so PanelProperties (which needs the parent's
// id to open it for editing / know it's the only panel left) is handed the
// parent found by walking the tree, the same way editingTabContext resolves
// a tab-control from just its id elsewhere (see canvas.tsx).
function findParentTabControl(objects: ScreenmanObject[], panelId: string): ScreenmanObject | null {
  for (const obj of objects) {
    if (obj.type === "tab-control" && obj.children?.some((child) => child.id === panelId)) return obj
    if (obj.children && obj.children.length > 0) {
      const found = findParentTabControl(obj.children, panelId)
      if (found) return found
    }
  }
  return null
}

interface PropertyPanelProps {
  selectedObject: ScreenmanObject | null
  selectedObjects: ScreenmanObject[]
  onUpdateObject: (id: string, updates: Partial<ScreenmanObject>) => void
  onUpdateObjects: (updates: Array<{ id: string; updates: Partial<ScreenmanObject> }>) => void
  currentScreen: any
  onUpdateScreenBackground: (color: string) => void
  onUpdateScreenColors: (colors: { backgroundColor: string; gridColor: string }) => void
  calculateOptimalGridColor: (backgroundColor: string) => string
  projectAssets: ScreenmanAsset[]
  onAddOrFindAsset: (file: File) => Promise<string>
  onAddAsset: (asset: ScreenmanAsset) => void
  topics: MQTTTopic[]
  fonts: ScreenmanFont[]
  colorDepth: "1bit" | "4bit" | "24bit"
  setProjectSettingsTab: (tab: string) => void
  setShowProjectSettings: (show: boolean) => void
  onOpenIconSelector: (pairIndex: number) => void
  onOpenIconPropertiesSelector: () => void
  showHardwareButtonPanel: boolean
  selectedHardwareButton: HardwareButton | null
  allScreens: any[]
  onSaveScreenButtonAction: (buttonId: string, action: any) => void
  nextId: number
  onIncrementNextId: () => void
  setIconSelectorContext: (context: { type: string; pairIndex?: number } | null) => void
  setShowIconSelector: (show: boolean) => void
  onSelectObject: (id: string | null, modifierKey?: boolean) => void
  editingTabContext: { tabControlId: string; panelId: string } | null
  onSetEditingTabContext: (context: { tabControlId: string; panelId: string } | null) => void
  onAddPanel: (tabControlId: string) => void
}

export function PropertyPanel({
  selectedObject,
  selectedObjects,
  onUpdateObject,
  onUpdateObjects,
  currentScreen,
  onUpdateScreenBackground,
  onUpdateScreenColors,
  calculateOptimalGridColor,
  projectAssets,
  onAddOrFindAsset,
  onAddAsset,
  topics,
  fonts,
  colorDepth,
  setProjectSettingsTab,
  setShowProjectSettings,
  onOpenIconSelector,
  onOpenIconPropertiesSelector,
  showHardwareButtonPanel,
  selectedHardwareButton,
  allScreens,
  onSaveScreenButtonAction,
  nextId,
  onIncrementNextId,
  setIconSelectorContext,
  setShowIconSelector,
  onSelectObject,
  editingTabContext,
  onSetEditingTabContext,
  onAddPanel,
}: PropertyPanelProps) {
  const handleManageTopics = () => {
    setProjectSettingsTab("topics")
    setShowProjectSettings(true)
  }

  const handleManageFonts = () => {
    setProjectSettingsTab("fonts")
    setShowProjectSettings(true)
  }

  const isMultiSelection = selectedObjects.length > 1
  const hasSelection = selectedObjects.length > 0

  return (
    <div className="p-4 space-y-6 min-h-[560px] overflow-y-auto">
      {showHardwareButtonPanel && selectedHardwareButton ? (
        <HardwareButtonSidePanel
          isOpen={showHardwareButtonPanel}
          onClose={() => {}} // No close handler needed since it auto-closes on object selection
          button={selectedHardwareButton}
          currentScreen={currentScreen}
          allScreens={allScreens}
          onSaveScreenAction={onSaveScreenButtonAction}
        />
      ) : !showHardwareButtonPanel && hasSelection && (
        <div>
          <h3 className="text-sm font-medium mb-3">
            {isMultiSelection ? (
              <>
                Multiple Objects Selected{" "}
                <span className="text-xs font-normal text-muted-foreground">({selectedObjects.length} items)</span>
              </>
            ) : selectedObject ? (
              <>
                {selectedObject.type === "MqttDataField" ? (
                  <>
                    MQTT Data Field{" "}
                    <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
                  </>
                ) : selectedObject.type === "MQTTIconField" ? (
                  <>
                    MQTT Icon Field{" "}
                    <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
                  </>
                ) : selectedObject.type === "field" ? (
                  <>
                    Text Field <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
                  </>
                ) : selectedObject.type === "label" ? (
                  <>
                    Label <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
                  </>
                ) : selectedObject.type === "box" ? (
                  <>
                    Box <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
                  </>
                ) : selectedObject.type === "line" ? (
                  <>
                    Line <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
                  </>
                ) : selectedObject.type === "MqttDataLine" ? (
                  <>
                    MQTT Data Line{" "}
                    <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
                  </>
                ) : selectedObject.type === "icon" ? (
                  <>
                    Icon <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
                  </>
                ) : selectedObject.type === "level-indicator" ? (
                  <>
                    Level Indicator{" "}
                    <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
                  </>
                ) : selectedObject.type === "SoftwareButton" ? (
                  <>
                    Software Button{" "}
                    <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
                  </>
                ) : selectedObject.type === "tab-control" ? (
                  <>
                    Tab Control <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
                  </>
                ) : selectedObject.type === "panel" ? (
                  <>
                    Panel <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
                  </>
                ) : (
                  "Object Properties"
                )}
              </>
            ) : null}
          </h3>
        </div>
      )}

      {hasSelection ? (
        <>
          {isMultiSelection ? (
            <MultiSelectionProperties selectedObjects={selectedObjects} onUpdateObjects={onUpdateObjects} />
          ) : selectedObject ? (
            <>
              {selectedObject.type === "MqttDataField" && (
                <MqttDataFieldProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  topics={topics}
                  onManageTopics={handleManageTopics}
                  fonts={fonts}
                  colorDepth={colorDepth}
                  onManageFonts={handleManageFonts}
                  allScreens={allScreens}
                />
              )}

              {selectedObject.type === "MQTTIconField" && (
                <MqttIconFieldProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  topics={topics}
                  onManageTopics={handleManageTopics}
                  projectAssets={projectAssets}
                  colorDepth={colorDepth}
                  onOpenIconSelector={onOpenIconSelector}
                  allScreens={allScreens}
                  nextId={nextId}
                  onIncrementNextId={onIncrementNextId}
                />
              )}

              {selectedObject.type === "field" && (
                <TextFieldProperties 
                  selectedObject={selectedObject} 
                  onUpdateObject={onUpdateObject} 
                  fonts={fonts}
                  colorDepth={colorDepth}
                  allScreens={allScreens}
                />
              )}

              {selectedObject.type === "label" && (
                <LabelProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  fonts={fonts}
                  colorDepth={colorDepth}
                  onManageFonts={handleManageFonts}
                  allScreens={allScreens}
                />
              )}

              {selectedObject.type === "box" && (
                <BoxProperties 
                  selectedObject={selectedObject} 
                  onUpdateObject={onUpdateObject}
                  colorDepth={colorDepth}
                  allScreens={allScreens}
                />
              )}

              {selectedObject.type === "line" && (
                <LineProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  colorDepth={colorDepth}
                  allScreens={allScreens}
                />
              )}

              {selectedObject.type === "MqttDataLine" && (
                <MqttDataLineProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  topics={topics}
                  onManageTopics={handleManageTopics}
                  colorDepth={colorDepth}
                  allScreens={allScreens}
                />
              )}

              {selectedObject.type === "icon" && (
                <IconProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  projectAssets={projectAssets}
                  colorDepth={colorDepth}
                  onOpenIconSelector={onOpenIconPropertiesSelector}
                  allScreens={allScreens}
                />
              )}

              {selectedObject.type === "level-indicator" && (
                <LevelIndicatorProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  topics={topics}
                  onManageTopics={handleManageTopics}
                  fonts={fonts}
                  colorDepth={colorDepth}
                  onManageFonts={handleManageFonts}
                  allScreens={allScreens}
                />
              )}

              {selectedObject.type === "SoftwareButton" && (
                <SoftwareButtonProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  projectAssets={projectAssets}
                  fonts={fonts}
                  colorDepth={colorDepth}
                  onOpenIconSelector={() => {
                    setIconSelectorContext({ type: "software-button" })
                    setShowIconSelector(true)
                  }}
                  onManageFonts={handleManageFonts}
                  allScreens={allScreens}
                />
              )}

              {selectedObject.type === "tab-control" && (
                <TabControlProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  topics={topics}
                  onManageTopics={handleManageTopics}
                  onSelectObject={onSelectObject}
                  editingTabContext={editingTabContext}
                  onSetEditingTabContext={onSetEditingTabContext}
                  onAddPanel={onAddPanel}
                />
              )}

              {selectedObject.type === "panel" && (
                <PanelProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  parentTabControl={findParentTabControl(currentScreen.objects, selectedObject.id)}
                  onSelectObject={onSelectObject}
                />
              )}
            </>
          ) : null}
        </>
      ) : !showHardwareButtonPanel && (
        <ScreenProperties
          currentScreen={currentScreen}
          onUpdateScreenBackground={onUpdateScreenBackground}
          onUpdateScreenColors={onUpdateScreenColors}
          calculateOptimalGridColor={calculateOptimalGridColor}
          projectAssets={projectAssets}
          colorDepth={colorDepth}
          onAddOrFindAsset={onAddOrFindAsset}
          allScreens={allScreens}
        />
      )}
    </div>
  )
}
