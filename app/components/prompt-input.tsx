"use client"

import * as React from "react"
import {
  ArrowUpIcon,
  PlusIcon,
  Map,
  ChevronDown,
  PaperclipIcon,
  TelescopeIcon,
  GlobeIcon,
} from "lucide-react"
import { Spinner } from "@/components/ui/spinner"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

export interface PromptInputProps {
  onSubmit?: (prompt: string, district?: string) => void
  placeholder?: string
  isLoading?: boolean
  disabled?: boolean
}

export function PromptInput({
  onSubmit: onSubmitProp,
  placeholder = "Ask about this district...",
  isLoading = false,
  disabled = false,
}: PromptInputProps) {
  const [text, setText] = React.useState("")
  const [selectedDistrict, setSelectedDistrict] = React.useState("House District 1")
  const [districtOpen, setDistrictOpen] = React.useState(false)

  const formRef = React.useRef<HTMLFormElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const canSend = text.trim().length > 0

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSend) return
    onSubmitProp?.(text, selectedDistrict)
    setText("")
  }

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <InputGroup>
        <InputGroupTextarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              formRef.current?.requestSubmit()
            }
          }}
          placeholder={placeholder}
          className="p-3 text-base md:text-base leading-relaxed max-h-48 overflow-y-auto"
        />

        <InputGroupAddon align="block-end" className="flex items-center justify-between">
          {/* Left: Add Context / File attachment DropdownMenu */}
          <div className="flex items-center">
            <input
              type="file"
              ref={inputRef}
              className="hidden"
              multiple
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <InputGroupButton
                    size="icon-sm"
                    variant="outline"
                    className="rounded-full"
                    aria-label="Add context"
                    type="button"
                  />
                }
              >
                <PlusIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-48">
                <DropdownMenuItem onClick={() => inputRef.current?.click()}>
                  <PaperclipIcon />
                  <span>Add Photos & Files</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <TelescopeIcon />
                  <span>Deep Research</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <GlobeIcon />
                  <span>Web Search</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Right: Pair of buttons (District Dropdown + District Map) and Send Button */}
          <div className="flex items-center gap-2">
            {/* The pair of buttons */}
            <div className="flex items-center gap-1.5">
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
                            onSelect={() => {
                              setSelectedDistrict(district)
                              setDistrictOpen(false)
                            }}
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
                            onSelect={() => {
                              setSelectedDistrict(district)
                              setDistrictOpen(false)
                            }}
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
                  // Map interaction
                }}
                className="h-8 gap-1.5 rounded-full px-3 text-xs font-normal text-muted-foreground hover:text-foreground"
                title="View District Map"
              >
                <Map className="size-3.5" />
                <span>District Map</span>
              </InputGroupButton>
            </div>

            {/* Send Button */}
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
          </div>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
