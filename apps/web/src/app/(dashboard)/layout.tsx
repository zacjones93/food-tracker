import { AppSidebar } from "@/components/app-sidebar"
import { getSessionFromCookie } from "@/utils/auth"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { redirect } from "next/navigation"
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { checkAiAccess } from "@/lib/ai/access-control"
import { AssistantProvider } from "@/components/assistant/assistant-provider"
import {
  AssistantShell,
  AssistantTrigger,
} from "@/components/assistant/assistant-shell"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionFromCookie()

  if (!session) {
    return redirect('/')
  }

  const assistantAccess = session.activeTeamId
    ? await checkAiAccess(session.activeTeamId)
    : null
  const assistantSettings = assistantAccess?.allowed
    ? assistantAccess.settings
    : undefined

  const dashboardContent = (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </div>
        {assistantSettings && (
          <div className="ml-auto px-4">
            <AssistantTrigger />
          </div>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </div>
    </>
  )

  return (
    <NuqsAdapter>
      <SidebarProvider>
        <AppSidebar />
        <AssistantProvider>
          <SidebarInset className="h-svh min-h-0">
            {assistantSettings ? (
              <AssistantShell settings={assistantSettings}>
                {dashboardContent}
              </AssistantShell>
            ) : (
              dashboardContent
            )}
          </SidebarInset>
        </AssistantProvider>
      </SidebarProvider>
    </NuqsAdapter>
  )
}
