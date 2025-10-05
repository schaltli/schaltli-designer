"use client"
import type { PropertyPanelProps } from "../screenman-editor"
import { MqttDataFieldProperties } from "./mqtt-data-field-properties"
import { MqttIconFieldProperties } from "./mqtt-icon-field-properties"
import { TextFieldProperties } from "./text-field-properties"
import { LabelProperties } from "./label-properties"
import { BoxProperties } from "./box-properties"
import { LineProperties } from "./line-properties"
import { IconProperties } from "./icon-properties"
import { LevelIndicatorProperties } from "./level-indicator-properties"
import { ScreenProperties } from "./screen-properties"
import { MultiSelectionProperties } from "./multi-selection-properties"
import { HardwareButtonSidePanel } from "../hardware-button-side-panel"
import type { HardwareButton } from "../screenman-editor"

export function PropertyPanel({
  selectedObject,
  selectedObjects,
  onUpdateObject,
  onUpdateObjects,
  currentScreen,
  onUpdateScreenBackground,
  onUpdateScreenColors,
  onUpdateScreenPolarGrid,
  calculateOptimalGridColor,
  projectAssets,
  onAddOrFindAsset,
  topics,
  fonts,
  setProjectSettingsTab,
  setShowProjectSettings,
  onOpenIconSelector,
  onOpenIconPropertiesSelector,
  showHardwareButtonPanel,
  selectedHardwareButton,
  allScreens,
  onSaveScreenButtonAction,
}: PropertyPanelProps) {
  const handleManageTopics = () => {
    console.log("[v0] PropertyPanel handleManageTopics called")
    console.log("[v0] PropertyPanel calling setProjectSettingsTab with 'topics'")
    setProjectSettingsTab("topics")
    console.log("[v0] PropertyPanel calling setShowProjectSettings with true")
    setShowProjectSettings(true)
    console.log("[v0] PropertyPanel handleManageTopics completed")
  }

  const handleManageFonts = () => {
    console.log("[v0] PropertyPanel handleManageFonts called")
    console.log("[v0] PropertyPanel calling setProjectSettingsTab with 'fonts'")
    setProjectSettingsTab("fonts")
    console.log("[v0] PropertyPanel calling setShowProjectSettings with true")
    setShowProjectSettings(true)
    console.log("[v0] PropertyPanel handleManageFonts completed")
  }

  const isMultiSelection = selectedObjects.length > 1
  const hasSelection = selectedObjects.length > 0

  return (
    <div className="p-4 space-y-6 min-h-[400px] overflow-y-auto">
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
                ) : selectedObject.type === "label" || selectedObject.type === "icon-label" ? (
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
                ) : selectedObject.type === "icon" ? (
                  <>
                    Icon <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
                  </>
                ) : selectedObject.type === "level-indicator" ? (
                  <>
                    Level Indicator{" "}
                    <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
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
                  onManageFonts={handleManageFonts}
                />
              )}

              {selectedObject.type === "MQTTIconField" && (
                <MqttIconFieldProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  topics={topics}
                  onManageTopics={handleManageTopics}
                  projectAssets={projectAssets}
                  onOpenIconSelector={onOpenIconSelector}
                />
              )}

              {selectedObject.type === "field" && (
                <TextFieldProperties selectedObject={selectedObject} onUpdateObject={onUpdateObject} />
              )}

              {(selectedObject.type === "label" || selectedObject.type === "icon-label") && (
                <LabelProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  fonts={fonts}
                  onManageFonts={handleManageFonts}
                />
              )}

              {selectedObject.type === "box" && (
                <BoxProperties selectedObject={selectedObject} onUpdateObject={onUpdateObject} />
              )}

              {selectedObject.type === "line" && (
                <LineProperties selectedObject={selectedObject} onUpdateObject={onUpdateObject} />
              )}

              {selectedObject.type === "icon" && (
                <IconProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  projectAssets={projectAssets}
                  onOpenIconSelector={onOpenIconPropertiesSelector}
                />
              )}

              {selectedObject.type === "level-indicator" && (
                <LevelIndicatorProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  topics={topics}
                  onManageTopics={handleManageTopics}
                  fonts={fonts}
                  onManageFonts={handleManageFonts}
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
          onUpdateScreenPolarGrid={onUpdateScreenPolarGrid}
          calculateOptimalGridColor={calculateOptimalGridColor}
          projectAssets={projectAssets}
          onAddOrFindAsset={onAddOrFindAsset}
        />
      )}
    </div>
  )
}
