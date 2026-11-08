"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Plus,
  Bot,
  Users,
  MoreVertical,
  Pin,
  Folder,
  FolderOpen,
  MessageSquare,
  ChevronsUpDown,
  Search,
  Monitor,
  Sun,
  Moon,
  Trash2,
} from "lucide-react"

import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { useQuery, useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  appName?: string
  userName?: string
  houseDistrict?: string
  userAvatar?: string
}

interface DraggedConversationData {
  type: "conversation"
  conversationId: Id<"conversations">
  title: string
  currentFolderId?: Id<"folders">
}

// ---------------------------------------------------------------------------
// Draggable Conversation SubItem (Inside a Folder)
// ---------------------------------------------------------------------------
interface DraggableFolderConversationItemProps {
  conv: {
    _id: Id<"conversations">
    title: string
    isPinned?: boolean
    folderId?: Id<"folders">
  }
  folderId: Id<"folders">
  isActive: boolean
  onTogglePin: (id: Id<"conversations">) => Promise<void>
  onDelete: (id: Id<"conversations">, isActive: boolean) => Promise<void>
}

function DraggableFolderConversationItem({
  conv,
  folderId,
  isActive,
  onTogglePin,
  onDelete,
}: DraggableFolderConversationItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `conv-${conv._id}`,
    data: {
      type: "conversation",
      conversationId: conv._id,
      title: conv.title,
      currentFolderId: folderId,
    } satisfies DraggedConversationData,
  })

  return (
    <SidebarMenuSubItem
      ref={setNodeRef}
      className={cn(
        "group/subitem relative select-none transition-opacity duration-150",
        isDragging && "opacity-35"
      )}
      {...attributes}
      {...listeners}
    >
      <SidebarMenuSubButton
        render={<Link href={`/conversations/${conv._id}`} />}
        isActive={isActive}
        className="h-8 pr-16"
      >
        <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{conv.title}</span>
      </SidebarMenuSubButton>

      {/* Action buttons (Pin, More) strictly appears on hover without lingering */}
      <div
        className="absolute right-1 top-0 h-8 flex items-center gap-1 opacity-0 group-hover/subitem:opacity-100 transition-opacity duration-150 group-data-[collapsible=icon]:hidden pointer-events-none group-hover/subitem:pointer-events-auto"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={async (e) => {
            e.preventDefault()
            e.stopPropagation()
            await onTogglePin(conv._id)
          }}
          className="size-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          title={conv.isPinned ? "Unpin conversation" : "Pin conversation"}
        >
          <Pin
            className={cn(
              "size-4",
              conv.isPinned && "fill-current text-primary"
            )}
          />
          <span className="sr-only">
            {conv.isPinned ? "Unpin" : "Pin"}
          </span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="size-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                title="Conversation options"
              />
            }
          >
            <MoreVertical className="size-4" />
            <span className="sr-only">Conversation options</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="right" sideOffset={4}>
            <DropdownMenuItem
              variant="destructive"
              onClick={async (e) => {
                e.preventDefault()
                e.stopPropagation()
                await onDelete(conv._id, isActive)
              }}
            >
              <Trash2 className="size-4" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarMenuSubItem>
  )
}

// ---------------------------------------------------------------------------
// Droppable Folder Item
// ---------------------------------------------------------------------------
interface DroppableFolderItemProps {
  folder: {
    _id: Id<"folders">
    name: string
    defaultOpen?: boolean
    conversations: Array<{
      _id: Id<"conversations">
      title: string
      isPinned?: boolean
      folderId?: Id<"folders">
    }>
  }
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  activeConv: DraggedConversationData | null
  currentPathname: string
  onRemoveFolder: (id: Id<"folders">) => Promise<void>
  onCreateConversationInFolder: (folderId: Id<"folders">) => Promise<void>
  onTogglePin: (id: Id<"conversations">) => Promise<void>
  onDeleteConversation: (id: Id<"conversations">, isActive: boolean) => Promise<void>
}

