import BulkHistoricalImport from "@/components/BulkHistoricalImport";
import ImportProgressMonitor from "@/components/ImportProgressMonitor";
import RedditBackfillImport from "@/components/RedditBackfillImport";
import PolygonRealTimeImport from "@/components/PolygonRealTimeImport";

const BulkImport = () => {
  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold">Bulk Historical Data Import</h2>
          <p className="text-muted-foreground">Import historical market and sentiment data for backtesting and analysis</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
          <BulkHistoricalImport />
          <PolygonRealTimeImport />
          <ImportProgressMonitor />
          <RedditBackfillImport />
        </div>
      </div>
    </div>
  );
};

export default BulkImport;
