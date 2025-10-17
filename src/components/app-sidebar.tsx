"use client"

import { type ComponentType } from "react"
import type { Route } from 'next'

import {
  Calendar,
  ChefHat,
  Settings2,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useSessionStore } from "@/state/session"

export type NavItem = {
  title: string
  url: Route
  icon?: ComponentType
}

export type NavMainItem = NavItem & {
  isActive?: boolean
  items?: NavItem[]
}

type Data = {
  user: {
    name: string
    email: string
  }
  navMain: NavMainItem[]
}

// TODO Add a theme switcher
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { session } = useSessionStore();

  const data: Data = {
    user: {
      name: session?.user?.firstName || "User",
      email: session?.user?.email || "user@example.com",
    },
    navMain: [
      {
        title: "Food Schedule",
        url: "/schedule",
        icon: Calendar,
        isActive: true,
      },
      {
        title: "Recipes",
        url: "/recipes",
        icon: ChefHat,
      },
      {
        title: "Settings",
        url: "/settings",
        icon: Settings2,
        items: [
          {
            title: "Profile",
            url: "/settings",
          },
          {
            title: "Sessions",
            url: "/settings/sessions",
          },
        ],
      },
    ],
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