function DroppableFolderItem({
  folder,
  isOpen,
  onOpenChange,
  activeConv,
  currentPathname,
  onRemoveFolder,
  onCreateConversationInFolder,
  onTogglePin,
  onDeleteConversation,
}: DroppableFolderItemProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `folder-${folder._id}`,
    data: {
      type: "folder",
      folderId: folder._id,
      folderName: folder.name,
    },
  })

  // Only highlight if dragging an item that is NOT already in this folder
  const isDropTarget = isOver && activeConv && activeConv.currentFolderId !== folder._id

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      className="group/collapsible"
    >
      <SidebarMenuItem
        ref={setNodeRef}
        className={cn(
          "group/menu-item relative rounded-xl transition-[background-color,box-shadow] duration-150",
          isDropTarget && "bg-sidebar-accent/80 ring-1 ring-primary/40 text-sidebar-accent-foreground"
        )}
      >
        {/* Folder Trigger Button */}
        <CollapsibleTrigger
          render={
            <SidebarMenuButton
              tooltip={folder.name}
              className="h-8 pr-16"
            >
              <Folder className="size-4 group-data-open/collapsible:hidden text-muted-foreground" />
              <FolderOpen className="size-4 hidden group-data-open/collapsible:block text-primary" />
              <span className="truncate">{folder.name}</span>
            </SidebarMenuButton>
          }
        />

        {/* Pair of buttons for Folder: Fixed at h-8 top-0, strictly appears on mouse hover without lingering */}
        <div
          className="absolute right-1 top-0 h-8 flex items-center gap-1 opacity-0 group-hover/menu-item:opacity-100 transition-opacity duration-150 group-data-[collapsible=icon]:hidden pointer-events-none group-hover/menu-item:pointer-events-auto"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="size-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  title="Folder options"
                />
              }
            >
              <MoreVertical className="size-4" />
              <span className="sr-only">Folder options</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" sideOffset={4}>
              <DropdownMenuItem
                variant="destructive"
                onClick={async (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  await onRemoveFolder(folder._id)
                }}
              >
                <Trash2 className="size-4" />
                <span>Delete Folder</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              await onCreateConversationInFolder(folder._id)
            }}
            className="size-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            title="Add to folder"
          >
            <Plus className="size-4" />
            <span className="sr-only">Add to folder</span>
          </Button>
        </div>

        {/* Nested Conversations Submenu */}
        <CollapsibleContent>
          <SidebarMenuSub className="ml-3.5 mr-0 pl-2.5 pr-0">
            {folder.conversations.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground/80 italic">
                {isDropTarget ? "Drop to add here" : "Empty folder"}
              </div>
            ) : (
              folder.conversations.map((conv) => {
                const isConvActive = currentPathname === `/conversations/${conv._id}`
                return (
                  <DraggableFolderConversationItem
                    key={conv._id}
                    conv={conv}
                    folderId={folder._id}
                    isActive={isConvActive}
                    onTogglePin={onTogglePin}
                    onDelete={onDeleteConversation}
                  />
                )
              })
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

// ---------------------------------------------------------------------------
// Draggable Recent Conversation Item
// ---------------------------------------------------------------------------
interface DraggableRecentConversationItemProps {
  conv: {
    _id: Id<"conversations">
    title: string
  }
  isActive: boolean
  onDelete: (id: Id<"conversations">, isActive: boolean) => Promise<void>
}

function DraggableRecentConversationItem({
  conv,
  isActive,
  onDelete,
}: DraggableRecentConversationItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `conv-${conv._id}`,
    data: {
      type: "conversation",
      conversationId: conv._id,
      title: conv.title,
      currentFolderId: undefined,
    } satisfies DraggedConversationData,
  })

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      className={cn(
        "group/menu-item relative select-none transition-opacity duration-150",
        isDragging && "opacity-35"
      )}
      {...attributes}
      {...listeners}
    >
      <SidebarMenuButton
        render={<Link href={`/conversations/${conv._id}`} />}
        isActive={isActive}
        tooltip={conv.title}
        className="h-8 pr-8"
      >
        <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{conv.title}</span>
      </SidebarMenuButton>

      <div
        className="absolute right-1 top-0 h-8 flex items-center gap-1 opacity-0 group-hover/menu-item:opacity-100 transition-opacity duration-150 group-data-[collapsible=icon]:hidden pointer-events-none group-hover/menu-item:pointer-events-auto"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="size-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                title="Conversation options"
              />
            }
          >
            <MoreVertical className="size-4" />
            <span className="sr-only">Conversation options</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="right" sideOffset={4}>
            <DropdownMenuItem
              variant="destructive"
              onClick={async (e) => {
                e.preventDefault()
                e.stopPropagation()
                await onDelete(conv._id, isActive)
              }}
            >
              <Trash2 className="size-4" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarMenuItem>
  )
}

// ---------------------------------------------------------------------------
// Droppable Recents Section (Drop here to move conversation out of any folder)
// ---------------------------------------------------------------------------
interface DroppableRecentsSectionProps {
  recents:
    | Array<{
        _id: Id<"conversations">
        title: string
      }>
    | undefined
  activeConv: DraggedConversationData | null
  currentPathname: string
  onDeleteConversation: (id: Id<"conversations">, isActive: boolean) => Promise<void>
}

