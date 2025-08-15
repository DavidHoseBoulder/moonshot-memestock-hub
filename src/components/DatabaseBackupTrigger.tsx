import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

export function DatabaseBackupTrigger() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runBackup = async () => {
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      console.log('Triggering database backup...');
      
      const { data, error } = await supabase.functions.invoke('database-backup', {
        body: {}
      });

      if (error) {
        throw error;
      }

      console.log('Backup completed:', data);
      setResult(data);
    } catch (err: any) {
      console.error('Backup failed:', err);
      setError(err.message || 'Failed to create database backup');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Database Backup</CardTitle>
        <CardDescription>
          Create a complete backup of your database and store it in Supabase Storage
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={runBackup} 
          disabled={isRunning}
          className="w-full"
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Backup...
            </>
          ) : (
            'Create Database Backup'
          )}
        </Button>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result && (
          <Alert>
            <AlertDescription>
              <div className="space-y-2">
                <p><strong>Backup completed successfully!</strong></p>
                <p><strong>Filename:</strong> {result.filename}</p>
                <p><strong>Size:</strong> {(result.size / 1024 / 1024).toFixed(2)} MB</p>
                <p><strong>Storage Path:</strong> {result.uploadPath}</p>
                {result.publicUrl && (
                  <p><strong>Download URL:</strong> <a href={result.publicUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{result.publicUrl}</a></p>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}