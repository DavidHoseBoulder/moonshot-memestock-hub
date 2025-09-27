import BulkHistoricalImport from "@/components/BulkHistoricalImport";
import RedditBackfillImport from "@/components/RedditBackfillImport";
import PolygonRealTimeImport from "@/components/PolygonRealTimeImport";
import StockTwitsImport from "@/components/StockTwitsImport";

const BulkImport = () => {
  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold">Bulk Data Import</h2>
          <p className="text-muted-foreground">Import historical market and sentiment data for backtesting and analysis</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Market Data Column */}
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-semibold mb-2">Market Data</h3>
              <p className="text-muted-foreground text-sm">Historical price data and real-time market information</p>
            </div>
            <div className="space-y-6">
              <BulkHistoricalImport />
              <PolygonRealTimeImport />
            </div>
          </div>

          {/* Sentiment Data Column */}
          <div className="space-y-6">
            <div>
              <h3 className="text-2xl font-semibold mb-2">Sentiment Data</h3>
              <p className="text-muted-foreground text-sm">Social media sentiment and discussion data</p>
            </div>
            <div className="space-y-6">
              <StockTwitsImport />
              <RedditBackfillImport />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkImport;
