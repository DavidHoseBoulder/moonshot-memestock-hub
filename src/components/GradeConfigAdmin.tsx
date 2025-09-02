import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Plus, Edit, Save, X, Settings, Info } from 'lucide-react';
import { format } from 'date-fns';

// Types
interface GradeConfig {
  model_version: string;
  horizon: string;
  side: string;
  require_pos_avg: boolean;
  strong_sharpe: number;
  strong_trades: number;
  moderate_sharpe: number;
  moderate_trades: number;
  min_win_rate?: number;
  strong_min_avg_ret?: number;
  created_at: string;
  updated_at: string;
}

interface NewConfigForm {
  model_version: string;
  horizon: string;
  side: string;
  require_pos_avg: boolean;
  strong_sharpe: number;
  strong_trades: number;
  moderate_sharpe: number;
  moderate_trades: number;
  min_win_rate?: number;
  strong_min_avg_ret?: number;
}

const GradeConfigAdmin: React.FC = () => {
  const [configs, setConfigs] = useState<GradeConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editedData, setEditedData] = useState<Partial<GradeConfig>>({});
  const [newConfigDialogOpen, setNewConfigDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { toast } = useToast();

  // Default new config form
  const defaultNewConfig: NewConfigForm = {
    model_version: 'gpt-sent-v1',
    horizon: '5d',
    side: 'LONG',
    require_pos_avg: true,
    strong_sharpe: 2.0,
    strong_trades: 10,
    moderate_sharpe: 1.0,
    moderate_trades: 5,
  };

  const [newConfig, setNewConfig] = useState<NewConfigForm>(defaultNewConfig);

  const fetchConfigs = async () => {
    setIsLoading(true);
    try {
      // Use direct fetch to avoid TypeScript complexity
      const response = await fetch(`https://pdgjafywsxesgwukotxh.supabase.co/rest/v1/sentiment_grade_config?order=model_version.asc,horizon.asc,side.asc&select=*`, {
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch configurations');
      
      const data = await response.json();
      setConfigs(data || []);
    } catch (error: any) {
      console.error('Error fetching grade configs:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch grade configurations',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const upsertConfig = async (configData: Partial<GradeConfig>) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`https://pdgjafywsxesgwukotxh.supabase.co/rest/v1/sentiment_grade_config`, {
        method: 'POST',
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw',
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          model_version: configData.model_version,
          horizon: configData.horizon,
          side: configData.side,
          require_pos_avg: configData.require_pos_avg,
          strong_sharpe: configData.strong_sharpe,
          strong_trades: configData.strong_trades,
          moderate_sharpe: configData.moderate_sharpe,
          moderate_trades: configData.moderate_trades,
          min_win_rate: configData.min_win_rate || null,
          strong_min_avg_ret: configData.strong_min_avg_ret || null,
          updated_at: new Date().toISOString(),
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to save configuration');
      }

      toast({
        title: 'Success',
        description: 'Grade configuration saved successfully',
      });

      await fetchConfigs();
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save configuration',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteConfig = async (model_version: string, horizon: string, side: string) => {
    try {
      const response = await fetch(`https://pdgjafywsxesgwukotxh.supabase.co/rest/v1/sentiment_grade_config?model_version=eq.${encodeURIComponent(model_version)}&horizon=eq.${encodeURIComponent(horizon)}&side=eq.${encodeURIComponent(side)}`, {
        method: 'DELETE',
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZ2phZnl3c3hlc2d3dWtvdHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MTU3NDMsImV4cCI6MjA2OTk5MTc0M30.41ABGjZKbgivTTlkHT2V-hJ6otFLz15dQgmsmz9ruQw',
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to delete configuration');
      }

      toast({
        title: 'Success',
        description: 'Configuration deleted successfully',
      });

      await fetchConfigs();
    } catch (error: any) {
      console.error('Error deleting config:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete configuration',
        variant: 'destructive',
      });
    }
  };

  const startEditing = (config: GradeConfig) => {
    const key = `${config.model_version}-${config.horizon}-${config.side}`;
    setEditingRow(key);
    setEditedData({ ...config });
  };

  const cancelEditing = () => {
    setEditingRow(null);
    setEditedData({});
  };

  const saveEditing = async () => {
    if (editedData) {
      await upsertConfig(editedData);
      setEditingRow(null);
      setEditedData({});
    }
  };

  const addNewConfig = async () => {
    await upsertConfig(newConfig);
    setNewConfig(defaultNewConfig);
    setNewConfigDialogOpen(false);
  };

  const validateNumber = (value: string, min = 0, max?: number): number | undefined => {
    const num = parseFloat(value);
    if (isNaN(num) || num < min || (max !== undefined && num > max)) return undefined;
    return num;
  };

  const isWildcard = (value: string) => value === '*';

  useEffect(() => {
    fetchConfigs();
  }, []);

  const getRowKey = (config: GradeConfig) => `${config.model_version}-${config.horizon}-${config.side}`;

  const renderEditableCell = (
    config: GradeConfig,
    field: keyof GradeConfig,
    type: 'text' | 'number' | 'boolean' | 'select' = 'text',
    options?: string[]
  ) => {
    const rowKey = getRowKey(config);
    const isEditing = editingRow === rowKey;
    const value = isEditing ? editedData[field] : config[field];

    if (!isEditing) {
      if (type === 'boolean') {
        return <Badge variant={value ? 'default' : 'secondary'}>{value ? 'Yes' : 'No'}</Badge>;
      }
      if (field === 'min_win_rate' && typeof value === 'number') {
        return <span>{(value * 100).toFixed(1)}%</span>;
      }
      if (field === 'strong_min_avg_ret' && typeof value === 'number') {
        return <span>{(value * 100).toFixed(2)}%</span>;
      }
      return <span>{value?.toString() || '-'}</span>;
    }

    if (type === 'boolean') {
      return (
        <Switch
          checked={!!value}
          onCheckedChange={(checked) => setEditedData(prev => ({ ...prev, [field]: checked }))}
        />
      );
    }

    if (type === 'select' && options) {
      return (
        <Select
          value={value?.toString() || ''}
          onValueChange={(val) => setEditedData(prev => ({ ...prev, [field]: val }))}
        >
          <SelectTrigger className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(option => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <Input
        type={type}
        value={value?.toString() || ''}
        onChange={(e) => {
          let newValue: any = e.target.value;
          if (type === 'number') {
            newValue = parseFloat(e.target.value) || 0;
          }
          setEditedData(prev => ({ ...prev, [field]: newValue }));
        }}
        className="w-20"
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center text-foreground">
            ⚙️ Grade Config (Admin)
            <Settings className="w-6 h-6 ml-3 text-accent" />
          </h2>
          <p className="text-muted-foreground">
            Manage sentiment grading thresholds and criteria
          </p>
        </div>
        <Dialog open={newConfigDialogOpen} onOpenChange={setNewConfigDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Config
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Grade Configuration</DialogTitle>
              <DialogDescription>
                Create a new grading configuration. Use * for wildcards in horizon or side.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Model Version</Label>
                  <Input
                    value={newConfig.model_version}
                    onChange={(e) => setNewConfig(prev => ({ ...prev, model_version: e.target.value }))}
                    placeholder="gpt-sent-v1"
                  />
                </div>
                <div>
                  <Label>Horizon</Label>
                  <Select
                    value={newConfig.horizon}
                    onValueChange={(value) => setNewConfig(prev => ({ ...prev, horizon: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1d">1d</SelectItem>
                      <SelectItem value="3d">3d</SelectItem>
                      <SelectItem value="5d">5d</SelectItem>
                      <SelectItem value="*">* (All)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Side</Label>
                  <Select
                    value={newConfig.side}
                    onValueChange={(value) => setNewConfig(prev => ({ ...prev, side: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LONG">LONG</SelectItem>
                      <SelectItem value="SHORT">SHORT</SelectItem>
                      <SelectItem value="*">* (Both)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={newConfig.require_pos_avg}
                  onCheckedChange={(checked) => setNewConfig(prev => ({ ...prev, require_pos_avg: checked }))}
                />
                <Label>Require Positive Average Return</Label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Strong Sharpe</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={newConfig.strong_sharpe}
                    onChange={(e) => setNewConfig(prev => ({ ...prev, strong_sharpe: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <Label>Strong Trades</Label>
                  <Input
                    type="number"
                    value={newConfig.strong_trades}
                    onChange={(e) => setNewConfig(prev => ({ ...prev, strong_trades: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Moderate Sharpe</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={newConfig.moderate_sharpe}
                    onChange={(e) => setNewConfig(prev => ({ ...prev, moderate_sharpe: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <Label>Moderate Trades</Label>
                  <Input
                    type="number"
                    value={newConfig.moderate_trades}
                    onChange={(e) => setNewConfig(prev => ({ ...prev, moderate_trades: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Min Win Rate (optional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={newConfig.min_win_rate || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setNewConfig(prev => ({ 
                        ...prev, 
                        min_win_rate: isNaN(val) ? undefined : Math.max(0, Math.min(1, val))
                      }));
                    }}
                    placeholder="0.50"
                  />
                </div>
                <div>
                  <Label>Strong Min Avg Ret (optional)</Label>
                  <Input
                    type="number"
                    step="0.001"
                    value={newConfig.strong_min_avg_ret || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setNewConfig(prev => ({ 
                        ...prev, 
                        strong_min_avg_ret: isNaN(val) ? undefined : val
                      }));
                    }}
                    placeholder="0.005"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="outline" onClick={() => setNewConfigDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={addNewConfig} disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Config'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            Grading Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <div><strong>Strong:</strong> Sharpe ≥ strong_sharpe AND Trades ≥ strong_trades AND (require_pos_avg ? avg_ret {"> 0"} : true)</div>
          <div><strong>Moderate:</strong> Sharpe ≥ moderate_sharpe AND Trades ≥ moderate_trades AND (require_pos_avg ? avg_ret {"> 0"} : true)</div>
          <div><strong>Wildcards:</strong> Use * for horizon and/or side to create default fallback configurations</div>
        </CardContent>
      </Card>

      {/* Configurations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Current Configurations</CardTitle>
          <CardDescription>
            {configs.length} configuration{configs.length !== 1 ? 's' : ''} defined
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading configurations...</div>
          ) : configs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No configurations found. Add your first configuration above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Horizon</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Req+Avg</TableHead>
                    <TableHead>Strong Sharpe</TableHead>
                    <TableHead>Strong Trades</TableHead>
                    <TableHead>Mod Sharpe</TableHead>
                    <TableHead>Mod Trades</TableHead>
                    <TableHead>Min Win%</TableHead>
                    <TableHead>Strong Min Ret%</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.map((config) => {
                    const rowKey = getRowKey(config);
                    const isEditing = editingRow === rowKey;
                    
                    return (
                      <TableRow key={rowKey}>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isWildcard(config.model_version) && <Badge variant="outline" className="text-xs">*</Badge>}
                            <span className="font-mono text-sm">{config.model_version}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isWildcard(config.horizon) && <Badge variant="outline" className="text-xs">*</Badge>}
                            {renderEditableCell(config, 'horizon', 'select', ['1d', '3d', '5d', '*'])}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isWildcard(config.side) && <Badge variant="outline" className="text-xs">*</Badge>}
                            {renderEditableCell(config, 'side', 'select', ['LONG', 'SHORT', '*'])}
                          </div>
                        </TableCell>
                        <TableCell>{renderEditableCell(config, 'require_pos_avg', 'boolean')}</TableCell>
                        <TableCell>{renderEditableCell(config, 'strong_sharpe', 'number')}</TableCell>
                        <TableCell>{renderEditableCell(config, 'strong_trades', 'number')}</TableCell>
                        <TableCell>{renderEditableCell(config, 'moderate_sharpe', 'number')}</TableCell>
                        <TableCell>{renderEditableCell(config, 'moderate_trades', 'number')}</TableCell>
                        <TableCell>{renderEditableCell(config, 'min_win_rate', 'number')}</TableCell>
                        <TableCell>{renderEditableCell(config, 'strong_min_avg_ret', 'number')}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(config.updated_at), 'MM/dd HH:mm')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isEditing ? (
                              <>
                                <Button size="sm" variant="ghost" onClick={saveEditing} disabled={isSubmitting}>
                                  <Save className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={cancelEditing}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="ghost" onClick={() => startEditing(config)}>
                                  <Edit className="w-3 h-3" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="sm" variant="ghost">
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Configuration</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete the configuration for {config.model_version} / {config.horizon} / {config.side}? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteConfig(config.model_version, config.horizon, config.side)}
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GradeConfigAdmin;