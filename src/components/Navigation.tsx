import {
  BarChart3,
  FileText,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Settings,
  Target,
  TrendingUp,
} from "lucide-react"
import { useLocation } from "react-router-dom"

import { MainNav } from "@/components/main-nav"
import { Sidebar, SidebarNavItem } from "@/components/ui/sidebar"

interface Props {
  children: React.ReactNode
}

export function NavigationSidebar() {
  const location = useLocation()

  const navItems = [
    { path: "/", icon: TrendingUp, label: "Dashboard" },
    { path: "/trading-pipeline", icon: Target, label: "Daily Pipeline" },
    { path: "/sentiment", icon: MessageSquare, label: "Sentiment Analysis" },
    { path: "/backtesting", icon: BarChart3, label: "Strategy Testing" },
    { path: "/parameter-optimization", icon: Settings, label: "Optimization" },
    { path: "/reports", icon: FileText, label: "AI Reports" },
  ];

  return (
    <Sidebar className="w-60">
      <MainNav className="flex flex-col space-y-6" />
      <SidebarNavItem
        items={navItems}
        pathname={location.pathname}
      />
    </Sidebar>
  )
}
