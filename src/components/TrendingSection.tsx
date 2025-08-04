import StockCard from "./StockCard";

const mockTrendingStocks = [
  {
    symbol: "GME",
    name: "GameStop Corp.",
    price: 23.45,
    change: 2.34,
    changePercent: 11.08,
    volume: "45.2M",
    marketCap: "7.1B",
    trending: true
  },
  {
    symbol: "AMC",
    name: "AMC Entertainment Holdings",
    price: 8.92,
    change: 0.67,
    changePercent: 8.13,
    volume: "23.8M",
    marketCap: "4.6B",
    trending: true
  },
  {
    symbol: "BB",
    name: "BlackBerry Limited",
    price: 4.76,
    change: -0.23,
    changePercent: -4.61,
    volume: "12.1M",
    marketCap: "2.7B",
    trending: true
  }
];

const mockCrypto = [
  {
    symbol: "DOGE",
    name: "Dogecoin",
    price: 0.087,
    change: 0.012,
    changePercent: 16.00,
    volume: "890M",
    marketCap: "12.4B",
    trending: true
  },
  {
    symbol: "SHIB",
    name: "Shiba Inu",
    price: 0.0000089,
    change: 0.0000007,
    changePercent: 8.54,
    volume: "156M",
    marketCap: "5.2B",
    trending: true
  },
  {
    symbol: "PEPE",
    name: "Pepe",
    price: 0.000012,
    change: 0.000003,
    changePercent: 33.33,
    volume: "67M",
    marketCap: "504M",
    trending: true
  }
];

const TrendingSection = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center">
          🚀 Trending Meme Stocks
          <span className="ml-3 text-sm bg-accent/20 text-accent px-3 py-1 rounded-full">Hot</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mockTrendingStocks.map((stock) => (
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
          {mockCrypto.map((crypto) => (
            <StockCard key={crypto.symbol} {...crypto} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrendingSection;