"use client"
import type { TextScale } from "@/lib/size-scale"
import type { Typography } from "@/lib/device-description"
import type { ScreenObject, ProjectAsset, ProjectFont, Topic, HardwareButton, IconSelectorContext } from "../project-editor"
import { MqttDataFieldProperties } from "./mqtt-data-field-properties"
import { MqttIconFieldProperties } from "./mqtt-icon-field-properties"
import type { Separators } from "@/lib/placeholders"
import { LabelProperties } from "./label-properties"
import { BoxProperties } from "./box-properties"
import { LineProperties } from "./line-properties"
import { MqttDataLineProperties } from "./mqtt-data-line-properties"
import { IconProperties } from "./icon-properties"
import { LevelIndicatorProperties } from "./level-indicator-properties"
import { ArcLevelProperties } from "./arc-level-properties"
import { SoftwareButtonProperties } from "./software-button-properties"
import { SwitchProperties } from "./switch-properties"
import { ScreenProperties } from "./screen-properties"
import { MultiSelectionProperties } from "./multi-selection-properties"
import { HardwareButtonSidePanel } from "../hardware-button-side-panel"
import { TabControlProperties } from "./tab-control-properties"
import { PanelProperties } from "./panel-properties"
import { GroupProperties } from "./group-properties"
import { ContainerProperties, SpacerProperties } from "./container-properties"
import { CellProperties, TableColumnProperties, TableProperties } from "./table-properties"
import { TABLE_TYPE, type TableColumn } from "@/lib/table"
import { FrameLockContext } from "./fields"
import { SPACER_TYPE, isContainerType } from "@/lib/layout"
import type { LayoutTemplateId } from "@/lib/layout-templates"
import { findParentOf } from "@/lib/object-tree"
import { isLevelType, isArcType, isSwitchType, objectTypeLabel } from "@/lib/object-types"

// A "panel" object has no reference to its own parent - it only ever shows
// up as a tab-control's child - so PanelProperties (which needs the parent's
// id to open it for editing / know it's the only panel left) is handed the
// parent found by walking the tree, the same way editingTabContext resolves
// a tab-control from just its id elsewhere (see canvas.tsx).
function findParentTabControl(objects: ScreenObject[], panelId: string): ScreenObject | null {
  for (const obj of objects) {
    if (obj.type === "switcher" && obj.children?.some((child) => child.id === panelId)) return obj
    if (obj.children && obj.children.length > 0) {
      const found = findParentTabControl(obj.children, panelId)
      if (found) return found
    }
  }
  return null
}

