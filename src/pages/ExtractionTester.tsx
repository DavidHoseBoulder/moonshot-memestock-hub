import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

// Dev-only utility page to validate unified ticker extraction across edge functions
const ExtractionTester: React.FC = () => {
  const { toast } = useToast();
  const [symbolsText, setSymbolsText] = useState("TSLA,AAPL,GME");
  const symbols = useMemo(() => symbolsText.split(/[,\s]+/).map(s => s.trim()).filter(Boolean), [symbolsText]);

  const [loading, setLoading] = useState<{[k:string]: boolean}>({});
  const [results, setResults] = useState<{[k:string]: any}>({});

  useEffect(() => {
    // Minimal SEO for dev page
    document.title = "Extraction Tester - Unified Ticker Regex";

    const metaDescId = "dev-extraction-meta";
    let meta = document.querySelector(`meta[name=description][data-id='${metaDescId}']`) as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      meta.setAttribute("data-id", metaDescId);
      document.head.appendChild(meta);
    }
    meta.content = "Dev tool to validate unified ticker extraction across sentiment sources.";

    // Canonical (helps avoid duplicate content warnings even for dev route)
    const linkId = "dev-extraction-canonical";
    let link = document.querySelector(`link[rel='canonical'][data-id='${linkId}']`) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      link.setAttribute("data-id", linkId);
      document.head.appendChild(link);
    }
    link.href = window.location.href;
  }, []);

  const run = useCallback(async (key: string, fn: () => Promise<any>) => {
    setLoading(l => ({ ...l, [key]: true }));
    try {
      const data = await fn();
      setResults(r => ({ ...r, [key]: data }));
      toast({ title: `${key} complete`, description: `Got ${Array.isArray(data) ? data.length : Object.keys(data||{}).length} items` });
    } catch (e: any) {
      console.error(e);
      toast({ title: `${key} failed`, description: e?.message || "Unknown error" });
    } finally {
      setLoading(l => ({ ...l, [key]: false }));
    }
  }, [toast]);

  const runStockTwits = useCallback(() => run("stocktwits", async () => {
    const { data, error } = await supabase.functions.invoke("stocktwits-data", {
      body: { symbols }
    });
    if (error) throw error;
    return data;
  }), [run, symbols]);

  const runYouTube = useCallback(() => run("youtube", async () => {
    const { data, error } = await supabase.functions.invoke("youtube-sentiment", {
      body: { symbols }
    });
    if (error) throw error;
    return data;
  }), [run, symbols]);

  const runFinancialNews = useCallback(() => run("financial-news", async () => {
    const { data, error } = await supabase.functions.invoke("financial-news", {
      body: { symbols, days: 3 }
    });
    if (error) throw error;
    return data;
  }), [run, symbols]);

  const runTwitter = useCallback(() => run("twitter", async () => {
    const { data, error } = await supabase.functions.invoke("twitter-sentiment", {
      body: { symbols, days: 1 }
    });
    if (error) throw error;
    return data;
  }), [run, symbols]);

  const runAll = useCallback(async () => {
    await Promise.all([
      runStockTwits(),
      runYouTube(),
      runFinancialNews(),
      runTwitter(),
    ]);
  }, [runStockTwits, runYouTube, runFinancialNews, runTwitter]);

  const aggregatedMentions = useMemo(() => {
    const set = new Set<string>();

    // Normalize helpers
    const asArray = (val: any): any[] => (Array.isArray(val) ? val : []);

    // financial-news may return an object with { articles: [] } or a raw array
    const newsData = results["financial-news"] as any;
    const newsArticles: any[] = Array.isArray(newsData)
      ? newsData
      : asArray(newsData?.articles);

    // financial-news: array of articles with symbols_mentioned
    newsArticles.forEach((a: any) => asArray(a?.symbols_mentioned).forEach((t: string) => set.add(t)));

    // stocktwits: has ticker_counts or messages containing extracted tickers
    const st = results["stocktwits"] as any;
    if (st?.ticker_counts) {
      Object.keys(st.ticker_counts).forEach(t => set.add(t));
    }
    if (Array.isArray(st?.messages)) {
      st.messages.forEach((m: any) => asArray(m?.symbols).forEach((s: any) => s?.symbol && set.add(s.symbol)));
    }

    // youtube/twitter may return per-symbol entries or be nested
    const ytData = results["youtube"] as any;
    const ytItems: any[] = Array.isArray(ytData) ? ytData : asArray(ytData?.youtube_sentiment);
    ytItems.forEach(item => item?.symbol && set.add(item.symbol));

    const twData = results["twitter"] as any;
    const twItems: any[] = Array.isArray(twData) ? twData : asArray(twData?.items || twData?.tweets || twData?.twitter_sentiment);
    twItems.forEach(item => item?.symbol && set.add(item.symbol));

    return Array.from(set).sort();
  }, [results]);

  const perSourceSymbols = useMemo(() => {
    const asArray = (val: any): any[] => (Array.isArray(val) ? val : []);

    const stSet = new Set<string>();
    const st = results["stocktwits"] as any;
    if (st?.ticker_counts) {
      Object.keys(st.ticker_counts).forEach((t) => stSet.add(t));
    }
    if (Array.isArray(st?.messages)) {
      st.messages.forEach((m: any) =>
        asArray(m?.symbols).forEach((s: any) => s?.symbol && stSet.add(s.symbol))
      );
    }

    const ytSet = new Set<string>();
    const ytData = results["youtube"] as any;
    const ytItems: any[] = Array.isArray(ytData)
      ? ytData
      : asArray(ytData?.youtube_sentiment);
    ytItems.forEach((item) => item?.symbol && ytSet.add(item.symbol));

    const newsSet = new Set<string>();
    const newsData = results["financial-news"] as any;
    const newsArticles: any[] = Array.isArray(newsData)
      ? newsData
      : asArray(newsData?.articles);
    newsArticles.forEach((a: any) =>
      asArray(a?.symbols_mentioned).forEach((t: string) => newsSet.add(t))
    );

    const twSet = new Set<string>();
    const twData = results["twitter"] as any;
    const twItems: any[] = Array.isArray(twData)
      ? twData
      : asArray(twData?.items || twData?.tweets || twData?.twitter_sentiment);
    twItems.forEach((item) => item?.symbol && twSet.add(item.symbol));

    return {
      stocktwits: Array.from(stSet).sort(),
      youtube: Array.from(ytSet).sort(),
      financialNews: Array.from(newsSet).sort(),
      twitter: Array.from(twSet).sort(),
    } as const;
  }, [results]);

  const counts = useMemo(
    () => ({
      stocktwits: perSourceSymbols.stocktwits.length,
      youtube: perSourceSymbols.youtube.length,
      financialNews: perSourceSymbols.financialNews.length,
      twitter: perSourceSymbols.twitter.length,
    }),
    [perSourceSymbols]
  );

  const persistMentions = useCallback(async () => {
    setLoading((l) => ({ ...l, persist: true }));
    try {
      const nowIso = new Date().toISOString();
      const rows: any[] = [];
      const entries = [
        ["stocktwits", perSourceSymbols.stocktwits, counts.stocktwits] as const,
        ["youtube", perSourceSymbols.youtube, counts.youtube] as const,
        ["financial-news", perSourceSymbols.financialNews, counts.financialNews] as const,
        ["twitter", perSourceSymbols.twitter, counts.twitter] as const,
      ];

      for (const [source, list, cnt] of entries) {
        list.forEach((sym) =>
          rows.push({
            symbol: sym,
            source,
            data_timestamp: nowIso,
            collected_at: nowIso,
            sentiment_score: 0,
            raw_sentiment: 0,
            content_snippet: "Mention detected via Extraction Tester",
            metadata: { origin: "extraction-tester", per_source_count: cnt, input_symbols: symbols },
            volume_indicator: 1,
          })
        );
      }

      if (rows.length === 0) {
        toast({ title: "Nothing to persist", description: "Run a test first." });
        return;
      }

      const { error } = await supabase.from("sentiment_history").insert(rows);
      if (error) throw error;
      toast({ title: "Persisted mentions", description: `Inserted ${rows.length} rows into sentiment_history` });
    } catch (e: any) {
      console.error(e);
      toast({ title: "Persist failed", description: e?.message || "Unknown error" });
    } finally {
      setLoading((l) => ({ ...l, persist: false }));
    }
  }, [counts, perSourceSymbols, symbols, toast]);

  return (
    <div className="container mx-auto px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Unified Ticker Extraction Tester</h1>
        <p className="text-sm opacity-80 mt-1">Short tickers require the $ prefix (e.g., $AI); long names rely on word boundaries.</p>
      </header>

      <main>
        <section className="mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Inputs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                <div className="flex-1">
                  <label htmlFor="symbols" className="text-sm">Symbols (comma-separated)</label>
                  <Input id="symbols" value={symbolsText} onChange={(e) => setSymbolsText(e.target.value)} placeholder="TSLA,AAPL,GME" />
                </div>
                <div className="flex gap-2">
                  <Button onClick={runAll} disabled={Object.values(loading).some(Boolean)}>Run All</Button>
                  <Button variant="secondary" onClick={runStockTwits} disabled={!!loading.stocktwits}>StockTwits</Button>
                  <Button variant="secondary" onClick={runYouTube} disabled={!!loading.youtube}>YouTube</Button>
                  <Button variant="secondary" onClick={runFinancialNews} disabled={!!loading["financial-news"]}>Financial News</Button>
                  <Button variant="secondary" onClick={runTwitter} disabled={!!loading.twitter}>Twitter</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mb-6">
          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Aggregated Mentions</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Total: {aggregatedMentions.length}</Badge>
                <Badge variant="secondary">StockTwits: {counts.stocktwits}</Badge>
                <Badge variant="secondary">YouTube: {counts.youtube}</Badge>
                <Badge variant="secondary">Financial News: {counts.financialNews}</Badge>
                <Badge variant="secondary">Twitter: {counts.twitter}</Badge>
                <Button size="sm" onClick={persistMentions} disabled={aggregatedMentions.length === 0 || !!loading.persist}>
                  {loading.persist ? 'Persisting...' : 'Persist to sentiment_history'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {aggregatedMentions.length === 0 ? (
                  <span className="text-sm opacity-70">No mentions yet. Run a test.</span>
                ) : (
                  aggregatedMentions.map(t => (
                    <Badge key={t} variant="secondary">{t}</Badge>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>StockTwits Result</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(results["stocktwits"], null, 2)}</pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>YouTube Result</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(results["youtube"], null, 2)}</pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Financial News Result</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(results["financial-news"], null, 2)}</pre>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Twitter Result</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(results["twitter"], null, 2)}</pre>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

export default ExtractionTester;
