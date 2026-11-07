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
}

export function AppLayout({ children, sidebarProps }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar {...sidebarProps} />
      <SidebarInset>
        <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
