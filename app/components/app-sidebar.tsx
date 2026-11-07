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
  Pencil,
  Check,
  X,
  User,
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
import { useRender } from "@base-ui/react/use-render"
import { mergeProps } from "@base-ui/react/merge-props"
import { useSidebarResizeRail } from "@/components/resizable-sidebar"
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
import { useActiveLegislator, INITIAL_LEGISLATORS, formatDistrictTitle, getChamber, type LegislatorUser } from "@/lib/legislators"

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

function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    showOnHover?: boolean
  }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute right-1 top-1/2 -translate-y-1/2 flex aspect-square w-5 items-center justify-center rounded-xl p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-all group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          showOnHover &&
            "peer-data-active/menu-button:text-sidebar-accent-foreground aria-expanded:opacity-100 data-[state=open]:opacity-100 data-popup-open:opacity-100 md:opacity-0",
          showOnHover &&
            "group-has-[:focus-visible]/menu-item:opacity-100 group-hover/menu-item:opacity-100 group-hover/folder-row:opacity-100 group-has-[:focus-visible]/folder-row:opacity-100 group-hover/recent-item:opacity-100 group-has-[:focus-visible]/recent-item:opacity-100",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-menu-action",
      sidebar: "menu-action",
    },
  })
}

function SidebarMenuSubAction({
  className,
  render,
  showOnHover = false,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    showOnHover?: boolean
  }) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "absolute right-1 top-1/2 -translate-y-1/2 flex aspect-square w-5 items-center justify-center rounded-xl p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-all group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-3 md:after:hidden [&>svg]:size-4 [&>svg]:shrink-0",
          showOnHover &&
            "group-has-[:focus-visible]/menu-sub-item:opacity-100 group-hover/menu-sub-item:opacity-100 group-has-[:focus-visible]/subitem:opacity-100 group-hover/subitem:opacity-100 aria-expanded:opacity-100 data-popup-open:opacity-100 md:opacity-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-menu-sub-action",
      sidebar: "menu-sub-action",
    },
  })
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

      {/* Action buttons (Pin, More) using dedicated SidebarMenuSubAction primitives */}
      <SidebarMenuSubAction
        showOnHover
        className={cn(
          "size-7 right-9",
          conv.isPinned && "md:opacity-100"
        )}
        title={conv.isPinned ? "Unpin conversation" : "Pin conversation"}
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
        onClick={async (e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          await onTogglePin(conv._id)
        }}
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
      </SidebarMenuSubAction>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuSubAction
              showOnHover
              className="size-7 right-1"
              title="Conversation options"
              onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <MoreVertical className="size-4" />
              <span className="sr-only">Conversation options</span>
            </SidebarMenuSubAction>
          }
        />
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
  onStartRenameFolder: (folder: { id: Id<"folders">; name: string }) => void
  onNavigateToNewWithFolder: (folderId: Id<"folders">) => void
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
  onStartRenameFolder,
  onNavigateToNewWithFolder,
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
          "relative rounded-xl transition-[background-color,box-shadow] duration-150",
          isDropTarget && "bg-sidebar-accent/80 ring-1 ring-primary/40 text-sidebar-accent-foreground"
        )}
      >
        {/* Scoped Folder Header Row */}
        <div className="group/folder-row relative">
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

          {/* Actions for Folder using dedicated SidebarMenuAction primitives */}
          {/* 3-dots Menu Action (Rename, Delete) */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuAction
                  showOnHover
                  className="size-7 right-9 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  title="Folder options"
                  onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                >
                  <MoreVertical className="size-4" />
                  <span className="sr-only">Folder options</span>
                </SidebarMenuAction>
              }
            />
            <DropdownMenuContent align="end" side="right" sideOffset={4}>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onStartRenameFolder({ id: folder._id, name: folder.name })
                }}
              >
                <Pencil className="size-4" />
                <span>Rename</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={async (e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  await onRemoveFolder(folder._id)
                }}
              >
                <Trash2 className="size-4" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Add conversation to folder action */}
          <SidebarMenuAction
            showOnHover
            className="size-7 right-1 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            title="Add to folder"
            onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
            onClick={(e: React.MouseEvent) => {
              e.preventDefault()
              e.stopPropagation()
              onNavigateToNewWithFolder(folder._id)
            }}
          >
            <Plus className="size-4" />
            <span className="sr-only">Add to folder</span>
          </SidebarMenuAction>
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
        "group/recent-item relative select-none transition-opacity duration-150",
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

      {/* Action using dedicated SidebarMenuAction */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction
              showOnHover
              className="size-7 right-1 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              title="Conversation options"
              onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <MoreVertical className="size-4" />
              <span className="sr-only">Conversation options</span>
            </SidebarMenuAction>
          }
        />
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
  const dbUsers = useQuery(api.users.list)
  const [currentUser, setCurrentUser] = useActiveLegislator(dbUsers)
  const initLegislators = useMutation(api.users.initLegislators)
  const { handlePointerDown: handleRailPointerDown, handleClick: handleRailClick } = useSidebarResizeRail()

  React.useEffect(() => {
    if (dbUsers !== undefined && dbUsers.length === 0) {
      initLegislators()
    }
  }, [dbUsers, initLegislators])

  const recents = useQuery(
    api.conversations.list,
    currentUser._id ? { userId: currentUser._id } : "skip"
  )
  const projectFolders = useQuery(
    api.folders.listWithConversations,
    currentUser._id ? { userId: currentUser._id } : "skip"
  )
  const removeConversation = useMutation(api.conversations.remove)
  const createConversation = useMutation(api.conversations.create)
  const moveToFolder = useMutation(api.conversations.moveToFolder)
  const togglePin = useMutation(api.conversations.togglePin)
  const createFolder = useMutation(api.folders.create)
  const removeFolder = useMutation(api.folders.remove)
  const renameFolder = useMutation(api.folders.rename)
  const initDefaults = useMutation(api.folders.initDefaults)

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Controlled open/close state for folders
  const [openFolders, setOpenFolders] = React.useState<Record<string, boolean>>({})

  // Dialog state for creating a new project folder
  const [createFolderOpen, setCreateFolderOpen] = React.useState(false)
  const [newFolderName, setNewFolderName] = React.useState("")
  const [isCreatingFolder, setIsCreatingFolder] = React.useState(false)

  // Dialog state for renaming a project folder
  const [renamingFolder, setRenamingFolder] = React.useState<{ id: Id<"folders">; name: string } | null>(null)
  const [renameFolderName, setRenameFolderName] = React.useState("")
  const [isRenamingFolder, setIsRenamingFolder] = React.useState(false)

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

  const [userMenuOpen, setUserMenuOpen] = React.useState(false)
  const [userSearchQuery, setUserSearchQuery] = React.useState("")

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Auto-seed default project folders if none exist yet for this user
  React.useEffect(() => {
    if (currentUser._id && projectFolders !== undefined && projectFolders.length === 0) {
      initDefaults({ userId: currentUser._id })
    }
  }, [projectFolders, currentUser._id, initDefaults])

  const allLegislators = React.useMemo(() => {
    return dbUsers && dbUsers.length > 0 ? dbUsers : INITIAL_LEGISLATORS
  }, [dbUsers])

  const filteredLegislators = React.useMemo(() => {
    const query = userSearchQuery.trim().toLowerCase()
    if (!query) return allLegislators
    const tokens = query.split(/\s+/).filter(Boolean)
    return allLegislators.filter((l) => {
      const formatted = formatDistrictTitle(l.district)
      const chamber = getChamber(l.district)
      const target = `${l.name} ${l.district} ${formatted} ${chamber}`.toLowerCase()
      return tokens.every((token) => target.includes(token))
    })
  }, [userSearchQuery, allLegislators])

  const houseMatches = React.useMemo(
    () => filteredLegislators.filter((l) => getChamber(l.district) === "House"),
    [filteredLegislators]
  )

  const senateMatches = React.useMemo(
    () => filteredLegislators.filter((l) => getChamber(l.district) === "Senate"),
    [filteredLegislators]
  )

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

  const handleNavigateToNewWithFolder = (folderId: Id<"folders">) => {
    setFolderOpen(folderId, true)
    router.push(`/new?folderId=${folderId}`)
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
                        onStartRenameFolder={(folderToRename) => {
                          setRenamingFolder(folderToRename)
                          setRenameFolderName(folderToRename.name)
                        }}
                        onNavigateToNewWithFolder={handleNavigateToNewWithFolder}
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
              <DropdownMenu
                open={userMenuOpen}
                onOpenChange={(open) => {
                  setUserMenuOpen(open)
                  if (!open) {
                    setUserSearchQuery("")
                  }
                }}
              >
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton
                      size="lg"
                      tooltip={currentUser.name}
                      className="data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-sidebar-accent-foreground"
                    />
                  }
                >
                  <Avatar className="size-8 rounded-full">
                    {currentUser.photoUrl ? (
                      <AvatarImage src={currentUser.photoUrl} alt={currentUser.name} />
                    ) : null}
                    <AvatarFallback className="rounded-full bg-sidebar-primary/20 text-sidebar-foreground">
                      <User className="size-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{currentUser.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{formatDistrictTitle(currentUser.district)}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  className="w-72 max-w-[calc(100vw-2rem)] rounded-xl p-1"
                  side="top"
                  align="start"
                  sideOffset={6}
                >
                  {/* Current User Header */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="p-0 font-normal">
                      <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
                        <Avatar className="size-8 rounded-full">
                          {currentUser.photoUrl ? (
                            <AvatarImage src={currentUser.photoUrl} alt={currentUser.name} />
                          ) : null}
                          <AvatarFallback className="rounded-full bg-sidebar-primary/20 text-sidebar-foreground">
                            <User className="size-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="grid flex-1 text-left text-sm leading-tight">
                          <span className="truncate font-semibold">{currentUser.name}</span>
                          <span className="truncate text-xs text-muted-foreground">{formatDistrictTitle(currentUser.district)}</span>
                        </div>
                      </div>
                    </DropdownMenuLabel>
                  </DropdownMenuGroup>

                  <DropdownMenuSeparator />

                  {/* Switch User Section */}
                  <DropdownMenuGroup>
                    <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground">
                      <span className="font-medium">Switch Account</span>
                      <span className="text-[10px] text-muted-foreground/70">
                        {filteredLegislators.length} of {allLegislators.length}
                      </span>
                    </div>

                    {/* Search Bar */}
                    <div className="px-1.5 pb-1.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <div className="relative flex items-center">
                        <Search className="absolute left-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === "Escape") {
                              setUserMenuOpen(false)
                            }
                          }}
                          placeholder="Search name, district, chamber..."
                          className="h-8 pl-8 pr-7 text-xs bg-muted/40 focus:bg-background rounded-lg border-input"
                        />
                        {userSearchQuery && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setUserSearchQuery("")}
                            className="absolute right-1 size-6 text-muted-foreground hover:text-foreground"
                            aria-label="Clear search"
                          >
                            <X className="size-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Scrollable list of 76 legislators */}
                    <div className="max-h-60 overflow-y-auto overscroll-contain px-1 space-y-1">
                      {filteredLegislators.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground">
                          No legislators found matching &quot;{userSearchQuery}&quot;
                        </div>
                      ) : (
                        <>
                          {houseMatches.length > 0 && (
                            <div>
                              <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                                House of Representatives ({houseMatches.length})
                              </div>
                              {houseMatches.map((u) => {
                                const isSelected = u.district === currentUser.district
                                return (
                                  <DropdownMenuItem
                                    key={u.district}
                                    onClick={() => {
                                      setCurrentUser(u)
                                    }}
                                    className={cn(
                                      "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs",
                                      isSelected && "bg-accent/80 font-medium"
                                    )}
                                  >
                                    <Avatar className="size-6 rounded-full shrink-0">
                                      {u.photoUrl ? (
                                        <AvatarImage src={u.photoUrl} alt={u.name} />
                                      ) : null}
                                      <AvatarFallback className="rounded-full bg-sidebar-primary/10 text-sidebar-foreground">
                                        <User className="size-3.5 text-muted-foreground" />
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col flex-1 min-w-0 text-left">
                                      <span className="truncate">{u.name}</span>
                                      <span className="truncate text-[10px] text-muted-foreground">
                                        {formatDistrictTitle(u.district)}
                                      </span>
                                    </div>
                                    {isSelected && (
                                      <span className="flex items-center gap-1 text-[11px] font-medium text-primary shrink-0">
                                        <Check className="size-3.5" />
                                        Active
                                      </span>
                                    )}
                                  </DropdownMenuItem>
                                )
                              })}
                            </div>
                          )}

                          {senateMatches.length > 0 && (
                            <div>
                              <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase mt-1">
                                State Senate ({senateMatches.length})
                              </div>
                              {senateMatches.map((u) => {
                                const isSelected = u.district === currentUser.district
                                return (
                                  <DropdownMenuItem
                                    key={u.district}
                                    onClick={() => {
                                      setCurrentUser(u)
                                    }}
                                    className={cn(
                                      "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs",
                                      isSelected && "bg-accent/80 font-medium"
                                    )}
                                  >
                                    <Avatar className="size-6 rounded-full shrink-0">
                                      {u.photoUrl ? (
                                        <AvatarImage src={u.photoUrl} alt={u.name} />
                                      ) : null}
                                      <AvatarFallback className="rounded-full bg-sidebar-primary/10 text-sidebar-foreground">
                                        <User className="size-3.5 text-muted-foreground" />
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex flex-col flex-1 min-w-0 text-left">
                                      <span className="truncate">{u.name}</span>
                                      <span className="truncate text-[10px] text-muted-foreground">
                                        {formatDistrictTitle(u.district)}
                                      </span>
                                    </div>
                                    {isSelected && (
                                      <span className="flex items-center gap-1 text-[11px] font-medium text-primary shrink-0">
                                        <Check className="size-3.5" />
                                        Active
                                      </span>
                                    )}
                                  </DropdownMenuItem>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
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

        {/* Rail for quick collapse toggling and drag resizing */}
        <SidebarRail
          onPointerDown={handleRailPointerDown}
          onClick={handleRailClick}
          title="Drag to resize or click to toggle sidebar"
        />
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
                const newFolderId = await createFolder({
                  name: trimmed,
                  userId: currentUser._id,
                })
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

      {/* Dialog to rename a project folder */}
      <Dialog
        open={renamingFolder !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRenamingFolder(null)
            setRenameFolderName("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>
              Enter a new name for this project folder.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!renamingFolder) return
              const trimmed = renameFolderName.trim()
              if (!trimmed) return
              setIsRenamingFolder(true)
              try {
                await renameFolder({ id: renamingFolder.id, name: trimmed })
                setRenamingFolder(null)
                setRenameFolderName("")
              } catch (err) {
                console.error("Failed to rename folder", err)
              } finally {
                setIsRenamingFolder(false)
              }
            }}
            className="flex flex-col gap-4"
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="rename-project-folder-name">Folder Name</FieldLabel>
                <Input
                  id="rename-project-folder-name"
                  placeholder="e.g. Housing & Infrastructure"
                  value={renameFolderName}
                  onChange={(e) => setRenameFolderName(e.target.value)}
                  disabled={isRenamingFolder}
                  autoFocus
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRenamingFolder(null)
                  setRenameFolderName("")
                }}
                disabled={isRenamingFolder}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!renameFolderName.trim() || isRenamingFolder}
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
