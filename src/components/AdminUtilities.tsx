import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Shield, Copy, CheckCircle, TrendingUp } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const AdminUtilities: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [granting, setGranting] = useState(false);
  const [fetchingPolygon, setFetchingPolygon] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          setUserId(user.id);
          
          // Check if already admin
          const { data: roles } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .eq('role', 'admin')
            .maybeSingle();
          
          setIsAdmin(!!roles);
        }
      } catch (error) {
        console.error('Error fetching user info:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserInfo();
  }, []);

  const copyUserId = () => {
    if (userId) {
      navigator.clipboard.writeText(userId);
      toast({
        title: 'Copied!',
        description: 'User ID copied to clipboard',
      });
    }
  };

  const grantAdminAccess = async () => {
    if (!userId) return;
    
    setGranting(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: 'admin' });

      if (error) {
        // Check if already exists
        if (error.code === '23505') {
          toast({
            title: 'Already Admin',
            description: 'You already have admin access!',
          });
          setIsAdmin(true);
        } else {
          throw error;
        }
      } else {
        toast({
          title: 'Success!',
          description: 'Admin access granted. Refresh the page to access admin features.',
        });
        setIsAdmin(true);
      }
    } catch (error) {
      console.error('Error granting admin:', error);
      toast({
        title: 'Error',
        description: 'Failed to grant admin access. You may need to use SQL Editor instead.',
        variant: 'destructive',
      });
    } finally {
      setGranting(false);
    }
  };

  const fetchPolygonData = async () => {
    setFetchingPolygon(true);
    try {
      const { data, error } = await supabase.functions.invoke('polygon-market-data-scheduler');

      if (error) throw error;

      toast({
        title: 'Success!',
        description: `Polygon data fetched for ${data.symbols_processed}/${data.symbols_requested} symbols`,
      });
    } catch (error) {
      console.error('Error fetching Polygon data:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to fetch Polygon data',
        variant: 'destructive',
      });
    } finally {
      setFetchingPolygon(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Card>
          <CardContent className="py-8 text-center">
            Loading...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8" />
          Admin Setup Utilities
        </h1>
        <p className="text-muted-foreground mt-1">
          Grant yourself admin access to view protected pages
        </p>
      </header>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Your User ID</CardTitle>
            <CardDescription>
              This is your unique identifier in the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-muted rounded-md text-sm font-mono break-all">
                {userId || 'Not logged in'}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={copyUserId}
                disabled={!userId}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admin Access</CardTitle>
            <CardDescription>
              Grant yourself admin privileges to access protected features
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAdmin ? (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  You already have admin access! Navigate to <a href="/backtesting" className="underline font-medium">/backtesting</a> to view the Sentiment Cohorts dashboard.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Click the button below to grant yourself admin role. This will allow you to access admin-only pages like the Sentiment Cohorts dashboard.
                </p>
                <Button 
                  onClick={grantAdminAccess}
                  disabled={granting || !userId}
                  className="w-full"
                >
                  {granting ? 'Granting Access...' : 'Grant Admin Access'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alternative: SQL Method</CardTitle>
            <CardDescription>
              If the button above doesn't work, use this SQL command
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Run this in the{' '}
              <a 
                href="https://supabase.com/dashboard/project/pdgjafywsxesgwukotxh/sql/new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Supabase SQL Editor
              </a>
              :
            </p>
            <pre className="p-3 bg-muted rounded-md text-xs font-mono overflow-x-auto">
{`INSERT INTO user_roles (user_id, role) 
VALUES ('${userId || 'your-user-id'}', 'admin');`}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Polygon Market Data
            </CardTitle>
            <CardDescription>
              Manually fetch latest market data for all active symbols
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will fetch current price data from Polygon.io for all active symbols in your ticker universe. 
              The function respects Polygon's free tier rate limits (5 requests/minute).
            </p>
            <Button 
              onClick={fetchPolygonData}
              disabled={fetchingPolygon}
              className="w-full"
            >
              {fetchingPolygon ? 'Fetching Data...' : 'Fetch Polygon Data'}
            </Button>
            <Alert>
              <AlertDescription className="text-xs">
                <strong>Note:</strong> For automatic daily updates, set up a cron job to call the <code>polygon-market-data-scheduler</code> edge function at market close (4:30 PM ET).
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminUtilities;
