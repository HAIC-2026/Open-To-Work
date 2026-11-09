"use client"

import * as React from "react"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppSidebar, type AppSidebarProps } from "@/components/app-sidebar"
import {
  SidebarResizeProvider,
  useSidebarResize,
} from "@/components/resizable-sidebar"
import { cn } from "cn"

export interface AppLayoutProps {
  children: React.ReactNode
  sidebarProps?: AppSidebarProps
  className?: string
  containerClassName?: string
}

function AppLayoutContent({ children, sidebarProps, className, containerClassName }: AppLayoutProps) {
  const { width, isResizing } = useSidebarResize()

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${width}px` } as React.CSSProperties}
      className={cn(
        "h-svh overflow-hidden",
        isResizing && "[&_[data-slot=sidebar-gap]]:transition-none [&_[data-slot=sidebar-container]]:transition-none",
        containerClassName
      )}
    >
      <AppSidebar {...sidebarProps} />
      <SidebarInset className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

export function AppLayout(props: AppLayoutProps) {
  return (
    <SidebarResizeProvider>
      <AppLayoutContent {...props} />
    </SidebarResizeProvider>
  )
}
