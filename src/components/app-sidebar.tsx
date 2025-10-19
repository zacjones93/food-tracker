"use client"

import { type ComponentType } from "react"
import type { Route } from 'next'
import Image from "next/image"

import {
  Calendar,
  ChefHat,
  BookOpen,
  ClipboardList,
  Settings2,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { NavTeam } from "@/components/nav-team"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
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
        title: "Recipe Books",
        url: "/recipe-books",
        icon: BookOpen,
      },
      {
        title: "Grocery Templates",
        url: "/grocery-templates",
        icon: ClipboardList,
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
          {
            title: "Team",
            url: "/settings/teams",
          },
        ],
      },
    ],
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-4">
          <Image
            src="/assets/logo.svg"
            alt="Logo"
            width={32}
            height={32}
            className="size-8"
          />
          <span className="font-heading text-lg font-semibold group-data-[collapsible=icon]:hidden">
            List to Ladle
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavTeam />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
