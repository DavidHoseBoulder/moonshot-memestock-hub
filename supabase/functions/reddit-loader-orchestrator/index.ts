import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface LoaderRequest {
  start_date?: string;
  end_date?: string;
  persist_raw?: boolean;
  skip_comments?: boolean;
  subreddit_filter?: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: LoaderRequest = await req.json().catch(() => ({}));
    
    // Default to yesterday if no dates provided
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const today = new Date();
    
    const startDate = body.start_date || yesterday.toISOString().split('T')[0];
    const endDate = body.end_date || today.toISOString().split('T')[0];
    const persistRaw = body.persist_raw ?? false;
    const skipComments = body.skip_comments ?? false;
    const subredditFilter = body.subreddit_filter || [];
    
    console.log('[reddit-loader-orchestrator] Starting Reddit load', {
      startDate,
      endDate,
      persistRaw,
      skipComments,
      subredditFilter
    });
    
    const runId = `loader-${startDate}-${endDate}-${Date.now()}`;
    
    // Get active subreddits
    let subredditsQuery = supabase
      .from('subreddit_universe')
      .select('name')
      .eq('active', true)
      .order('priority');
    
    const { data: subreddits, error: subError } = await subredditsQuery;
    
    if (subError) {
      throw new Error(`Failed to fetch subreddits: ${subError.message}`);
    }
    
    const targetSubreddits = subredditFilter.length > 0 
      ? subredditFilter 
      : (subreddits || []).map(s => s.name);
    
    console.log(`[reddit-loader-orchestrator] Loading ${targetSubreddits.length} subreddits`);
    
    // Fetch posts from reddit-backfill-import
    const { data: postsResult, error: postsError } = await supabase.functions.invoke(
      'reddit-backfill-import',
      {
        body: {
          mode: 'fetch_posts',
          start_date: startDate,
          end_date: endDate,
          subreddits: targetSubreddits,
          persist_raw: persistRaw
        }
      }
    );
    
    if (postsError) {
      throw new Error(`Failed to fetch posts: ${postsError.message}`);
    }
    
    console.log('[reddit-loader-orchestrator] Posts fetched:', postsResult);
    
    // Fetch comments if not skipped
    let commentsResult = null;
    if (!skipComments) {
      const { data: commentsData, error: commentsError } = await supabase.functions.invoke(
        'reddit-backfill-import',
        {
          body: {
            mode: 'fetch_comments',
            start_date: startDate,
            end_date: endDate,
            subreddits: targetSubreddits,
            persist_raw: persistRaw
          }
        }
      );
      
      if (commentsError) {
        console.error('[reddit-loader-orchestrator] Comments fetch failed:', commentsError);
      } else {
        commentsResult = commentsData;
        console.log('[reddit-loader-orchestrator] Comments fetched:', commentsResult);
      }
    }
    
    // Refresh mentions for the date range
    const startTs = new Date(startDate + 'T00:00:00Z').toISOString();
    const endTs = new Date(endDate + 'T23:59:59Z').toISOString();
    
    const { data: mentionsResult, error: mentionsError } = await supabase.rpc(
      'reddit_refresh_mentions',
      { d0: startTs, d3: endTs }
    );
    
    if (mentionsError) {
      console.error('[reddit-loader-orchestrator] Mentions refresh failed:', mentionsError);
    } else {
      console.log('[reddit-loader-orchestrator] Mentions refreshed:', mentionsResult);
    }
    
    return new Response(
      JSON.stringify({ 
        success: true,
        run_id: runId,
        start_date: startDate,
        end_date: endDate,
        subreddits_count: targetSubreddits.length,
        posts: postsResult,
        comments: commentsResult,
        mentions: mentionsResult
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error: any) {
    console.error('[reddit-loader-orchestrator] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
