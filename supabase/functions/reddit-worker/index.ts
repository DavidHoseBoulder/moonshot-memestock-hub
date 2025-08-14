import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface RedditPost {
  id?: string;
  title: string;
  selftext?: string;
  body?: string;
  score: number;
  num_comments: number;
  created_utc: number;
  subreddit: string;
  author?: string;
  url?: string;
}

// Process file chunk function (moved from original function)
async function processFileChunk(
  url: string,
  startLine: number = 0,
  maxLines: number = 1000
): Promise<{ linesProcessed: number, validPosts: number, sampleData: any[] }> {
  
  console.log(`[reddit-worker] Processing ${maxLines} lines from line ${startLine} - URL: ${url}`);
  
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
        
        while (startPos < buffer.length && objectsProcessed < maxLines) {
          const openBrace = buffer.indexOf('{', startPos);
          if (openBrace === -1) break;
          
          let braceCount = 0;
          let endPos = openBrace;
          
          // Find the matching closing brace
          for (let i = openBrace; i < buffer.length; i++) {
            if (buffer[i] === '{') braceCount++;
            else if (buffer[i] === '}') braceCount--;
            
            if (braceCount === 0) {
              endPos = i;
              break;
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
              console.warn(`[reddit-worker] JSON parse error for object ${objectsProcessed}`);
            }
            
            startPos = endPos + 1;
            
          } else {
            // Incomplete JSON, need more data
            break;
          }
        }
        
        // Keep unprocessed data in buffer for next iteration
        if (startPos > 0) {
          buffer = buffer.slice(startPos);
        }
      }
      
    } finally {
      await reader.cancel();
    }

    console.log(`[reddit-worker] Processed ${objectsProcessed} objects, found ${sampleData.length} valid posts`);
    
    return {
      linesProcessed: objectsProcessed,
      validPosts: sampleData.length,
      sampleData
    };

  } catch (error) {
    console.error(`[reddit-worker] Error processing file chunk:`, error);
    throw error;
  }
}

// Full import pipeline function
async function processFullImport(
  url: string,
  subreddits?: string[],
  symbols?: string[],
  batchSize: number = 25,
  runId?: string,
  startLine: number = 0,
  maxItems: number = 1000
) {
  
  console.log(`[reddit-worker] Starting full import for run ${runId}`);
  
  // Update run status to processing
  if (runId) {
    await supabase.from('import_runs').update({
      status: 'processing',
      started_at: startLine === 0 ? new Date().toISOString() : undefined,
    }).eq('run_id', runId);
  }
  
  // Convert maxItems=0 to a large number for unlimited processing
  const actualMaxItems = maxItems === 0 ? 1000000 : maxItems;
  const result = await processFileChunk(url, startLine, actualMaxItems);
  
  console.log(`[reddit-worker] Chunk complete: ${result.validPosts} posts found`);
  
  // Update initial progress after file scanning
  if (runId) {
    await supabase.from('import_runs').update({
      scanned_total: result.linesProcessed,
      queued_total: result.validPosts,
      status: 'processing'
    }).eq('run_id', runId);
    console.log(`[reddit-worker] Initial progress updated: scanned=${result.linesProcessed}, queued=${result.validPosts}`);
  }

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
        author: sample.fullSample.author || 'unknown'
      }));

  console.log(`[reddit-worker] Starting sentiment analysis for ${postsToAnalyze.length} posts`);
    
    // Process in batches of 50 to avoid timeouts
    const sentimentBatchSize = 50;
    for (let i = 0; i < postsToAnalyze.length; i += sentimentBatchSize) {
      const batch = postsToAnalyze.slice(i, i + sentimentBatchSize);
      console.log(`[reddit-worker] Processing sentiment batch ${Math.floor(i/sentimentBatchSize) + 1}/${Math.ceil(postsToAnalyze.length/sentimentBatchSize)} (${batch.length} posts)`);
      
      try {
        const response = await supabase.functions.invoke('ai-sentiment-analysis', {
          body: { posts: batch }
        });
        
        if (response.error) {
          console.error(`[reddit-worker] Sentiment analysis error for batch ${Math.floor(i/sentimentBatchSize) + 1}:`, response.error);
        } else if (response.data) {
          const batchAnalyzedCount = response.data?.analyzed_posts?.length || response.data?.total_analyzed || 0;
          analyzedCount += batchAnalyzedCount;
          console.log(`[reddit-worker] Batch ${Math.floor(i/sentimentBatchSize) + 1} complete: ${batchAnalyzedCount} posts analyzed`);
          
          // Update progress in real-time after each batch
          if (runId) {
            await supabase.from('import_runs').update({
              analyzed_total: analyzedCount,
              queued_total: postsToAnalyze.length,
              scanned_total: result.linesProcessed,
              status: 'processing'
            }).eq('run_id', runId);
            console.log(`[reddit-worker] Updated progress: ${analyzedCount}/${postsToAnalyze.length} analyzed`);
          }
        } else {
          console.warn(`[reddit-worker] Batch ${Math.floor(i/sentimentBatchSize) + 1}: No data or error in response`);
        }
        
      } catch (error) {
        console.error(`[reddit-worker] Sentiment batch ${Math.floor(i/sentimentBatchSize) + 1} failed:`, error?.message);
        // Continue processing other batches even if one fails
      }
    }
    
    console.log(`[reddit-worker] Sentiment analysis complete: ${analyzedCount} total posts analyzed`);
  }
  
  // Update run status with proper timestamp
  if (runId) {
    await supabase.from('import_runs').update({
      status: 'completed',
      finished_at: new Date().toISOString(),
      analyzed_total: analyzedCount,
      inserted_total: analyzedCount // Assuming analyzed = inserted for now
    }).eq('run_id', runId);
    
    console.log(`[reddit-worker] Run ${runId} completed successfully`);
  }

  return {
    linesProcessed: result.linesProcessed,
    validPosts: result.validPosts,
    analyzedPosts: analyzedCount,
    insertedPosts: analyzedCount
  };
}

