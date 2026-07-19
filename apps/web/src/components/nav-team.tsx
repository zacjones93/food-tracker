"use client"

import {
  Building2,
  ChevronsUpDown,
  Check,
  Plus,
} from "@/components/ui/themed-icons"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { useRouter } from "next/navigation"
import { useSessionStore } from "@/state/session"
import { useServerAction } from "zsa-react"
import { switchTeamAction, getUserTeamsAction } from "@/actions/team-management.actions"
import { useEffect, useState } from "react"
import { toast } from "sonner"

export function NavTeam() {
  const { session, isLoading } = useSessionStore();
  const { isMobile, setOpenMobile } = useSidebar()
  const router = useRouter()
  const [teams, setTeams] = useState<Array<{ id: string; name: string; slug: string }>>([])
  const [loadingTeams, setLoadingTeams] = useState(true)

  const { execute: switchTeam, isPending: isSwitching } = useServerAction(switchTeamAction)
  const { execute: getUserTeams } = useServerAction(getUserTeamsAction)

  useEffect(() => {
    getUserTeams().then(([data, error]) => {
      if (error) {
        console.error("Failed to fetch teams:", error)
        setLoadingTeams(false)
        return
      }
      setTeams(data?.teams ?? [])
      setLoadingTeams(false)
    })
  }, [getUserTeams])

  const handleSwitchTeam = async (teamId: string) => {
    const [, error] = await switchTeam({ teamId })
    if (error) {
      toast.error("Failed to switch team")
      return
    }
    toast.success("Team switched successfully")
    router.refresh()
    setOpenMobile(false)
  }

  if (isLoading || loadingTeams) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="grid flex-1 gap-0.5 text-left text-sm leading-tight">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-4 w-4 ml-auto" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  if (!session?.activeTeamId || teams.length === 0) {
    return null;
  }

  const activeTeam = teams.find(t => t.id === session.activeTeamId)

  if (!activeTeam) {
    return null;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              disabled={isSwitching}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Building2 className="size-4" />
              </div>
              <div className="grid flex-1 gap-0.5 text-left text-sm leading-tight">
                <span className="font-semibold truncate">{activeTeam.name}</span>
                <span className="truncate text-xs text-muted-foreground">Active Team</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Switch Team
            </DropdownMenuLabel>
            {teams.map((team) => (
              <DropdownMenuItem
                key={team.id}
                className="cursor-pointer"
                onClick={() => handleSwitchTeam(team.id)}
                disabled={isSwitching}
              >
                <div className="flex items-center gap-2 flex-1">
                  <div className="flex aspect-square size-6 items-center justify-center rounded-sm bg-sidebar-primary text-sidebar-primary-foreground">
                    <Building2 className="size-3" />
                  </div>
                  <span className="flex-1 truncate">{team.name}</span>
                  {team.id === session.activeTeamId && (
                    <Check className="size-4" />
                  )}
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => {
                setOpenMobile(false)
                router.push('/settings/teams')
              }}
            >
              <Plus className="size-4" />
              Create Team
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
