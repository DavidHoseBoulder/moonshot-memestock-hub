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
      let buffer = "";
      let linesProcessed = 0;
      let objectsFound = 0;
      
      console.log('[reddit-backfill-import] Starting JSON object detection...');

      while (linesProcessed < maxLines) {
        const { value, done } = await reader.read();
        if (done) {
          console.log(`[reddit-backfill-import] Stream finished`);
          break;
        }
        
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        // Look for complete JSON objects (starts with { and ends with })
        let startPos = 0;
        while (startPos < buffer.length) {
          const openBrace = buffer.indexOf('{', startPos);
          if (openBrace === -1) break;
          
          // Find the matching closing brace
          let braceCount = 0;
          let endPos = openBrace;
          let inString = false;
          let escaped = false;
          
          for (let i = openBrace; i < buffer.length; i++) {
            const char = buffer[i];
            
            if (escaped) {
              escaped = false;
              continue;
            }
            
            if (char === '\\') {
              escaped = true;
              continue;
            }
            
            if (char === '"') {
              inString = !inString;
              continue;
            }
            
            if (!inString) {
              if (char === '{') {
                braceCount++;
              } else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                  endPos = i;
                  break;
                }
              }
            }
          }
          
          // If we found a complete JSON object
          if (braceCount === 0 && endPos > openBrace) {
            const jsonStr = buffer.slice(openBrace, endPos + 1);
            linesProcessed++;
            objectsFound++;
            
            console.log(`[reddit-backfill-import] Found complete JSON object ${objectsFound}: ${jsonStr.slice(0, 100)}...`);
            
            try {
              const obj = JSON.parse(jsonStr);
              console.log(`[reddit-backfill-import] JSON parsed successfully, keys: ${Object.keys(obj).slice(0, 10).join(',')}`);
              
              // Save first 5 objects for analysis
              if (sampleData.length < 5) {
                sampleData.push({
                  objectNumber: objectsFound,
                  keys: Object.keys(obj),
                  subreddit: obj.subreddit,
                  title: obj.title?.slice(0, 50),
                  selftext: obj.selftext?.slice(0, 50),
                  body: obj.body?.slice(0, 50),
                  created_utc: obj.created_utc,
                  author: obj.author,
                  fullSample: objectsFound <= 2 ? obj : undefined // Full object for first 2
                });
                console.log(`[reddit-backfill-import] Saved sample ${sampleData.length}:`, sampleData[sampleData.length - 1]);
              }
              
            } catch (parseError) {
              console.log(`[reddit-backfill-import] JSON parse error object ${objectsFound}:`, parseError);
            }
            
            startPos = endPos + 1;
            
            if (linesProcessed >= maxLines) break;
          } else {
            // Incomplete object, need more data
            break;
          }
        }
        
        // Keep the incomplete part in buffer
        if (startPos > 0) {
          buffer = buffer.slice(startPos);
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

// Integrate with full import pipeline 
async function processFullImport(
  url: string,
  subreddits?: string[],
  symbols?: string[],
  batchSize: number = 25,
  runId?: string,
  startLine: number = 0,
  maxItems: number = 1000
) {
  console.log('[reddit-backfill-import] processFullImport: creating run entry');
  
  // Create/update run tracking
  if (runId) {
    await supabase.from('import_runs').upsert({
      run_id: runId,
      status: 'processing',
      file: url,
      batch_size: batchSize,
      started_at: startLine === 0 ? new Date().toISOString() : undefined,
    }, { onConflict: 'run_id' });
  }
  
  // Process one chunk with our working JSON extraction
  const result = await processFileChunk(url, startLine, Math.min(maxItems, 100));
  
  console.log(`[reddit-backfill-import] Chunk complete: ${result.validPosts} posts found`);
  
  // Update run status
  if (runId) {
    await supabase.from('import_runs').update({
      scanned_total: result.linesProcessed,
      queued_total: result.validPosts,
      status: 'completed'
    }).eq('run_id', runId);
  }
  
  return {
    runId,
    linesProcessed: result.linesProcessed,
    validPosts: result.validPosts,
    message: `Found ${result.validPosts} valid Reddit posts`
  };
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
      
      // Run the full import pipeline now that JSON extraction works
      const result = await processFullImport(
        body.jsonl_url,
        body.subreddits,
        body.symbols,
        body.batch_size ?? 25,
        body.run_id,
        body._continue_from_line ?? 0,
        body.max_items ?? 1000
      );
      
      console.log('[reddit-backfill-import] Full import result:', result);
      
      return new Response(
        JSON.stringify(result),
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