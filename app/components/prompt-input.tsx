"use client"

import * as React from "react"
import {
  ArrowUpIcon,
  Map,
  ChevronDown,
  Folder,
  Check,
  Square,
} from "lucide-react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "cn"
import { useActiveLegislator, formatDistrictTitle } from "@/lib/legislators"
import { ExploreDistrictsDrawer } from "@/components/district-map/explore-districts-drawer"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

const HOUSE_DISTRICTS = Array.from(
  { length: 51 },
  (_, i) => `House District ${i + 1}`
)

const SENATE_DISTRICTS = Array.from(
  { length: 25 },
  (_, i) => `Senate District ${i + 1}`
)

export interface PromptInputHandle {
  /** Put text in the box and focus it, without sending. */
  setDraft: (text: string) => void
}

export interface PromptInputProps {
  onSubmit?: (prompt: string, district?: string, folderId?: Id<"folders">) => void
  onStop?: () => void
  placeholder?: string
  isLoading?: boolean
  disabled?: boolean
  className?: string
  showFolderSelect?: boolean
  selectedFolderId?: Id<"folders">
  onFolderChange?: (folderId?: Id<"folders">) => void
  /** Controlled district. When omitted, the input manages it internally. */
  selectedDistrict?: string
  onDistrictChange?: (district: string) => void
  /** Imperative controls (a plain prop, like the district map view's handleRef). */
  handleRef?: React.Ref<PromptInputHandle>
}

