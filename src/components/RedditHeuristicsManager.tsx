import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, Edit2, Check, X } from 'lucide-react';

interface RedditHeuristics {
  id: number;
  model_version: string | null;
  effective_at: string;
  is_active: boolean;
  z_score: number;
  weight_strength: number;
  weight_sample: number;
  weight_recency: number;
  weight_win_ci: number;
  sample_cap_trades: number;
  recency_break_1_days: number;
  recency_break_2_days: number;
  recency_score_fresh: number;
  recency_score_ok: number;
  recency_score_stale: number;
  min_confidence_score: number;
  min_trades: number;
}

const RedditHeuristicsManager = () => {
  const [heuristics, setHeuristics] = useState<RedditHeuristics[]>([]);
  const [activeConfig, setActiveConfig] = useState<RedditHeuristics | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Form state for editing
  const [formData, setFormData] = useState<Partial<RedditHeuristics>>({});

  useEffect(() => {
    fetchHeuristics();
  }, []);

  const fetchHeuristics = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('reddit_heuristics' as any)
        .select('*')
        .order('effective_at', { ascending: false });

      if (error) throw error;

      const heuristicsData = (data as unknown as RedditHeuristics[]) || [];
      setHeuristics(heuristicsData);
      
      // Find the active config
      const active = heuristicsData.find(h => h.is_active);
      if (active) {
        setActiveConfig(active);
        setFormData(active);
      }
    } catch (error) {
      console.error('Error fetching heuristics:', error);
      toast({
        title: "Error",
        description: "Failed to load heuristics configuration",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.model_version) {
      toast({
        title: "Error",
        description: "Model version is required",
        variant: "destructive",
      });
      return;
    }

    // Validate weights sum to 1
    const weightSum = (formData.weight_strength || 0) + 
                      (formData.weight_sample || 0) + 
                      (formData.weight_recency || 0) + 
                      (formData.weight_win_ci || 0);
    
    if (Math.abs(weightSum - 1.0) > 0.01) {
      toast({
        title: "Error",
        description: "Weights must sum to 1.0",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSaving(true);
      
      // Deactivate current active config
      if (activeConfig) {
        await supabase
          .from('reddit_heuristics' as any)
          .update({ is_active: false })
          .eq('id', activeConfig.id);
      }

      // Insert new config
      const { error } = await supabase
        .from('reddit_heuristics' as any)
        .insert([{
          ...formData,
          is_active: true,
          effective_at: new Date().toISOString()
        }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Heuristics configuration saved successfully",
      });

      setEditMode(false);
      await fetchHeuristics();
    } catch (error) {
      console.error('Error saving heuristics:', error);
      toast({
        title: "Error",
        description: "Failed to save heuristics configuration",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (activeConfig) {
      setFormData(activeConfig);
    }
    setEditMode(false);
  };

  const startEdit = () => {
    if (activeConfig) {
      setFormData({ ...activeConfig });
    } else {
      // Default values for new config
      setFormData({
        model_version: 'gpt-sent-v1',
        z_score: 1.96,
        weight_strength: 0.40,
        weight_sample: 0.30,
        weight_recency: 0.20,
        weight_win_ci: 0.10,
        sample_cap_trades: 20,
        recency_break_1_days: 30,
        recency_break_2_days: 90,
        recency_score_fresh: 1.0,
        recency_score_ok: 0.7,
        recency_score_stale: 0.4,
        min_confidence_score: 60,
        min_trades: 5,
      });
    }
    setEditMode(true);
  };

  const updateFormData = (field: keyof RedditHeuristics, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Reddit Heuristics Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">Loading configuration...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Active Configuration */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Active Configuration
          </CardTitle>
          {!editMode && (
            <Button onClick={startEdit} variant="outline" size="sm">
              <Edit2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {!editMode && activeConfig ? (
            // Display mode
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium">Model Version</Label>
                <div className="text-lg">{activeConfig.model_version}</div>
              </div>
              <div>
                <Label className="text-sm font-medium">Min Confidence</Label>
                <div className="text-lg">{activeConfig.min_confidence_score}%</div>
              </div>
              <div>
                <Label className="text-sm font-medium">Min Trades</Label>
                <div className="text-lg">{activeConfig.min_trades}</div>
              </div>
              <div>
                <Label className="text-sm font-medium">Z-Score</Label>
                <div className="text-lg">{activeConfig.z_score}</div>
              </div>
              <div>
                <Label className="text-sm font-medium">Sample Cap</Label>
                <div className="text-lg">{activeConfig.sample_cap_trades} trades</div>
              </div>
              <div>
                <Label className="text-sm font-medium">Effective Since</Label>
                <div className="text-sm text-muted-foreground">
                  {new Date(activeConfig.effective_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ) : (
            // Edit mode
            <div className="space-y-6">
              {/* Basic Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="model_version">Model Version</Label>
                  <Input
                    id="model_version"
                    value={formData.model_version || ''}
                    onChange={(e) => updateFormData('model_version', e.target.value)}
                    placeholder="e.g., gpt-sent-v1"
                  />
                </div>
                <div>
                  <Label htmlFor="min_confidence">Min Confidence Score (%)</Label>
                  <Input
                    id="min_confidence"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.min_confidence_score || 60}
                    onChange={(e) => updateFormData('min_confidence_score', parseInt(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="min_trades">Min Trades</Label>
                  <Input
                    id="min_trades"
                    type="number"
                    min="1"
                    value={formData.min_trades || 5}
                    onChange={(e) => updateFormData('min_trades', parseInt(e.target.value))}
                  />
                </div>
              </div>

              {/* Confidence Score Weights */}
              <div>
                <Label className="text-base font-semibold">Confidence Score Weights (must sum to 1.0)</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div>
                    <Label className="text-sm">Strength Weight: {formData.weight_strength?.toFixed(2) || '0.40'}</Label>
                    <Slider
                      value={[formData.weight_strength || 0.40]}
                      onValueChange={([value]) => updateFormData('weight_strength', value)}
                      max={1}
                      min={0}
                      step={0.01}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Sample Weight: {formData.weight_sample?.toFixed(2) || '0.30'}</Label>
                    <Slider
                      value={[formData.weight_sample || 0.30]}
                      onValueChange={([value]) => updateFormData('weight_sample', value)}
                      max={1}
                      min={0}
                      step={0.01}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Recency Weight: {formData.weight_recency?.toFixed(2) || '0.20'}</Label>
                    <Slider
                      value={[formData.weight_recency || 0.20]}
                      onValueChange={([value]) => updateFormData('weight_recency', value)}
                      max={1}
                      min={0}
                      step={0.01}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Win CI Weight: {formData.weight_win_ci?.toFixed(2) || '0.10'}</Label>
                    <Slider
                      value={[formData.weight_win_ci || 0.10]}
                      onValueChange={([value]) => updateFormData('weight_win_ci', value)}
                      max={1}
                      min={0}
                      step={0.01}
                      className="mt-2"
                    />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  Current sum: {((formData.weight_strength || 0) + (formData.weight_sample || 0) + (formData.weight_recency || 0) + (formData.weight_win_ci || 0)).toFixed(2)}
                </div>
              </div>

              {/* Advanced Settings */}
              <div>
                <Label className="text-base font-semibold">Advanced Settings</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                  <div>
                    <Label htmlFor="z_score">Z-Score</Label>
                    <Input
                      id="z_score"
                      type="number"
                      step="0.01"
                      value={formData.z_score || 1.96}
                      onChange={(e) => updateFormData('z_score', parseFloat(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="sample_cap">Sample Cap (trades)</Label>
                    <Input
                      id="sample_cap"
                      type="number"
                      min="1"
                      value={formData.sample_cap_trades || 20}
                      onChange={(e) => updateFormData('sample_cap_trades', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="recency_break_1">Fresh Recency (days)</Label>
                    <Input
                      id="recency_break_1"
                      type="number"
                      min="1"
                      value={formData.recency_break_1_days || 30}
                      onChange={(e) => updateFormData('recency_break_1_days', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="recency_break_2">Stale Recency (days)</Label>
                    <Input
                      id="recency_break_2"
                      type="number"
                      min="1"
                      value={formData.recency_break_2_days || 90}
                      onChange={(e) => updateFormData('recency_break_2_days', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="recency_fresh">Fresh Score</Label>
                    <Input
                      id="recency_fresh"
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={formData.recency_score_fresh || 1.0}
                      onChange={(e) => updateFormData('recency_score_fresh', parseFloat(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="recency_ok">OK Score</Label>
                    <Input
                      id="recency_ok"
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={formData.recency_score_ok || 0.7}
                      onChange={(e) => updateFormData('recency_score_ok', parseFloat(e.target.value))}
                    />
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button onClick={handleCancel} variant="outline">
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <>Saving...</>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-1" />
                      Save Configuration
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historical Configurations */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {heuristics.map((config) => (
              <div
                key={config.id}
                className={`p-4 border rounded-lg ${config.is_active ? 'border-primary bg-primary/5' : 'border-border'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Badge variant={config.is_active ? 'default' : 'secondary'}>
                      {config.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="font-medium">{config.model_version}</span>
                    <span className="text-sm text-muted-foreground">
                      Confidence: {config.min_confidence_score}% | Trades: {config.min_trades}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(config.effective_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RedditHeuristicsManager;