// Background worker that processes the queue
async function processQueue() {
  console.log('[reddit-worker] Checking for pending jobs...');
  
  // Get the next pending job
  const { data: queueItem, error } = await supabase
    .from('import_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
    
  if (error) {
    console.error('[reddit-worker] Error fetching queue:', error);
    return { processed: false, error: error.message };
  }
  
  if (!queueItem) {
    console.log('[reddit-worker] No pending jobs found');
    return { processed: false, message: 'No pending jobs' };
  }
  
  console.log(`[reddit-worker] Processing job ${queueItem.run_id}`);
  
  try {
    // Mark as processing
    await supabase
      .from('import_queue')
      .update({ 
        status: 'processing',
        processed_at: new Date().toISOString()
      })
      .eq('id', queueItem.id);
    
    // Process the job
    const result = await processFullImport(
      queueItem.jsonl_url,
      queueItem.subreddits,
      queueItem.symbols,
      queueItem.batch_size,
      queueItem.run_id,
      0,
      queueItem.max_items
    );
    
    // Mark as completed
    await supabase
      .from('import_queue')
      .update({ status: 'completed' })
      .eq('id', queueItem.id);
      
    console.log(`[reddit-worker] Job ${queueItem.run_id} completed successfully`);
    
    return { 
      processed: true, 
      run_id: queueItem.run_id,
      result 
    };
    
  } catch (error) {
    console.error(`[reddit-worker] Job ${queueItem.run_id} failed:`, error);
    
    // Mark as failed
    await supabase
      .from('import_queue')
      .update({ 
        status: 'failed',
        error_message: error.message
      })
      .eq('id', queueItem.id);
      
    // Also update the run status
    await supabase
      .from('import_runs')
      .update({ 
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: error.message
      })
      .eq('run_id', queueItem.run_id);
    
    return { 
      processed: true, 
      run_id: queueItem.run_id,
      error: error.message 
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[reddit-worker] Worker triggered');
    
    // Process one job from the queue
    const result = await processQueue();
    
    return new Response(
      JSON.stringify(result),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error: any) {
    console.error('[reddit-worker] Worker error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
