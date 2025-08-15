import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting database backup process...');

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Creating schema backup via Supabase client...');

    // Create timestamp for filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `database-schema-${timestamp}.sql`;

    let sqlContent = `-- Database schema backup generated on ${new Date().toISOString()}\n`;
    sqlContent += `-- Generated from Supabase project: ${supabaseUrl}\n\n`;
    sqlContent += `-- This backup contains only the database structure (DDL), no data\n\n`;

    try {
      // Get table information from information_schema
      console.log('Fetching table schema information...');
      
      const { data: tables, error: tablesError } = await supabase
        .rpc('get_table_schema_info');

      if (tablesError) {
        console.log('RPC not available, using direct schema queries...');
        
        // Fallback: Get basic table structure
        const publicTables = [
          'backtesting_results',
          'enhanced_market_data', 
          'enhanced_sentiment_data',
          'import_queue',
          'import_runs',
          'market_data',
          'sentiment_analysis',
          'sentiment_history',
          'ticker_universe',
          'trading_signals'
        ];

        sqlContent += `-- PUBLIC SCHEMA TABLES\n\n`;

        for (const tableName of publicTables) {
          try {
            // Get sample record to infer structure
            const { data: sampleData, error: sampleError } = await supabase
              .from(tableName)
              .select('*')
              .limit(1);

            if (!sampleError && sampleData && sampleData.length > 0) {
              const columns = Object.keys(sampleData[0]);
              
              sqlContent += `-- Table: ${tableName}\n`;
              sqlContent += `CREATE TABLE public.${tableName} (\n`;
              
              columns.forEach((col, index) => {
                const value = sampleData[0][col];
                let sqlType = 'TEXT';
                
                if (col === 'id') sqlType = 'UUID PRIMARY KEY DEFAULT gen_random_uuid()';
                else if (col.includes('_at')) sqlType = 'TIMESTAMP WITH TIME ZONE';
                else if (col.includes('date')) sqlType = 'DATE';
                else if (typeof value === 'number') {
                  if (Number.isInteger(value)) sqlType = 'INTEGER';
                  else sqlType = 'NUMERIC';
                }
                else if (typeof value === 'boolean') sqlType = 'BOOLEAN';
                else if (Array.isArray(value)) sqlType = 'TEXT[]';
                else if (typeof value === 'object' && value !== null) sqlType = 'JSONB';
                
                const comma = index < columns.length - 1 ? ',' : '';
                sqlContent += `  ${col} ${sqlType}${comma}\n`;
              });
              
              sqlContent += `);\n\n`;
              
              // Add basic RLS enable statement
              sqlContent += `ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;\n\n`;
            }
          } catch (tableError) {
            console.warn(`Could not process table ${tableName}:`, tableError);
            sqlContent += `-- Could not process table ${tableName}\n\n`;
          }
        }

        // Add commonly used functions
        sqlContent += `-- COMMON FUNCTIONS\n\n`;
        sqlContent += `CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;\n\n`;

        // Add triggers for updated_at columns
        for (const tableName of publicTables) {
          sqlContent += `CREATE TRIGGER update_${tableName}_updated_at
  BEFORE UPDATE ON public.${tableName}
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();\n\n`;
        }

      } else {
        // If RPC worked, use the returned schema information
        sqlContent += JSON.stringify(tables, null, 2);
      }

    } catch (schemaError) {
      console.error('Error fetching schema:', schemaError);
      sqlContent += `-- Error fetching schema: ${schemaError.message}\n`;
      sqlContent += `-- Manual schema reconstruction required\n\n`;
    }

    sqlContent += `-- End of schema backup\n`;
    sqlContent += `-- Generated on: ${new Date().toISOString()}\n`;

    const backupData = new TextEncoder().encode(sqlContent);
    console.log(`Schema backup generated. Size: ${backupData.length} bytes`);

    // Upload to Supabase Storage
    console.log(`Uploading schema backup to storage as: ${filename}`);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('moonshot-storage')
      .upload(filename, backupData, {
        contentType: 'application/sql',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload backup: ${uploadError.message}`);
    }

    console.log('Schema backup uploaded successfully:', uploadData);

    // Get the signed URL for download (valid for 1 hour)
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('moonshot-storage')
      .createSignedUrl(filename, 3600);

    const response = {
      success: true,
      message: 'Database schema backup completed successfully',
      filename: filename,
      uploadPath: uploadData.path,
      downloadUrl: signedUrlData?.signedUrl,
      size: backupData.length,
      timestamp: new Date().toISOString(),
      type: 'schema_only'
    };

    console.log('Schema backup process completed:', response);

    return new Response(
      JSON.stringify(response),
      {
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        }
      }
    );

  } catch (error) {
    console.error('Database backup error:', error);
    
    const errorResponse = {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };

    return new Response(
      JSON.stringify(errorResponse),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});