
import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import TradingPipeline from "./pages/TradingPipeline";
import SentimentDashboardPage from "./pages/SentimentDashboard";
import BulkImport from "./pages/BulkImport";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import ExtractionTester from "./pages/ExtractionTester";
import Backtesting from "./pages/Backtesting";
import Reports from "./pages/Reports";
import Trades from "./pages/Trades";
import TriggeredCandidatesDashboard from "./components/TriggeredCandidatesDashboard";
import { Toaster } from "@/components/ui/toaster";


const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthed(!!session);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthed(!!session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) return null;
  return authed ? <>{children}</> : <Navigate to="/auth" replace />;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/candidates" element={<ProtectedRoute><TriggeredCandidatesDashboard /></ProtectedRoute>} />
        <Route path="/sentiment" element={<ProtectedRoute><SentimentDashboardPage /></ProtectedRoute>} />
        <Route path="/portfolio" element={<ProtectedRoute><Trades /></ProtectedRoute>} />
        <Route path="/backtesting" element={<ProtectedRoute><Backtesting /></ProtectedRoute>} />
        <Route path="/bulk-import" element={<ProtectedRoute><BulkImport /></ProtectedRoute>} />
        <Route path="/dev/extraction-tester" element={<ProtectedRoute><ExtractionTester /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        {/* Legacy redirects */}
        <Route path="/trades" element={<Navigate to="/portfolio" replace />} />
        <Route path="/triggered-candidates" element={<Navigate to="/candidates" replace />} />
        <Route path="/trading-pipeline" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
};

export default App;
