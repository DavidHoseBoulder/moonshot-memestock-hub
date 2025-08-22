
import {
  BarChart3,
  Database,
  FileText,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Settings,
  Target,
  TrendingUp,
} from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"

import { MainNav } from "@/components/main-nav"
import { 
  Sidebar, 
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger
} from "@/components/ui/sidebar"

const navItems = [
  { path: "/", icon: TrendingUp, label: "Dashboard" },
  { path: "/trading-pipeline", icon: Target, label: "Daily Pipeline" },
  { path: "/sentiment", icon: MessageSquare, label: "Sentiment Analysis" },
  { path: "/backtesting", icon: BarChart3, label: "Strategy Testing" },
  { path: "/reports", icon: FileText, label: "AI Reports" },
  { path: "/bulk-import", icon: Database, label: "Bulk Import" },
];

export function NavigationSidebar() {
  const location = useLocation()

  return (
    <Sidebar className="w-60">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <MainNav />
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.path} 
                      className={({ isActive }) =>
                        isActive 
                          ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                          : ""
                      }
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

export function Navigation() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <NavigationSidebar />
        <div className="flex-1">
          <header className="h-12 flex items-center border-b px-4">
            <SidebarTrigger />
          </header>
        </div>
      </div>
    </SidebarProvider>
  )
}

export default Navigation