interface PropertyPanelProps {
  /** A table's column chosen on the canvas (the strip above it), with its table's columns. */
  tableColumn?: { columns: TableColumn[]; index: number } | null
  onSetTableColumns?: (columns: TableColumn[]) => void
  onRemoveTableColumn?: () => void
  selectedObject: ScreenObject | null
  selectedObjects: ScreenObject[]
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  /**
   * Declares the topics a text's placeholders name, when the field is left
   * (docs/2026-09-25-text-placeholders.md) - not on every keystroke, which
   * would declare every half-typed path on the way.
   */
  onDeclareTopics?: (topics: string[]) => void
  // Forwarded straight through to MultiSelectionProperties, which calls it
  // as (ids, updates) - the shape project-editor's updateObjects actually
  // implements. This said Array<{id, updates}> until 2026-08-22, matching
  // neither end: a wrong type in a component that only passes the function
  // along is invisible, because nothing here ever calls it.
  onUpdateObjects: (objectIds: string[], updates: Partial<ScreenObject>) => void
  currentScreen: any
  // An asset id, or undefined to clear it - not a colour. ScreenProperties
  // calls it with both.
  onUpdateScreenColors: (backgroundColor?: string, gridColor?: string) => void
  onRenameScreen: (name: string) => void
  onSetScreenMaster: (masterScreenId: string | undefined) => void
  onSetScreenShowMaster: (showMaster: boolean) => void
  onClearScreenIcon: () => void
  onSetScreenTheme: (themeId: string | undefined) => void
  typographies?: Typography[]
  onSetScreenTypography: (typography: string | undefined) => void
  onSetScreenLayout: (template: LayoutTemplateId) => void
  projectAssets: ProjectAsset[]
  // The data URL is passed alongside the file because the caller has
  // already read it, and the hash that dedupes assets is computed from it.
  onAddAsset: (asset: ProjectAsset) => void
  topics: Topic[]
  /** The project's number format, for the placeholder picker's previews. */
  numberSeparators?: Separators
  fonts: ProjectFont[]
  /** The device's scale, when it gives one: text is then set in a style. */
  textScale?: TextScale
  colorDepth: "1bit" | "4bit" | "24bit"
  setProjectSettingsTab: (tab: string) => void
  setShowProjectSettings: (show: boolean) => void
  onOpenIconSelector: (pairIndex: number) => void
  onOpenIconPropertiesSelector: () => void
  showHardwareButtonPanel: boolean
  selectedHardwareButton: HardwareButton | null
  allScreens: any[]
  onSaveScreenButtonAction: (buttonId: string, action: any) => void
  supportsSoftwareButtons: boolean
  // Device-specific action ids the loaded DDF declares - offered as a button
  // action type by both button editors below. See lib/device-actions.ts.
  deviceActions: string[]
  onConfigureSwipeButton: (button: HardwareButton) => void
  nextId: number
  onIncrementNextId: () => void
  setIconSelectorContext: (context: IconSelectorContext | null) => void
  setShowIconSelector: (show: boolean) => void
  onSelectObject: (id: string | null, modifierKey?: boolean) => void
  editingTabContext: { tabControlId: string; panelId: string } | null
  onSetEditingTabContext: (context: { tabControlId: string; panelId: string } | null) => void
  onAddPanel: (tabControlId: string) => void
  // Ctrl+G and Ctrl+U as buttons (lib/object-groups.ts).
  onGroup?: () => void
  canGroup?: boolean
  onUngroup?: () => void
}

/**
 * What a layout container sets for the object being shown (lib/layout.ts):
 * its place and its width, when the object stands in a stack or a grid -
 * or straight on a screen whose root is one. Shown locked in its frame.
 */
// Whether the object stands in a table's cell - the screen's root table's,
// or a table object's.
function inTable(screen: { objects?: any[]; layout?: { type: string } } | undefined, id: string): boolean {
  if (!screen) return false
  const found = findParentOf(screen.objects ?? [], id)
  if (!found) return false
  return (found.parent ? found.parent.type : screen.layout?.type) === TABLE_TYPE
}

function layoutFrameLock(
  screen: { objects?: any[]; layout?: { type: string } } | undefined,
  id: string,
): { locked: readonly ("x" | "y" | "width")[]; hint: string; hidden?: readonly ("x" | "y" | "width")[] } | null {
  if (!screen) return null
  const found = findParentOf(screen.objects ?? [], id)
  if (!found) return null
  const placedBy = found.parent ? found.parent.type : screen.layout?.type
  if (!placedBy || !isContainerType(placedBy) || placedBy === "free") return null
  // In a table an object stands in its cell: x, y and width are the
  // table's to work out, and not shown (docs/2026-10-02-layout-tables.md).
  if (placedBy === TABLE_TYPE) {
    return { locked: [], hidden: ["x", "y", "width"], hint: "The table places it in its cell and gives it its width: see Cell." }
  }
  return {
    locked: ["x", "y", "width"],
    hint: "The container it is in places it and gives it its width. Move it within the container, or into a Free one to place it by hand.",
  }
}

