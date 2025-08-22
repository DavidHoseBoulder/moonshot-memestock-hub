import { NavigationSidebar } from "@/components/Navigation";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import AIStrategyReports from "@/components/AIStrategyReports";

const Reports = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <NavigationSidebar />
        <SidebarInset className="flex-1">
          <header className="h-12 flex items-center border-b px-4 bg-background">
            <SidebarTrigger />
          </header>
          <main className="max-w-7xl mx-auto p-6">
            <div className="mb-8">
              <h1 className="text-3xl font-bold mb-2">AI Strategy Reports</h1>
              <p className="text-muted-foreground">
                View automated analysis and optimization results from your backtesting strategies.
              </p>
            </div>
            
            <AIStrategyReports />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Reports;