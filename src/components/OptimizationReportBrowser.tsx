
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Calendar, TrendingUp } from "lucide-react";

interface ReportFile {
  name: string;
  symbol: string;
  timestamp: string;
  type: string;
  size?: string;
}

interface OptimizationReportBrowserProps {
  onFileSelect: (filename: string) => void;
  selectedFile?: string;
}

const OptimizationReportBrowser = ({ onFileSelect, selectedFile }: OptimizationReportBrowserProps) => {
  const [reportFiles, setReportFiles] = useState<ReportFile[]>([]);

  useEffect(() => {
    // In a real implementation, this would fetch from GitHub API or your backend
    // For now, we'll simulate the files based on what we know exists
    const mockFiles: ReportFile[] = [
      {
        name: "BB-enhanced-optimization-1754516167667.json",
        symbol: "BB",
        timestamp: "2025-01-07T02:42:47.667Z",
        type: "enhanced",
        size: "15.2 KB"
      },
      {
        name: "TSLA-optimization-1754514126355.json", 
        symbol: "TSLA",
        timestamp: "2025-01-07T02:08:46.355Z",
        type: "standard",
        size: "12.8 KB"
      }
    ];

    // Sort by timestamp (most recent first)
    const sortedFiles = mockFiles.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    setReportFiles(sortedFiles);
  }, []);

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const getTypeColor = (type: string) => {
    return type === "enhanced" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800";
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Optimization Reports</h3>
          <Badge variant="secondary">{reportFiles.length} files</Badge>
        </div>
      </div>

      {reportFiles.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reportFiles.map((file) => (
              <TableRow 
                key={file.name}
                className={selectedFile === file.name ? "bg-muted/50" : ""}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span>{file.symbol}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={getTypeColor(file.type)}>
                    {file.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-1">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    <span className="text-sm">{formatDate(file.timestamp)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {file.size}
                </TableCell>
                <TableCell>
                  <Button
                    variant={selectedFile === file.name ? "default" : "outline"}
                    size="sm"
                    onClick={() => onFileSelect(file.name)}
                  >
                    {selectedFile === file.name ? "Selected" : "View"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No optimization reports found.</p>
          <p className="text-sm">Run a parameter optimization to generate reports.</p>
        </div>
      )}
    </Card>
  );
};

export default OptimizationReportBrowser;
