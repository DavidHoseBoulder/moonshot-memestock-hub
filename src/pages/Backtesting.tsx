import React, { useEffect } from "react";
import BacktestingDashboard from "@/components/BacktestingDashboard";

const Backtesting: React.FC = () => {
  useEffect(() => {
    document.title = "Sentiment Backtesting | Strategy Testing";

    // Update meta description for SEO
    const desc = document.querySelector('meta[name="description"]');
    const content = "Run sentiment-driven strategy backtests with market data and view results.";
    if (desc) {
      desc.setAttribute("content", content);
    } else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = content;
      document.head.appendChild(m);
    }

    // Canonical tag
    const existingCanonical = document.querySelector('link[rel="canonical"]');
    const canonicalHref = window.location.origin + "/backtesting";
    if (existingCanonical) {
      existingCanonical.setAttribute("href", canonicalHref);
    } else {
      const link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      link.setAttribute("href", canonicalHref);
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div className="container mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold">Sentiment Backtesting</h1>
        <p className="text-muted-foreground">Test and optimize strategies powered by sentiment and market data.</p>
      </header>
      <main>
        <BacktestingDashboard />
      </main>
    </div>
  );
};

export default Backtesting;
