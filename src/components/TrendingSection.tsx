import StockCard from "./StockCard";

// Removed mock data - will fetch real trending data from APIs

const TrendingSection = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center">
          🚀 Trending Meme Stocks
          <span className="ml-3 text-sm bg-accent/20 text-accent px-3 py-1 rounded-full">Hot</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[].map((stock) => (
            <StockCard key={stock.symbol} {...stock} />
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center">
          🌙 Trending Crypto Memes
          <span className="ml-3 text-sm bg-primary/20 text-primary px-3 py-1 rounded-full">HODL</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[].map((crypto) => (
            <StockCard key={crypto.symbol} {...crypto} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrendingSection;