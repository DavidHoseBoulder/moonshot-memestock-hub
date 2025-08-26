import { useState, useEffect } from "react";
import { NavigationSidebar } from "@/components/Navigation";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import TradesOverview from "@/components/TradesOverview";

const Trades = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <NavigationSidebar />
        <SidebarInset className="flex-1">
          <header className="h-12 flex items-center border-b px-4 bg-background">
            <SidebarTrigger />
            <div className="flex items-center gap-2 ml-4">
              <h1 className="text-lg font-semibold">Portfolio & Trades</h1>
            </div>
          </header>
          <main className="max-w-7xl mx-auto p-6">
            <TradesOverview />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Trades;