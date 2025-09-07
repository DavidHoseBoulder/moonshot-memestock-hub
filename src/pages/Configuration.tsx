import { NavigationSidebar } from "@/components/Navigation";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import RedditHeuristicsManager from "@/components/RedditHeuristicsManager";

const Configuration = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <NavigationSidebar />
        <SidebarInset className="flex-1">
          <header className="h-12 flex items-center border-b px-4 bg-background">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold ml-4">Configuration</h1>
          </header>
          <main className="p-6">
            <RedditHeuristicsManager />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Configuration;