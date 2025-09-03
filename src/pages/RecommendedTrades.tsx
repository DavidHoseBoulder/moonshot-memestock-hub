import { NavigationSidebar } from "@/components/Navigation";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import TriggeredCandidatesDashboard from "@/components/TriggeredCandidatesDashboard";

const RecommendedTrades = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <NavigationSidebar />
        <SidebarInset className="flex-1">
          <header className="h-12 flex items-center border-b px-4 bg-background">
            <SidebarTrigger />
          </header>
          <TriggeredCandidatesDashboard />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default RecommendedTrades;