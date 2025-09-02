export function Footer() {
  return (
    <footer className="border-t bg-muted/30 py-6 mt-auto">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            MemeTrader AI © 2025
          </div>
          <div className="flex items-center gap-6">
            <a 
              href="/data-coverage" 
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              About & Data Coverage
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}