"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { ScreenmanProject } from "./screenman-editor"
import { ExportManager } from "@/lib/export-utils"

const Download = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7,10 12,5 17,10" />
    <line x1="12" x2="12" y1="5" y2="15" />
  </svg>
)

const Copy = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
)

const Check = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

interface ExportDialogProps {
  project: ScreenmanProject
  children: React.ReactNode
}

export function ExportDialog({ project, children }: ExportDialogProps) {
  const [exportFormat, setExportFormat] = useState<"esp32" | "arduino" | "json">("esp32")
  const [exportData, setExportData] = useState<string>("")
  const [arduinoFiles, setArduinoFiles] = useState<{ header: string; implementation: string; readme: string } | null>(
    null,
  )
  const [copied, setCopied] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const handleExport = () => {
    switch (exportFormat) {
      case "esp32":
        const esp32Data = ExportManager.exportToESP32(project)
        setExportData(JSON.stringify(esp32Data, null, 2))
        setArduinoFiles(null)
        break
      case "arduino":
        const arduinoData = ExportManager.exportToArduino(project)
        setArduinoFiles({
          header: arduinoData.headerFile,
          implementation: arduinoData.implementationFile,
          readme: arduinoData.readme,
        })
        setExportData("")
        break
      case "json":
        const jsonData = ExportManager.exportToJSON(project)
        setExportData(jsonData)
        setArduinoFiles(null)
        break
    }
  }

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCopy = async (content: string, type: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const getFileName = (extension: string) => {
    const baseName = project.name.replace(/\s+/g, "_").toLowerCase()
    return `${baseName}.${extension}`
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Export Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="exportFormat" className="text-sm">
                Export Format
              </Label>
              <Select value={exportFormat} onValueChange={(value: any) => setExportFormat(value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="esp32">ESP32 JSON</SelectItem>
                  <SelectItem value="arduino">Arduino C++</SelectItem>
                  <SelectItem value="json">Generic JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="pt-6">
              <Button onClick={handleExport}>Generate Export</Button>
            </div>
          </div>

          {exportFormat === "esp32" && (
            <div className="text-sm text-muted-foreground">
              Exports project data in ESP32-compatible JSON format for embedded displays like E-Paper modules.
            </div>
          )}

          {exportFormat === "arduino" && (
            <div className="text-sm text-muted-foreground">
              Generates complete Arduino C++ code with header file, implementation, and documentation.
            </div>
          )}

          {exportFormat === "json" && (
            <div className="text-sm text-muted-foreground">
              Exports the complete project data in generic JSON format for custom implementations.
            </div>
          )}

          {exportData && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Generated Code</Label>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleCopy(exportData, "main")} className="h-8">
                    {copied === "main" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied === "main" ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(exportData, getFileName(exportFormat === "esp32" ? "json" : "json"))}
                    className="h-8"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-96 w-full border rounded">
                <Textarea value={exportData} readOnly className="min-h-96 font-mono text-xs border-none resize-none" />
              </ScrollArea>
            </div>
          )}

          {arduinoFiles && (
            <Tabs defaultValue="header" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="header">Header (.h)</TabsTrigger>
                <TabsTrigger value="implementation">Implementation (.cpp)</TabsTrigger>
                <TabsTrigger value="readme">README.md</TabsTrigger>
              </TabsList>

              <TabsContent value="header" className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Header File</Label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(arduinoFiles.header, "header")}
                      className="h-8"
                    >
                      {copied === "header" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied === "header" ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(arduinoFiles.header, getFileName("h"))}
                      className="h-8"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
                <ScrollArea className="h-96 w-full border rounded">
                  <Textarea
                    value={arduinoFiles.header}
                    readOnly
                    className="min-h-96 font-mono text-xs border-none resize-none"
                  />
                </ScrollArea>
              </TabsContent>

              <TabsContent value="implementation" className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Implementation File</Label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(arduinoFiles.implementation, "implementation")}
                      className="h-8"
                    >
                      {copied === "implementation" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied === "implementation" ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(arduinoFiles.implementation, getFileName("cpp"))}
                      className="h-8"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
                <ScrollArea className="h-96 w-full border rounded">
                  <Textarea
                    value={arduinoFiles.implementation}
                    readOnly
                    className="min-h-96 font-mono text-xs border-none resize-none"
                  />
                </ScrollArea>
              </TabsContent>

              <TabsContent value="readme" className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Documentation</Label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(arduinoFiles.readme, "readme")}
                      className="h-8"
                    >
                      {copied === "readme" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied === "readme" ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(arduinoFiles.readme, "README.md")}
                      className="h-8"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
                <ScrollArea className="h-96 w-full border rounded">
                  <Textarea
                    value={arduinoFiles.readme}
                    readOnly
                    className="min-h-96 font-mono text-xs border-none resize-none"
                  />
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
