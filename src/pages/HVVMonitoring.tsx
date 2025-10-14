import React from 'react';
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { NavigationSidebar } from "@/components/Navigation";
import HVVMonitoringComponent from '@/components/HVVMonitoring';

const HVVMonitoring = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <NavigationSidebar />
        <SidebarInset className="flex-1">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-6">
            <h1 className="text-2xl font-semibold">High-Volume Volatility Monitoring</h1>
          </header>
          <main className="flex-1 p-6">
            <HVVMonitoringComponent />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default HVVMonitoring;
