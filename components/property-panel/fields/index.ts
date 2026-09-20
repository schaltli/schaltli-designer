/**
 * The fourteen things a property panel is made of
 * (docs/2026-09-20-property-panel.md).
 *
 * A property of a given kind gets the same field wherever it appears - that
 * is the whole rule, and the reason this directory exists. Before it, the
 * same kind of value was a `<Slider>` in three panels and a number input in
 * two, an icon had four different pickers, the operator list was written out
 * four times (once differently), and the X/Y/W/H block was copied word for
 * word into twelve files.
 *
 * Panels import from here, never from each other.
 */

export { PropertySection, PropertySections } from "./property-section"
export { PropertyRow, FieldHint, FieldNote, FieldBox, Leading, Ornament, FIELD, GHOST_BUTTON, PANEL_CONTAINER } from "./field-shell"
export { TextField } from "./text-field"
export { NumberField, NumberPair } from "./number-field"
export { SelectField, TypeBadge } from "./select-field"
export { ToggleRow } from "./toggle-row"
export { ConditionRow } from "./condition-row"
export { FrameFields, frameSummary } from "./frame-fields"
export { ListItem, AddListItem, listSummary } from "./list-section"
export { IconField } from "./icon-field"
export { ButtonGroupRow } from "./button-group-row"
export { ColorField, FontField, TopicField } from "./wrapped-fields"

export type { PropertyRowProps } from "./field-shell"
export type { PropertySectionProps } from "./property-section"
export type { TextFieldProps } from "./text-field"
export type { NumberFieldProps, NumberPairProps } from "./number-field"
export type { SelectFieldProps, SelectOption } from "./select-field"
export type { ToggleRowProps } from "./toggle-row"
export type { ConditionRowProps } from "./condition-row"
export type { FrameFieldsProps, FrameKey } from "./frame-fields"
export type { ListItemProps } from "./list-section"
export type { IconFieldProps } from "./icon-field"
export type { ButtonGroupRowProps, RowButton } from "./button-group-row"
export type { ColorFieldProps, FontFieldProps, TopicFieldProps } from "./wrapped-fields"
