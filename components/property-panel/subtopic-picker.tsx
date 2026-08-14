"use client"
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { JsonSubtopic } from "../project-editor"

interface SubtopicPickerProps {
  subtopics: JsonSubtopic[]
  value: string // "" means no subtopic - bind to the whole JSON payload
  onChange: (path: string) => void
}

// Combobox for one JSON topic's field: pick a registered subtopic, or type
// a JSON-path expression that was never registered as one (lib/json-path.ts
// - member/index shorthand, e.g. "temp", "nested.temp", "readings[0].value").
// Deliberately doesn't validate freeform text against that grammar - a bad
// path already fails safe (getPreviewValueFromTopic shows "not found"
// rather than crashing), so real-time validation here would just be
// speculative work for an already-harmless failure mode. Also deliberately
// never writes a freeform path back into the topic's own registered
// subtopics[] - that stays an explicit action in Manage Topics, not a side
// effect of editing one object's binding.
export function SubtopicPicker({ subtopics, value, onChange }: SubtopicPickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-36 flex-shrink-0 justify-start px-2 text-xs font-normal"
          title="JSON field (optional) - leave empty to bind to the whole payload"
        >
          <span className={cn("truncate", !value && "text-muted-foreground italic")}>
            {value || "Whole payload"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          {/* value/onValueChange IS the bound subtopic path, live on every
              keystroke (same convention as every other text field in this
              panel) - cmdk's own fuzzy filter runs against the same text,
              so typing simultaneously edits the value and narrows the
              suggestion list below it. */}
          <CommandInput placeholder="Field path, e.g. temp" value={value} onValueChange={onChange} />
          <CommandList>
            <CommandEmpty className="text-muted-foreground px-3 py-3 text-xs">
              No matching registered field - the typed text is used as-is.
            </CommandEmpty>
            <CommandGroup>
              {subtopics.map((sub) => (
                <CommandItem
                  key={sub.id}
                  value={sub.path}
                  onSelect={() => {
                    onChange(sub.path)
                    setOpen(false)
                  }}
                >
                  <span className="truncate">{sub.label || sub.path}</span>
                  <span className="text-muted-foreground ml-auto text-xs">{sub.type}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
