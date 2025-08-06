
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Validate required environment variables
if (!SUPABASE_URL) {
  console.error('Error: SUPABASE_URL environment variable is required');
  process.exit(1);
}

if (!SUPABASE_ANON_KEY) {
  console.error('Error: SUPABASE_ANON_KEY environment variable is required');
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function analyzeWithAI(marketData, sentimentData, symbol) {
  const prompt = `
Analyze the following market and sentiment data for ${symbol} and generate an improved backtesting strategy.

Market Data Points: ${marketData.length}
Sentiment Data Points: ${sentimentData.length}

Recent Market Performance:
${marketData.slice(-10).map(d => `${d.timestamp}: $${d.price}`).join('\n')}

Recent Sentiment Scores:
${sentimentData.slice(-10).map(d => `${d.post_created_at}: ${d.overall_sentiment} (${d.sentiment_label})`).join('\n')}

Current strategy parameters:
- Sentiment threshold: 0.3
- Holding period: 3 days
- Position size: 10%

Please provide:
1. Recommended new strategy parameters based on the data
2. TypeScript code for an improved trading strategy function
3. Analysis of why these parameters would work better

Format your response as JSON with these keys:
{
  "analysis": "Your analysis explanation",
  "parameters": {
    "sentiment_threshold": 0.4,
    "holding_period_days": 5,
    "position_size": 0.15,
    "additional_filters": {}
  },
  "strategy_code": "TypeScript code for the new strategy function"
}`;

  try {
    console.log('Making OpenAI API request...');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert quantitative analyst specializing in sentiment-based trading strategies. Provide actionable, data-driven recommendations. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      }),
    });

    console.log(`OpenAI API Response Status: ${response.status}`);
    
    if (!response.ok) {
      console.error('OpenAI API error:', response.status, response.statusText);
      const errorText = await response.text();
      console.error('Error response:', errorText);
      return null;
    }

    const data = await response.json();
    console.log('OpenAI API response received:', {
      hasChoices: !!data.choices,
      choicesLength: data.choices?.length,
      firstChoiceHasMessage: !!(data.choices?.[0]?.message),
      contentLength: data.choices?.[0]?.message?.content?.length
    });

    // Better error handling for response structure
    if (!data || typeof data !== 'object') {
      console.error('Invalid response format: not an object');
      return null;
    }

    if (!data.choices || !Array.isArray(data.choices)) {
      console.error('No choices array in OpenAI response:', data);
      return null;
    }

    if (data.choices.length === 0) {
      console.error('Empty choices array in OpenAI response');
      return null;
    }

    const firstChoice = data.choices[0];
    if (!firstChoice || !firstChoice.message) {
      console.error('Invalid choice structure:', firstChoice);
      return null;
    }

    const content = firstChoice.message.content;
    if (!content || typeof content !== 'string') {
      console.error('Empty or invalid content in response');
      return null;
    }

    console.log('Raw AI response content (first 500 chars):', content.substring(0, 500));

    try {
      // Try to extract JSON if it's wrapped in markdown or has extra text
      let jsonContent = content.trim();
      
      // Remove markdown code blocks if present
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }
      
      // Try to find JSON object in the response
      const jsonStart = jsonContent.indexOf('{');
      const jsonEnd = jsonContent.lastIndexOf('}');
      
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
      }

      const parsed = JSON.parse(jsonContent);
      
      // Validate the expected structure
      if (!parsed.analysis || !parsed.parameters) {
        console.error('Missing required fields in AI response:', Object.keys(parsed));
        return {
          analysis: parsed.analysis || 'AI analysis failed to provide detailed explanation',
          parameters: parsed.parameters || {
            sentiment_threshold: 0.4,
            holding_period_days: 5,
            position_size: 0.15
          },
          strategy_code: parsed.strategy_code || 'No enhanced strategy code provided'
        };
      }

      return parsed;
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError.message);
      console.error('Content that failed to parse:', content);
      
      // Return a fallback response
      return {
        analysis: `Failed to parse AI response, but analysis was attempted for ${symbol} with ${marketData.length} market data points.`,
        parameters: {
          sentiment_threshold: 0.4,
          holding_period_days: 5,
          position_size: 0.15
        },
        strategy_code: '// AI response parsing failed - using default parameters'
      };
    }
  } catch (error) {
    console.error('AI Analysis failed with error:', error.message);
    console.error('Full error:', error);
    return null;
  }
}

