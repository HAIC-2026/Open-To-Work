"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
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
} from "lucide-react"

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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  appName?: string
  userName?: string
  houseDistrict?: string
  userAvatar?: string
}

export function AppSidebar({
  appName = "Mohala",
  userName = "Alex Chen",
  houseDistrict = "House District 1",
  userAvatar,
  collapsible = "icon",
  ...props
}: AppSidebarProps) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  const [currentUser, setCurrentUser] = React.useState({
    name: userName,
    district: houseDistrict,
    avatar: userAvatar,
  })

  React.useEffect(() => {
    setMounted(true)
  }, [])

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

  const projectFolders = [
    {
      id: "district-initiatives",
      name: "District Initiatives",
      defaultOpen: true,
      conversations: [
        { title: "Housing & Zoning Reform", url: "/conversations/housing" },
        { title: "Public Transit Expansion", url: "/conversations/transit" },
        { title: "Clean Energy Grants", url: "/conversations/clean-energy" },
      ],
    },
    {
      id: "constituent-services",
      name: "Constituent Services",
      defaultOpen: true,
      conversations: [
        { title: "Town Hall Feedback Q1", url: "/conversations/town-hall" },
        { title: "Casework Tracker", url: "/conversations/casework" },
      ],
    },
    {
      id: "legislative-research",
      name: "Legislative Research",
      defaultOpen: false,
      conversations: [
        { title: "2026 Budget Overview", url: "/conversations/budget" },
        { title: "Education Funding Bill", url: "/conversations/education" },
      ],
    },
  ]

  const initials = currentUser.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
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

        {/* Projects Group */}
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu>
              {projectFolders.map((folder) => (
                <Collapsible
                  key={folder.id}
                  defaultOpen={folder.defaultOpen}
                  className="group/collapsible"
                >
                  <SidebarMenuItem className="group/menu-item relative">
                    {/* Folder Trigger Button: Shows Folder icon when closed, FolderOpen when opened */}
                    <CollapsibleTrigger
                      render={
                        <SidebarMenuButton
                          tooltip={folder.name}
                          className="h-8 pr-16"
                        >
                          <Folder className="size-4 group-data-open/collapsible:hidden" />
                          <FolderOpen className="size-4 hidden group-data-open/collapsible:block" />
                          <span className="truncate">{folder.name}</span>
                        </SidebarMenuButton>
                      }
                    />

                    {/* Pair of buttons for Folder: Fixed at h-8 top-0, strictly appears on mouse hover without lingering */}
                    <div className="absolute right-1 top-0 h-8 flex items-center gap-1 opacity-0 group-hover/menu-item:opacity-100 transition-opacity duration-150 group-data-[collapsible=icon]:hidden pointer-events-none group-hover/menu-item:pointer-events-auto">
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                        }}
                        className="size-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        title="Folder options"
                      >
                        <MoreVertical className="size-4" />
                        <span className="sr-only">Folder options</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
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
                        {folder.conversations.map((conv) => {
                          const isConvActive = pathname === conv.url
                          return (
                            <SidebarMenuSubItem
                              key={conv.title}
                              className="group/subitem relative"
                            >
                              <SidebarMenuSubButton
                                render={<Link href={conv.url} />}
                                isActive={isConvActive}
                                className="h-8 pr-16"
                              >
                                <MessageSquare className="size-4" />
                                <span className="truncate">{conv.title}</span>
                              </SidebarMenuSubButton>

                              {/* Pair of buttons for Conversation: Strictly appears on hover without lingering */}
                              <div className="absolute right-1 top-0 h-8 flex items-center gap-1 opacity-0 group-hover/subitem:opacity-100 transition-opacity duration-150 group-data-[collapsible=icon]:hidden pointer-events-none group-hover/subitem:pointer-events-auto">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                  }}
                                  className="size-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                  title="Pin conversation"
                                >
                                  <Pin className="size-4" />
                                  <span className="sr-only">Pin conversation</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                  }}
                                  className="size-7 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                  title="Conversation options"
                                >
                                  <MoreVertical className="size-4" />
                                  <span className="sr-only">Conversation options</span>
                                </Button>
                              </div>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
                  {currentUser.avatar && <AvatarImage src={currentUser.avatar} alt={currentUser.name} />}
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
                        {currentUser.avatar && <AvatarImage src={currentUser.avatar} alt={currentUser.name} />}
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
  )
}
