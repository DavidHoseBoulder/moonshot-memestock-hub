import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

interface RedditPost {
  id?: string;
  title: string;
  selftext?: string;
  score?: number;
  num_comments?: number;
  created_utc: number;
  permalink?: string;
  subreddit: string;
  author?: string;
}

interface BackfillRequest {
  mode?: "posts" | "jsonl_url";
  posts?: any[];
  jsonl_url?: string;
  subreddits?: string[];
  symbols?: string[];
  batch_size?: number;
  run_id?: string;
  max_items?: number;
  concurrency?: number;
  _continue_from_line?: number;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

async function processFileChunk(
  url: string,
  startLine: number = 0,
  maxLines: number = 100
): Promise<{ linesProcessed: number, validPosts: number, sampleData: any[] }> {
  
  console.log(`[reddit-backfill-import] *** PROCESSING START *** url=${url}, startLine=${startLine}, maxLines=${maxLines}`);
  
  try {
    console.log(`[reddit-backfill-import] Fetching URL...`);
    const resp = await fetch(url);
    console.log(`[reddit-backfill-import] Fetch completed: status=${resp.status}, ok=${resp.ok}`);
    
    if (!resp.ok || !resp.body) {
      throw new Error(`Failed to fetch ${url}: ${resp.status}`);
    }

    // Check compression
    const enc = (resp.headers.get("content-encoding") || "").toLowerCase();
    const ctype = (resp.headers.get("content-type") || "").toLowerCase();
    const looksGzip = url.endsWith(".gz") || ctype.includes("application/gzip");
    console.log(`[reddit-backfill-import] Compression: enc=${enc}, ctype=${ctype}, looksGzip=${looksGzip}`);

    let byteStream: ReadableStream<Uint8Array> = resp.body as ReadableStream<Uint8Array>;
    if (looksGzip && !enc.includes("gzip")) {
      // @ts-ignore
      byteStream = byteStream.pipeThrough(new DecompressionStream("gzip"));
      console.log('[reddit-backfill-import] Using gzip decompression');
    }

    const reader = byteStream.getReader();
    const decoder = new TextDecoder();
    let carry = "";
    let linesSeen = 0;
    let linesProcessed = 0;
    const sampleData: any[] = [];

    console.log('[reddit-backfill-import] Starting line processing...');

    try {
      while (linesProcessed < maxLines) {
        const { value, done } = await reader.read();
        if (done) {
          console.log(`[reddit-backfill-import] Stream finished at line ${linesSeen}`);
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        carry += chunk;
        
        let newlineIndex;
        while ((newlineIndex = carry.indexOf('\n')) !== -1) {
          const line = carry.slice(0, newlineIndex);
          carry = carry.slice(newlineIndex + 1);
          
          linesSeen++;
          
          // Skip to start position
          if (linesSeen <= startLine) continue;
          
          linesProcessed++;
          if (linesProcessed > maxLines) break;
          
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          console.log(`[reddit-backfill-import] Processing line ${linesProcessed}: ${trimmed.slice(0, 100)}...`);
          
          try {
            // Clean and parse JSON
            const cleaned = trimmed
              .replace(/,\s*$/, '')
              .replace(/\r/g, '')
              .replace(/\u0000/g, '');
            
            if (!cleaned.startsWith('{') || !cleaned.endsWith('}')) {
              console.log(`[reddit-backfill-import] Line ${linesProcessed} not JSON format`);
              continue;
            }
            
            const obj = JSON.parse(cleaned);
            console.log(`[reddit-backfill-import] JSON parsed line ${linesProcessed}, keys: ${Object.keys(obj).slice(0, 10).join(',')}`);
            
            // Save first 5 objects for analysis
            if (sampleData.length < 5) {
              sampleData.push({
                lineNumber: linesProcessed,
                keys: Object.keys(obj),
                subreddit: obj.subreddit,
                title: obj.title?.slice(0, 50),
                selftext: obj.selftext?.slice(0, 50),
                body: obj.body?.slice(0, 50),
                created_utc: obj.created_utc,
                author: obj.author,
                fullObject: obj // Include full object for first few
              });
            }
            
          } catch (parseError) {
            console.log(`[reddit-backfill-import] JSON parse error line ${linesProcessed}:`, parseError);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    console.log(`[reddit-backfill-import] Processing complete: processed=${linesProcessed}, samples=${sampleData.length}`);
    
    return {
      linesProcessed,
      validPosts: sampleData.length,
      sampleData
    };
    
  } catch (error: any) {
    console.error(`[reddit-backfill-import] ERROR in processFileChunk:`, error);
    throw error;
  }
}

Deno.serve(async (req) => {
  console.log('[reddit-backfill-import] *** FUNCTION START ***');
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: BackfillRequest = await req.json();
    console.log('[reddit-backfill-import] Request parsed:', {
      mode: body.mode,
      jsonl_url: body.jsonl_url ? 'provided' : 'missing',
      run_id: body.run_id
    });

    if (body.mode === "jsonl_url" && body.jsonl_url) {
      console.log('[reddit-backfill-import] *** MODE: JSONL_URL ***');
      console.log('[reddit-backfill-import] URL:', body.jsonl_url);
      console.log('[reddit-backfill-import] _continue_from_line:', body._continue_from_line);
      
      const result = await processFileChunk(
        body.jsonl_url,
        body._continue_from_line ?? 0,
        20 // Process only 20 lines for testing with detailed logs
      );
      
      console.log('[reddit-backfill-import] Chunk processing result:', result);
      
      return new Response(
        JSON.stringify({
          message: "Chunk processed",
          result: result
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
      
      return new Response(
        JSON.stringify({
          message: "Processing complete",
          result: result
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    return new Response(
      JSON.stringify({ message: "No processing requested" }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('[reddit-backfill-import] ERROR:', error);
    return new Response(
      JSON.stringify({ error: error?.message || "Unknown error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});