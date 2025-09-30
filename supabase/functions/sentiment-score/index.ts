import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SentimentScoreRequest {
  sources?: string[];
  min_mentions?: number;
  model_version?: string;
  limit?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: SentimentScoreRequest = await req.json().catch(() => ({}));
    const {
      sources = ['reddit'],
      min_mentions = 1,
      model_version = 'gpt-sent-v1',
      limit = 200
    } = body;

    console.log('📊 Starting sentiment scoring job', {
      sources,
      min_mentions,
      model_version,
      limit
    });

    let totalProcessed = 0;
    let totalScored = 0;

    // Process Reddit mentions
    if (sources.includes('reddit')) {
      console.log('📊 Fetching unscored Reddit mentions...');
      
      // Fetch unscored mentions
      const { data: mentions, error: fetchError } = await supabase.rpc('fetch_mentions_batch', {
        p_model: model_version,
        p_limit: limit
      });

      if (fetchError) {
        console.error('❌ Error fetching mentions:', fetchError);
        throw fetchError;
      }

      if (!mentions || mentions.length === 0) {
        console.log('✅ No unscored mentions found');
        return new Response(
          JSON.stringify({
            success: true,
            message: 'No mentions to score',
            processed: 0,
            scored: 0
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      console.log(`📊 Found ${mentions.length} unscored mentions`);
      totalProcessed = mentions.length;

      // Process in batches
      const batchSize = 10;
      for (let i = 0; i < mentions.length; i += batchSize) {
        const batch = mentions.slice(i, i + batchSize);
        console.log(`📊 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(mentions.length / batchSize)}`);

        // Score each mention in the batch
        for (const mention of batch) {
          try {
            const text = `${mention.title || ''} ${mention.selftext || ''}`.trim();
            
            if (!text || text.length < 10) {
              console.log(`⏭️ Skipping mention ${mention.mention_id}: text too short`);
              continue;
            }

            // Simple sentiment scoring (you can enhance this with AI later)
            const score = calculateSentiment(text);
            const label = score > 0.1 ? 'POSITIVE' : score < -0.1 ? 'NEGATIVE' : 'NEUTRAL';
            const confidence = Math.abs(score);

            // Store sentiment
            const { error: upsertError } = await supabase.rpc('upsert_reddit_sentiment', {
              p_mention_id: mention.mention_id,
              p_model: model_version,
              p_score: score,
              p_label: label,
              p_confidence: confidence,
              p_rationale: 'Automated scoring'
            });

            if (upsertError) {
              console.error(`❌ Error scoring mention ${mention.mention_id}:`, upsertError);
            } else {
              totalScored++;
            }
          } catch (error) {
            console.error(`❌ Error processing mention ${mention.mention_id}:`, error);
          }
        }

        // Small delay between batches
        if (i + batchSize < mentions.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    console.log(`✅ Sentiment scoring complete: ${totalScored}/${totalProcessed} mentions scored`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Scored ${totalScored} of ${totalProcessed} mentions`,
        processed: totalProcessed,
        scored: totalScored,
        sources
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('❌ Sentiment scoring error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// Simple sentiment calculation (can be replaced with AI scoring)
function calculateSentiment(text: string): number {
  const positiveWords = ['bullish', 'moon', 'rocket', 'buy', 'long', 'calls', 'green', 'win', 'gains', 'profit'];
  const negativeWords = ['bearish', 'crash', 'dump', 'sell', 'short', 'puts', 'red', 'loss', 'losses', 'fail'];
  
  const lowerText = text.toLowerCase();
  let score = 0;
  
  positiveWords.forEach(word => {
    const count = (lowerText.match(new RegExp(word, 'g')) || []).length;
    score += count * 0.1;
  });
  
  negativeWords.forEach(word => {
    const count = (lowerText.match(new RegExp(word, 'g')) || []).length;
    score -= count * 0.1;
  });
  
  // Normalize to -1 to 1 range
  return Math.max(-1, Math.min(1, score));
}
