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
  maxLines: number = 1000
): Promise<{ linesProcessed: number, validPosts: number, sampleData: any[] }> {
  
  console.log(`[reddit-backfill-import] Processing ${maxLines} lines from line ${startLine}`);
  
  try {
    const resp = await fetch(url);
    
    if (!resp.ok || !resp.body) {
      throw new Error(`Failed to fetch ${url}: ${resp.status}`);
    }

    // Check compression
    const enc = (resp.headers.get("content-encoding") || "").toLowerCase();
    const ctype = (resp.headers.get("content-type") || "").toLowerCase();
    const looksGzip = url.endsWith(".gz") || ctype.includes("application/gzip");
    let byteStream: ReadableStream<Uint8Array> = resp.body as ReadableStream<Uint8Array>;
    if (looksGzip && !enc.includes("gzip")) {
      // @ts-ignore
      byteStream = byteStream.pipeThrough(new DecompressionStream("gzip"));
    }

    const reader = byteStream.getReader();
    const decoder = new TextDecoder();
    let objectsProcessed = 0;
    const sampleData: any[] = [];

    try {
      let buffer = "";

      while (objectsProcessed < maxLines) {
        const { value, done } = await reader.read();
        if (done) break;
        
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
            objectsProcessed++;
            
            try {
              const obj = JSON.parse(jsonStr);
              
              // Save all valid posts for sentiment analysis
              if (obj.title && obj.subreddit) { // Basic validation
                sampleData.push({
                  objectNumber: objectsProcessed,
                  keys: Object.keys(obj),
                  subreddit: obj.subreddit,
                  title: obj.title?.slice(0, 50),
                  selftext: obj.selftext?.slice(0, 50),
                  body: obj.body?.slice(0, 50),
                  created_utc: obj.created_utc,
                  author: obj.author,
                  fullSample: obj // Keep full object for sentiment analysis
                });
              }
              
            } catch (parseError) {
              console.warn(`[reddit-backfill-import] JSON parse error for object ${objectsProcessed}`);
            }
            
            startPos = endPos + 1;
            
            if (objectsProcessed >= maxLines) break;
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

    console.log(`[reddit-backfill-import] Processing complete: processed=${objectsProcessed}, samples=${sampleData.length}`);
    
    return {
      linesProcessed: objectsProcessed, // Return objects processed as line count
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
  const result = await processFileChunk(url, startLine, maxItems);
  
  console.log(`[reddit-backfill-import] Chunk complete: ${result.validPosts} posts found`);
  
  // Run sentiment analysis on valid posts in batches
  let analyzedCount = 0;
  if (result.validPosts > 0 && result.sampleData.length > 0) {
    // Convert sample data to posts format for sentiment analysis
    const postsToAnalyze = result.sampleData
      .filter(sample => sample.fullSample?.title && sample.fullSample?.subreddit)
      .map(sample => ({
        title: sample.fullSample.title,
        selftext: sample.fullSample.selftext || '',
        score: sample.fullSample.score || 0,
        num_comments: sample.fullSample.num_comments || 0,
        created_utc: sample.fullSample.created_utc,
        subreddit: sample.fullSample.subreddit,
        id: sample.fullSample.id,
        author: sample.fullSample.author
      }));
    
    console.log(`[reddit-backfill-import] Starting sentiment analysis for ${postsToAnalyze.length} posts in batches of 50`);
    
    // Process in batches of 50 to avoid timeouts
    const batchSize = 50;
    for (let i = 0; i < postsToAnalyze.length; i += batchSize) {
      const batch = postsToAnalyze.slice(i, i + batchSize);
      console.log(`[reddit-backfill-import] Processing sentiment batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(postsToAnalyze.length/batchSize)} (${batch.length} posts)`);
      
      try {
        const { data: sentimentData, error: sentimentError } = await supabase.functions.invoke('ai-sentiment-analysis', {
          body: { posts: batch }
        });
        
        if (sentimentError) {
          console.error(`[reddit-backfill-import] Sentiment analysis error for batch ${Math.floor(i/batchSize) + 1}:`, sentimentError);
        } else {
          const batchAnalyzedCount = sentimentData?.analyzedPosts?.length || 0;
          analyzedCount += batchAnalyzedCount;
          console.log(`[reddit-backfill-import] Batch ${Math.floor(i/batchSize) + 1} complete: ${batchAnalyzedCount} posts analyzed`);
        }
      } catch (error) {
        console.error(`[reddit-backfill-import] Sentiment analysis failed for batch ${Math.floor(i/batchSize) + 1}:`, error);
      }
    }
    
    console.log(`[reddit-backfill-import] Sentiment analysis complete: ${analyzedCount} total posts analyzed`);
  }
  
  // Update run status with proper timestamp
  if (runId) {
    await supabase.from('import_runs').update({
      scanned_total: result.linesProcessed,
      queued_total: result.validPosts,
      analyzed_total: analyzedCount,
      status: 'completed',
      finished_at: new Date().toISOString()
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: BackfillRequest = await req.json();

    if (body.mode === "jsonl_url" && body.jsonl_url) {
      
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