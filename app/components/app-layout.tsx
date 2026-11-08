"use client"

import * as React from "react"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppSidebar, type AppSidebarProps } from "@/components/app-sidebar"

export interface AppLayoutProps {
  children: React.ReactNode
  sidebarProps?: AppSidebarProps
  className?: string
}

export function AppLayout({ children, sidebarProps, className }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar {...sidebarProps} />
      <SidebarInset className={className}>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