function DroppableRecentsSection({
  recents,
  activeConv,
  currentPathname,
  onDeleteConversation,
}: DroppableRecentsSectionProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: "recents-drop-zone",
    data: {
      type: "recents",
    },
  })

  // Eligible to drop here if the dragged item is currently inside a folder
  const isDropTarget = isOver && activeConv && activeConv.currentFolderId !== undefined

  return (
    <SidebarGroup ref={setNodeRef}>
      <SidebarGroupLabel>Recents</SidebarGroupLabel>

      <SidebarGroupContent
        className={cn(
          "rounded-xl transition-[background-color,box-shadow] duration-150",
          isDropTarget && "bg-sidebar-accent/50 ring-1 ring-primary/40"
        )}
      >
        <SidebarMenu>
          {recents === undefined ? (
            <div className="flex flex-col gap-1 px-2 py-1">
              <Skeleton className="h-7 w-full rounded-md" />
              <Skeleton className="h-7 w-full rounded-md" />
            </div>
          ) : recents.length === 0 ? (
            <div className="px-3 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              No recent conversations
            </div>
          ) : (
            recents.map((conv) => {
              const isActive = currentPathname === `/conversations/${conv._id}`
              return (
                <DraggableRecentConversationItem
                  key={conv._id}
                  conv={conv}
                  isActive={isActive}
                  onDelete={onDeleteConversation}
                />
              )
            })
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

// ---------------------------------------------------------------------------
// AppSidebar Main Component
// ---------------------------------------------------------------------------
export function AppSidebar({
  appName = "Mohala",
  userName = "Alex Chen",
  houseDistrict = "House District 1",
  userAvatar,
  collapsible = "icon",
  ...props
}: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const recents = useQuery(api.conversations.list)
  const projectFolders = useQuery(api.folders.listWithConversations)
  const removeConversation = useMutation(api.conversations.remove)
  const createConversation = useMutation(api.conversations.create)
  const moveToFolder = useMutation(api.conversations.moveToFolder)
  const togglePin = useMutation(api.conversations.togglePin)
  const createFolder = useMutation(api.folders.create)
  const removeFolder = useMutation(api.folders.remove)
  const initDefaults = useMutation(api.folders.initDefaults)

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Controlled open/close state for folders
  const [openFolders, setOpenFolders] = React.useState<Record<string, boolean>>({})

  // Dialog state for creating a new project folder
  const [createFolderOpen, setCreateFolderOpen] = React.useState(false)
  const [newFolderName, setNewFolderName] = React.useState("")
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false)

  // Drag and Drop active item state
  const [activeConv, setActiveConv] = React.useState<DraggedConversationData | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px threshold so normal clicks on links & buttons navigate immediately
      },
    })
  )

  const isFolderOpen = React.useCallback(
    (folderId: string, defaultOpen?: boolean) => {
      return openFolders[folderId] ?? (defaultOpen ?? true)
    },
    [openFolders]
  )

  const setFolderOpen = React.useCallback((folderId: string, open: boolean) => {
    setOpenFolders((prev) => ({ ...prev, [folderId]: open }))
  }, [])

  // Auto-expand folder if the active conversation is inside it
  React.useEffect(() => {
    if (!projectFolders || !pathname) return
    for (const folder of projectFolders) {
      const hasActiveConv = folder.conversations.some(
        (conv) => pathname === `/conversations/${conv._id}`
      )
      if (hasActiveConv && openFolders[folder._id] === undefined) {
        setOpenFolders((prev) => ({ ...prev, [folder._id]: true }))
      }
    }
  }, [projectFolders, pathname, openFolders])

  const [currentUser, setCurrentUser] = React.useState({
    name: userName,
    district: houseDistrict,
    avatar: userAvatar,
  })

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-seed default project folders if none exist yet
  React.useEffect(() => {
    if (projectFolders !== undefined && projectFolders.length === 0) {
      initDefaults()
    }
  }, [projectFolders, initDefaults])

  const availableUsers = [
    { name: "Alex Chen", district: "House District 1", initials: "AC" },
    { name: "Jordan Davis", district: "House District 3", initials: "JD" },
    { name: "Taylor Kim", district: "House District 5", initials: "TK" },
  ]

  const mainNavItems = [
    {
      title: "New",
      url: "/new",
      icon: Plus,
    },
    {
      title: "Your assistants",
      url: "/assistants",
      icon: Bot,
    },
    {
      title: "Collaborate",
      url: "/collaborate",
      icon: Users,
    },
  ]

  const initials = currentUser.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  // -------------------------------------------------------------------------
  // Drag and drop event handlers
  // -------------------------------------------------------------------------
  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as DraggedConversationData | undefined
    if (data?.type === "conversation") {
      setActiveConv(data)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveConv(null)

    if (!over) return

    const activeData = active.data.current as DraggedConversationData | undefined
    if (!activeData || activeData.type !== "conversation") return

    const overId = String(over.id)

    // Dropped onto a folder
    if (overId.startsWith("folder-")) {
      const targetFolderId = over.data.current?.folderId as Id<"folders"> | undefined
      if (targetFolderId && targetFolderId !== activeData.currentFolderId) {
        await moveToFolder({
          id: activeData.conversationId,
          folderId: targetFolderId,
        })
        // Ensure destination folder is open so the user sees the newly moved item
        setFolderOpen(targetFolderId, true)
      }
      return
    }

    // Dropped onto Recents (to remove from any folder)
    if (overId === "recents-drop-zone") {
      if (activeData.currentFolderId !== undefined) {
        await moveToFolder({
          id: activeData.conversationId,
          folderId: undefined,
        })
      }
      return
    }
  }

  const collisionDetection = React.useCallback(
    (args: Parameters<typeof pointerWithin>[0]) => {
      const pointerCollisions = pointerWithin(args)
      if (pointerCollisions.length > 0) return pointerCollisions
      return rectIntersection(args)
    },
    []
  )

  const handleDeleteConversation = async (
    convId: Id<"conversations">,
    isActive: boolean
  ) => {
    await removeConversation({ id: convId })
    if (isActive) {
      router.push("/new")
    }
  }

  const handleCreateConversationInFolder = async (folderId: Id<"folders">) => {
    const newId = await createConversation({
      title: "New conversation",
      district: currentUser.district,
      folderId,
    })
    setFolderOpen(folderId, true)
    router.push(`/conversations/${newId}`)
  }

  return (
    <>
      <Sidebar collapsible={collapsible} {...props}>
        {/* Sidebar Header: Always visible action buttons */}
        <SidebarHeader className="p-2">
          <div className="flex h-8 items-center justify-between px-1 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
            <span className="text-lg font-bold tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:hidden pl-1">
              {appName}
            </span>
            <div className="flex items-center gap-1 group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:justify-center">
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className="size-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
                title="Search"
              >
                <Search className="size-4" />
                <span className="sr-only">Search</span>
              </Button>
              <SidebarTrigger className="size-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2!" />
            </div>
          </div>
        </SidebarHeader>

        {/* Sidebar Content */}
        <SidebarContent>
          {/* Main top tabs: New, Your assistants, Collaborate */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNavItems.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.url
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        render={<Link href={item.url} />}
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <Icon className="size-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* DnD Context wrapping Projects and Recents */}
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* Projects Group */}
            <SidebarGroup>
              {/* Project Group Header with + button vertically aligned with the right button of all rows */}
              <div className="relative flex items-center justify-between group/project-header">
                <SidebarGroupLabel className="w-full pr-8">Projects</SidebarGroupLabel>
                <div className="absolute right-1 top-0 h-8 flex items-center group-data-[collapsible=icon]:hidden">
                  <Button
                    variant="ghost"
                    size="icon"
                    type="button"
                    onClick={() => {
                      setNewFolderName("")
                      setCreateFolderOpen(true)
                    }}
                    className="size-7 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                    title="Create new folder"
                  >
                    <Plus className="size-4" />
                    <span className="sr-only">Create folder</span>
                  </Button>
                </div>
              </div>

              <SidebarGroupContent>
                <SidebarMenu>
                  {projectFolders === undefined ? (
                    <div className="flex flex-col gap-1 px-2 py-1">
                      <Skeleton className="h-7 w-full rounded-md" />
                      <Skeleton className="h-7 w-full rounded-md" />
                      <Skeleton className="h-7 w-full rounded-md" />
                    </div>
                  ) : projectFolders.length === 0 ? (
                    <div className="px-3 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                      No projects yet
                    </div>
                  ) : (
                    projectFolders.map((folder) => (
                      <DroppableFolderItem
                        key={folder._id}
                        folder={folder}
                        isOpen={isFolderOpen(folder._id, folder.defaultOpen)}
                        onOpenChange={(open) => setFolderOpen(folder._id, open)}
                        activeConv={activeConv}
                        currentPathname={pathname}
                        onRemoveFolder={async (id) => {
                          await removeFolder({ id })
                        }}
                        onCreateConversationInFolder={handleCreateConversationInFolder}
                        onTogglePin={async (id) => {
                          await togglePin({ id })
                        }}
                        onDeleteConversation={handleDeleteConversation}
                      />
                    ))
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Recents Group (placed below Projects, droppable to move out of folders) */}
            <DroppableRecentsSection
              recents={recents}
              activeConv={activeConv}
              currentPathname={pathname}
              onDeleteConversation={handleDeleteConversation}
            />

            {/* Drag Overlay: Snappy, lightweight physics preview adhering to Emil Kowalski guidelines */}
            <DragOverlay
              dropAnimation={{
                duration: 180,
                easing: "cubic-bezier(0.23, 1, 0.32, 1)",
              }}
            >
              {activeConv ? (
                <div className="flex h-8 w-60 items-center gap-2 rounded-xl border border-border bg-sidebar/95 px-3 text-sm font-medium text-sidebar-foreground shadow-lg backdrop-blur-sm cursor-grabbing pointer-events-none select-none">
                  <MessageSquare className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{activeConv.title}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </SidebarContent>

        {/* Sidebar Footer with User Switcher & Theme Selector Pop-up Menu */}
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton
                      size="lg"
                      tooltip={currentUser.name}
                      className="data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
                    />
                  }
                >
                  <Avatar className="size-8 rounded-lg">
                    {currentUser.avatar && (
                      <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                    )}
                    <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-semibold text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{currentUser.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{currentUser.district}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  className="w-56 rounded-xl p-1"
                  side="top"
                  align="start"
                  sideOffset={6}
                >
                  {/* Current User Header */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="p-0 font-normal">
                      <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
                        <Avatar className="size-8 rounded-lg">
                          {currentUser.avatar && (
                            <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
                          )}
                          <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-semibold text-xs">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="grid flex-1 text-left text-sm leading-tight">
                          <span className="truncate font-semibold">{currentUser.name}</span>
                          <span className="truncate text-xs text-muted-foreground">{currentUser.district}</span>
                        </div>
                      </div>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator />

                  {/* Switch User Section */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1">
                      Switch User
                    </DropdownMenuLabel>
                    {availableUsers.map((u) => {
                      const isSelected = u.name === currentUser.name
                      return (
                        <DropdownMenuItem
                          key={u.name}
                          onClick={() => {
                            setCurrentUser({
                              name: u.name,
                              district: u.district,
                              avatar: undefined,
                            })
                          }}
                        >
                          <Avatar className="size-5 rounded-sm">
                            <AvatarFallback className="text-[10px] bg-sidebar-primary/20 text-sidebar-foreground">
                              {u.initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className={isSelected ? "font-medium" : ""}>{u.name}</span>
                          {isSelected && (
                            <span className="ml-auto text-xs font-medium text-primary">Active</span>
                          )}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator />

                  {/* Theme Selector Section */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1">
                      Theme
                    </DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={mounted ? theme : "system"}
                      onValueChange={(val) => setTheme(val)}
                    >
                      <DropdownMenuRadioItem value="system" closeOnClick>
                        <Monitor className="size-4" />
                        <span>System</span>
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="light" closeOnClick>
                        <Sun className="size-4" />
                        <span>Light</span>
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark" closeOnClick>
                        <Moon className="size-4" />
                        <span>Dark</span>
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        {/* Rail for quick collapse toggling */}
        <SidebarRail />
      </Sidebar>

      {/* Dialog to create a new project folder (using shadcn / Base UI guidelines) */}
      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Project Folder</DialogTitle>
            <DialogDescription>
              Create a new folder to organize related conversations and legislative initiatives.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const trimmed = newFolderName.trim()
              if (!trimmed) return
              setIsCreatingFolder(true)
              try {
                const newFolderId = await createFolder({ name: trimmed })
                setFolderOpen(newFolderId, true)
                setNewFolderName("")
                setCreateFolderOpen(false)
              } catch (err) {
                console.error("Failed to create folder", err)
              } finally {
                setIsCreatingFolder(false)
              }
            }}
            className="flex flex-col gap-4"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="new-project-folder-name">Folder Name</FieldLabel>
                <Input
                  id="new-project-folder-name"
                  placeholder="e.g. Housing & Infrastructure"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  disabled={isCreatingFolder}
                  autoFocus
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateFolderOpen(false)}
                disabled={isCreatingFolder}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!newFolderName.trim() || isCreatingFolder}
              >
                Create Folder
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