export function PropertyPanel({
  selectedObject,
  selectedObjects,
  onUpdateObject,
  onDeclareTopics,
  onUpdateObjects,
  currentScreen,
  onUpdateScreenColors,
  onRenameScreen,
  onSetScreenMaster,
  onSetScreenShowMaster,
  onClearScreenIcon,
  onSetScreenTheme,
  typographies,
  onSetScreenTypography,
  onSetScreenLayout,
  tableColumn,
  onSetTableColumns,
  onRemoveTableColumn,
  projectAssets,
  onAddAsset,
  topics,
  numberSeparators,
  fonts,
  textScale,
  colorDepth,
  setProjectSettingsTab,
  setShowProjectSettings,
  onOpenIconSelector,
  onOpenIconPropertiesSelector,
  showHardwareButtonPanel,
  selectedHardwareButton,
  allScreens,
  onSaveScreenButtonAction,
  supportsSoftwareButtons,
  deviceActions,
  onConfigureSwipeButton,
  nextId,
  onIncrementNextId,
  setIconSelectorContext,
  setShowIconSelector,
  onSelectObject,
  editingTabContext,
  onSetEditingTabContext,
  onAddPanel,
  onGroup,
  canGroup,
  onUngroup,
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
    // @container/panel: the rows measure themselves against the panel, which
    // the user drags between 280 and 900 px - see
    // components/property-panel/fields/field-shell.tsx.
    <div className="@container/panel p-4 space-y-6 min-h-[560px] overflow-y-auto">
      {showHardwareButtonPanel && selectedHardwareButton ? (
        <HardwareButtonSidePanel
          isOpen={showHardwareButtonPanel}
          onClose={() => {}} // No close handler needed since it auto-closes on object selection
          button={selectedHardwareButton}
          currentScreen={currentScreen}
          allScreens={allScreens}
          onSaveScreenAction={onSaveScreenButtonAction}
          topics={topics}
          onManageTopics={handleManageTopics}
          deviceActions={deviceActions}
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
                {objectTypeLabel(selectedObject.type)}{" "}
                <span className="text-xs font-normal text-muted-foreground">{selectedObject.id}</span>
              </>
            ) : null}
          </h3>
        </div>
      )}

      {hasSelection ? (
        <>
          {isMultiSelection ? (
            <MultiSelectionProperties
              selectedObjects={selectedObjects}
              onUpdateObjects={onUpdateObjects}
              onGroup={onGroup}
              canGroup={canGroup}
            />
          ) : selectedObject ? (
            <FrameLockContext.Provider value={layoutFrameLock(currentScreen, selectedObject.id)}>
              {tableColumn && (
                <TableColumnProperties columns={tableColumn.columns} index={tableColumn.index} onChange={onSetTableColumns!} onRemove={onRemoveTableColumn!} />
              )}
              {selectedObject.type === TABLE_TYPE && <TableProperties selectedObject={selectedObject} onUpdateObject={onUpdateObject} />}
              {isContainerType(selectedObject.type) && selectedObject.type !== TABLE_TYPE && (
                <ContainerProperties selectedObject={selectedObject} onUpdateObject={onUpdateObject} />
              )}
              {inTable(currentScreen, selectedObject.id) && <CellProperties selectedObject={selectedObject} onUpdateObject={onUpdateObject} />}
              {selectedObject.type === SPACER_TYPE && (
                <SpacerProperties selectedObject={selectedObject} onUpdateObject={onUpdateObject} />
              )}

              {selectedObject.type === "live-text" && (
                <MqttDataFieldProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  topics={topics}
                  onManageTopics={handleManageTopics}
                  fonts={fonts}
                  textScale={textScale}
                  colorDepth={colorDepth}
                  onManageFonts={handleManageFonts}
                  allScreens={allScreens}
                />
              )}

              {selectedObject.type === "live-icon" && (
                <MqttIconFieldProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  topics={topics}
                  onManageTopics={handleManageTopics}
                  projectAssets={projectAssets}
                  colorDepth={colorDepth}
                  onOpenIconSelector={onOpenIconSelector}
                  allScreens={allScreens}
                  textScale={textScale}
                  nextId={nextId}
                  onIncrementNextId={onIncrementNextId}
                />
              )}

              {selectedObject.type === "text" && (
                <LabelProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  onDeclareTopics={onDeclareTopics}
                  topics={topics}
                  numberSeparators={numberSeparators}
                  fonts={fonts}
                  textScale={textScale}
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

              {selectedObject.type === "live-line" && (
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
                  textScale={textScale}
                />
              )}

              {isArcType(selectedObject.type) && (
                <ArcLevelProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  topics={topics}
                  onManageTopics={handleManageTopics}
                  fonts={fonts}
                  textScale={textScale}
                  colorDepth={colorDepth}
                  onManageFonts={handleManageFonts}
                />
              )}

              {isLevelType(selectedObject.type) && (
                <LevelIndicatorProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  topics={topics}
                  onManageTopics={handleManageTopics}
                  fonts={fonts}
                  textScale={textScale}
                  colorDepth={colorDepth}
                  onManageFonts={handleManageFonts}
                  allScreens={allScreens}
                />
              )}

              {selectedObject.type === "button" && (
                <SoftwareButtonProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  projectAssets={projectAssets}
                  fonts={fonts}
                  textScale={textScale}
                  colorDepth={colorDepth}
                  onOpenIconSelector={() => {
                    setIconSelectorContext({ type: "software-button" })
                    setShowIconSelector(true)
                  }}
                  onManageFonts={handleManageFonts}
                  allScreens={allScreens}
                  deviceActions={deviceActions}
                />
              )}

              {isSwitchType(selectedObject.type) && (
                <SwitchProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  topics={topics}
                  onManageTopics={handleManageTopics}
                  projectAssets={projectAssets}
                  fonts={fonts}
                  textScale={textScale}
                  colorDepth={colorDepth}
                  onOpenIconSelector={(stateIndex, slot) => {
                    setIconSelectorContext({ type: "switch-state", stateIndex, slot })
                    setShowIconSelector(true)
                  }}
                  onManageFonts={handleManageFonts}
                  allScreens={allScreens}
                  nextId={nextId}
                  onIncrementNextId={onIncrementNextId}
                />
              )}

              {selectedObject.type === "switcher" && (
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

              {selectedObject.type === "group" && (
                <GroupProperties selectedObject={selectedObject} onUpdateObject={onUpdateObject} onUngroup={onUngroup} />
              )}

              {selectedObject.type === "panel" && (
                <PanelProperties
                  selectedObject={selectedObject}
                  onUpdateObject={onUpdateObject}
                  parentTabControl={findParentTabControl(currentScreen.objects, selectedObject.id)}
                  onSelectObject={onSelectObject}
                />
              )}
            </FrameLockContext.Provider>
          ) : null}
        </>
      ) : !showHardwareButtonPanel && (
        <>
          {/* The same header line every object gets, for the one thing that
              is not an object. The screen panel used to carry a heading of
              its own; since the rebuild its headings are section names like
              everywhere else, so the title belongs here. */}
          <div>
            <h3 className="text-sm font-medium mb-3">
              Screen <span className="text-xs font-normal text-muted-foreground">{currentScreen?.name}</span>
            </h3>
          </div>
          {tableColumn && (
            <TableColumnProperties columns={tableColumn.columns} index={tableColumn.index} onChange={onSetTableColumns!} onRemove={onRemoveTableColumn!} />
          )}
          <ScreenProperties
            currentScreen={currentScreen}
            onUpdateScreenColors={onUpdateScreenColors}
            onSetScreenTheme={onSetScreenTheme}
            typographies={typographies}
            onSetScreenTypography={onSetScreenTypography}
            onSetScreenLayout={onSetScreenLayout}
            projectAssets={projectAssets}
            colorDepth={colorDepth}
            allScreens={allScreens}
            onRenameScreen={onRenameScreen}
            onSetScreenMaster={onSetScreenMaster}
            onSetScreenShowMaster={onSetScreenShowMaster}
            onOpenScreenIconSelector={() => {
              setIconSelectorContext({ type: "screen-icon", screenId: currentScreen.id })
              setShowIconSelector(true)
            }}
            onClearScreenIcon={onClearScreenIcon}
            supportsSoftwareButtons={supportsSoftwareButtons}
            onConfigureSwipeButton={onConfigureSwipeButton}
          />
        </>
      )}
    </div>
  )
}
