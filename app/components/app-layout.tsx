"use client"

import * as React from "react"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppSidebar, type AppSidebarProps } from "@/components/app-sidebar"
import { cn } from "cn"

export interface AppLayoutProps {
  children: React.ReactNode
  sidebarProps?: AppSidebarProps
  className?: string
  containerClassName?: string
}

export function AppLayout({ children, sidebarProps, className, containerClassName }: AppLayoutProps) {
  return (
    <SidebarProvider className={cn("h-svh overflow-hidden", containerClassName)}>
      <AppSidebar {...sidebarProps} />
      <SidebarInset className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