async function updateBacktestingStrategy(aiRecommendations, symbol) {
  if (!aiRecommendations) {
    console.log('No AI recommendations to update strategy with');
    return;
  }

  try {
    // Update the sentiment backtesting function with AI recommendations
    const backtestingPath = path.join(__dirname, '../../supabase/functions/sentiment-backtesting/index.ts');
    
    if (!fs.existsSync(backtestingPath)) {
      console.error('Backtesting function file not found:', backtestingPath);
      return;
    }

    let backtestingCode = fs.readFileSync(backtestingPath, 'utf8');

    // Update default parameters in the backtesting function
    const newDefaults = `
    // AI-generated parameters based on analysis of ${symbol}
    // Analysis: ${aiRecommendations.analysis.slice(0, 200)}...
    sentiment_threshold: ${aiRecommendations.parameters.sentiment_threshold},
    holding_period_days: ${aiRecommendations.parameters.holding_period_days},
    position_size: ${aiRecommendations.parameters.position_size}`;

    // Insert AI-generated strategy code if provided
    if (aiRecommendations.strategy_code) {
      const strategyComment = `
    // AI-Generated Enhanced Strategy for ${symbol}
    // Generated on: ${new Date().toISOString()}
    ${aiRecommendations.strategy_code}`;
      
      backtestingCode = backtestingCode.replace(
        '// Run sentiment-based trading strategy',
        strategyComment + '\n    // Run sentiment-based trading strategy'
      );
    }

    fs.writeFileSync(backtestingPath, backtestingCode);

    // Create a strategy report
    const reportPath = path.join(__dirname, '../../ai-strategy-reports');
    if (!fs.existsSync(reportPath)) {
      fs.mkdirSync(reportPath, { recursive: true });
    }

    const reportFile = path.join(reportPath, `${symbol}-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify({
      symbol,
      timestamp: new Date().toISOString(),
      analysis: aiRecommendations.analysis,
      parameters: aiRecommendations.parameters,
      strategy_code: aiRecommendations.strategy_code
    }, null, 2));

    console.log(`Strategy updated for ${symbol} and saved to ${reportFile}`);
  } catch (error) {
    console.error('Error updating backtesting strategy:', error.message);
  }
}

async function main() {
  const symbol = process.argv[2] || 'AAPL';
  const days = parseInt(process.argv[3]) || 30;

  console.log(`Running AI analysis for ${symbol} over ${days} days...`);

  try {
    // Fetch market data
    const { data: marketData, error: marketError } = await supabase
      .from('market_data')
      .select('*')
      .eq('symbol', symbol.toUpperCase())
      .gte('timestamp', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('timestamp');

    if (marketError) {
      console.error('Error fetching market data:', marketError);
      return;
    }

    // Fetch sentiment data
    const { data: sentimentData, error: sentimentError } = await supabase
      .from('sentiment_analysis')
      .select('*')
      .contains('symbols_mentioned', [symbol.toUpperCase()])
      .gte('post_created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
      .order('post_created_at');

    if (sentimentError) {
      console.error('Error fetching sentiment data:', sentimentError);
    }

    console.log(`Found ${marketData?.length || 0} market data points and ${sentimentData?.length || 0} sentiment data points`);

    if (!marketData || marketData.length === 0) {
      console.log('No market data found, skipping AI analysis');
      return;
    }

    // Run AI analysis
    const aiRecommendations = await analyzeWithAI(marketData, sentimentData || [], symbol);
    
    if (aiRecommendations) {
      console.log('AI Analysis completed successfully');
      console.log('Analysis summary:', aiRecommendations.analysis.substring(0, 200) + '...');
      await updateBacktestingStrategy(aiRecommendations, symbol);
    } else {
      console.log('AI analysis failed or returned no recommendations');
    }

  } catch (error) {
    console.error('Error in AI backtesting:', error.message);
    console.error('Full error:', error);
  }
}

main();