export function PromptInput({
  onSubmit: onSubmitProp,
  onStop,
  placeholder = "Ask about this district...",
  isLoading = false,
  disabled = false,
  className,
  showFolderSelect = false,
  selectedFolderId: selectedFolderIdProp,
  onFolderChange,
  selectedDistrict: selectedDistrictProp,
  onDistrictChange,
  handleRef,
}: PromptInputProps) {
  const [text, setText] = React.useState("")
  const [activeLegislator] = useActiveLegislator()
  const [internalDistrict, setInternalDistrict] = React.useState(() =>
    formatDistrictTitle(activeLegislator.district)
  )
  const [districtOpen, setDistrictOpen] = React.useState(false)
  const [mapOpen, setMapOpen] = React.useState(false)
  const [mapKey, setMapKey] = React.useState(0)

  React.useEffect(() => {
    setInternalDistrict(formatDistrictTitle(activeLegislator.district))
  }, [activeLegislator.district])

  const selectedDistrict = selectedDistrictProp ?? internalDistrict
  const handleSelectDistrict = (district: string) => {
    setInternalDistrict(district)
    onDistrictChange?.(district)
    setDistrictOpen(false)
  }

  const projectFolders = useQuery(
    api.folders.listWithConversations,
    activeLegislator._id ? { userId: activeLegislator._id } : "skip"
  )
  const [internalFolderId, setInternalFolderId] = React.useState<Id<"folders"> | undefined>(selectedFolderIdProp)

  React.useEffect(() => {
    setInternalFolderId(selectedFolderIdProp)
  }, [selectedFolderIdProp])

  const currentFolderId = selectedFolderIdProp !== undefined ? selectedFolderIdProp : internalFolderId
  const handleSelectFolder = (id?: Id<"folders">) => {
    setInternalFolderId(id)
    onFolderChange?.(id)
  }

  const selectedFolder = projectFolders?.find((f) => f._id === currentFolderId)

  const formRef = React.useRef<HTMLFormElement>(null)
  React.useImperativeHandle(
    handleRef,
    () => ({
      setDraft: (draft) => {
        setText(draft)
        formRef.current?.querySelector("textarea")?.focus()
      },
    }),
    []
  )

  const isBlocked = disabled || isLoading
  const canSend = text.trim().length > 0 && !isBlocked

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSend || isBlocked) return
    onSubmitProp?.(text, selectedDistrict, currentFolderId)
    setText("")
  }

  return (
    <>
    <form ref={formRef} onSubmit={onSubmit}>
      <InputGroup className={cn("bg-background border border-foreground/20 dark:border-foreground/20 shadow-md", className)}>
        <InputGroupTextarea
          value={text}
          disabled={isBlocked}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              if (!isBlocked && text.trim().length > 0) {
                formRef.current?.requestSubmit()
              }
            }
          }}
          placeholder={placeholder}
          className="p-3 text-base md:text-base leading-relaxed max-h-48 overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed"
        />

        <InputGroupAddon align="block-end" className="flex items-center justify-end">
          {/* Folder, district and map buttons, then the send button */}
          <div className="flex items-center gap-2">
            {/* The pair of buttons */}
            <div className="flex items-center gap-1.5">
              {/* Folder Selector Dropdown (to the left of the district dropdown) */}
              {showFolderSelect && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <InputGroupButton
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 rounded-full px-3 text-xs font-normal max-w-[170px]"
                        title={selectedFolder ? `Folder: ${selectedFolder.name}` : "Select folder"}
                      />
                    }
                  >
                    <Folder className={cn("size-3.5 shrink-0", selectedFolder ? "text-primary" : "opacity-60")} />
                    <span className="truncate max-w-[100px]">
                      {selectedFolder ? selectedFolder.name : "Select folder"}
                    </span>
                    <ChevronDown className="size-3 opacity-60 shrink-0" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" side="top" sideOffset={8}>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="text-xs text-muted-foreground font-normal px-2 py-1.5">
                        Save to Project Folder
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => handleSelectFolder(undefined)}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <span className={cn("text-xs flex-1 truncate", !currentFolderId ? "font-semibold text-primary" : "text-muted-foreground")}>
                          No folder (Recents)
                        </span>
                        {!currentFolderId && <Check className="ml-auto size-3.5 text-primary" />}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                    {projectFolders && projectFolders.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuGroup>
                          {projectFolders.map((f) => {
                            const isSelected = currentFolderId === f._id
                            return (
                              <DropdownMenuItem
                                key={f._id}
                                onClick={() => handleSelectFolder(f._id)}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <Folder className={cn("size-3.5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                                <span className={cn("truncate text-xs flex-1", isSelected && "font-semibold text-foreground")}>
                                  {f.name}
                                </span>
                                {isSelected && <Check className="ml-auto size-3.5 text-primary" />}
                              </DropdownMenuItem>
                            )
                          })}
                        </DropdownMenuGroup>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Button 1 (Left of pair): Searchable District Combobox */}
              <Popover open={districtOpen} onOpenChange={setDistrictOpen}>
                <PopoverTrigger
                  render={
                    <InputGroupButton
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 rounded-full px-3 text-xs font-normal"
                    />
                  }
                >
                  <span className="truncate max-w-[130px]">
                    {selectedDistrict || "Select district"}
                  </span>
                  <ChevronDown className="size-3 opacity-60 shrink-0" />
                </PopoverTrigger>

                <PopoverContent className="w-60 p-0" side="top" align="end" sideOffset={8}>
                  <Command>
                    <CommandInput placeholder="Search district..." />
                    <CommandList className="max-h-60">
                      <CommandEmpty>No district found.</CommandEmpty>
                      <CommandGroup heading="House Districts">
                        {HOUSE_DISTRICTS.map((district) => (
                          <CommandItem
                            key={district}
                            value={district}
                            data-checked={selectedDistrict === district}
                            onSelect={() => handleSelectDistrict(district)}
                          >
                            {district}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <CommandSeparator />
                      <CommandGroup heading="Senate Districts">
                        {SENATE_DISTRICTS.map((district) => (
                          <CommandItem
                            key={district}
                            value={district}
                            data-checked={selectedDistrict === district}
                            onSelect={() => handleSelectDistrict(district)}
                          >
                            {district}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Button 2 (Right of pair): District Map button with Map icon on left */}
              <InputGroupButton
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  // New key so the drawer starts from the current district each time.
                  setMapKey((k) => k + 1)
                  setMapOpen(true)
                }}
                className="h-8 gap-1.5 rounded-full px-3 text-xs font-normal text-muted-foreground hover:text-foreground"
                title="View District Map"
              >
                <Map className="size-3.5" />
                <span>District Map</span>
              </InputGroupButton>
            </div>

            {/* Send or Stop Button */}
            {isLoading && onStop ? (
              <InputGroupButton
                type="button"
                size="icon-sm"
                variant="default"
                className="rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all cursor-pointer shadow-sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onStop()
                }}
                aria-label="Stop generation"
                title="Stop generation"
              >
                <Square className="size-3 fill-current" />
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                size="icon-sm"
                variant="default"
                className="rounded-full"
                disabled={!canSend || isLoading || disabled}
                aria-label="Send"
              >
                {isLoading ? <Spinner /> : <ArrowUpIcon />}
              </InputGroupButton>
            )}
          </div>
        </InputGroupAddon>
      </InputGroup>
    </form>
    {/* Outside the form so events from the drawer never reach it. */}
    <ExploreDistrictsDrawer
      key={mapKey}
      open={mapOpen}
      onOpenChange={setMapOpen}
      initialDistrict={selectedDistrict}
      // Keep the prompt's district in sync with what's chosen on the map.
      onDistrictChange={handleSelectDistrict}
    />
    </>
  )
}
