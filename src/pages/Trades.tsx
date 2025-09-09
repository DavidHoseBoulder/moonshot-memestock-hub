import { useState, useEffect } from "react";
import { NavigationSidebar } from "@/components/Navigation";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import TradesOverview from "@/components/TradesOverview";
import SymbolChatbot from "@/components/SymbolChatbot";
import { Footer } from "@/components/Footer";
import { Bot, MessageSquare } from "lucide-react";

const Trades = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <NavigationSidebar />
        <SidebarInset className="flex-1">
          <header className="h-12 flex items-center justify-between border-b px-4 bg-background">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <div className="flex items-center gap-2 ml-4">
                <h1 className="text-lg font-semibold">Portfolio & Trades</h1>
                <link rel="canonical" href="/portfolio" />
              </div>
            </div>
            
            <Sheet open={chatOpen} onOpenChange={setChatOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Bot className="w-4 h-4" />
                  AI Assistant
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[400px] sm:w-[540px]">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    Market Intelligence
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-6 h-[calc(100vh-120px)]">
                  <SymbolChatbot 
                    symbol={selectedSymbol} 
                    className="h-full"
                  />
                </div>
              </SheetContent>
            </Sheet>
          </header>
          
          <main className="max-w-7xl mx-auto p-6 min-h-screen flex flex-col">
            <TradesOverview onSymbolSelect={setSelectedSymbol} />
          </main>
          <Footer />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Trades;