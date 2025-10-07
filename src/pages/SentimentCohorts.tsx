import React, { useEffect } from "react";
import AdminGuard from "@/components/AdminGuard";
import SentimentCohortsDashboard from "@/components/SentimentCohortsDashboard";

const SentimentCohorts: React.FC = () => {
  useEffect(() => {
    document.title = "Sentiment Cohorts | Admin Dashboard";

    const desc = document.querySelector('meta[name="description"]');
    const content = "View weekly cohort performance metrics for sentiment-driven trading strategies.";
    if (desc) {
      desc.setAttribute("content", content);
    } else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = content;
      document.head.appendChild(m);
    }

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
    <AdminGuard>
      <SentimentCohortsDashboard />
    </AdminGuard>
  );
};

export default SentimentCohorts;
