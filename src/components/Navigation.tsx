
import {
  BarChart3,
  MessageSquare,
  Settings,
  Target,
  TrendingUp,
  DollarSign,
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
  { path: "/", icon: TrendingUp, label: "Home" },
  { path: "/candidates", icon: Target, label: "Triggered Candidates" },
  { path: "/sentiment", icon: MessageSquare, label: "Sentiment" },
  { path: "/portfolio", icon: DollarSign, label: "Portfolio & Trades" },
  { path: "/backtesting", icon: BarChart3, label: "Backtesting" },
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
          <header className="h-12 flex items-center justify-between border-b px-4">
            <SidebarTrigger />
            <button className="p-2 hover:bg-muted rounded-md">
              <Settings className="w-4 h-4" />
            </button>
          </header>
        </div>
      </div>
    </SidebarProvider>
  )
}

export default Navigation
