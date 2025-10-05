import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

// Generate 150 instruments
const instruments = [];
const baseSymbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'META', 'NVDA', 'AMD', 'NFLX', 'INTC'];
for (let i = 0; i < 150; i++) {
  if (i < baseSymbols.length) {
    instruments.push(baseSymbols[i]);
  } else {
    instruments.push(`SYM${i.toString().padStart(3, '0')}`);
  }
}

// Initialize mock data with 100+ fields
const marketData = {};
instruments.forEach(symbol => {
  const data = {
    symbol,
    price: 100 + Math.random() * 400,
    bid: 0,
    ask: 0,
    volume: Math.floor(Math.random() * 1000000),
    change: 0,
    changePercent: 0,
  };

  // Add 100 additional metric fields
  for (let i = 1; i <= 100; i++) {
    data[`metric${i}`] = Math.random() * 1000;
  }

  data.bid = data.price - Math.random() * 0.5;
  data.ask = data.price + Math.random() * 0.5;
  marketData[symbol] = data;
});

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send initial data
  ws.send(JSON.stringify({
    type: 'initial',
    data: Object.values(marketData)
  }));

  // Send random bursts of updates at high frequency with delta updates
  const sendUpdates = () => {
    const batchSize = Math.floor(Math.random() * 20) + 10; // 10-30 updates per batch
    const updates = [];

    for (let i = 0; i < batchSize; i++) {
      const symbol = instruments[Math.floor(Math.random() * instruments.length)];
      const data = marketData[symbol];

      // Build delta update with only changed fields
      const delta = { symbol };

      // Random price change
      const oldPrice = data.price;
      const change = (Math.random() - 0.5) * 5;
      data.price += change;
      data.bid = data.price - Math.random() * 0.5;
      data.ask = data.price + Math.random() * 0.5;
      data.volume += Math.floor(Math.random() * 10000);
      data.change = data.price - oldPrice;
      data.changePercent = (data.change / oldPrice) * 100;

      // Add changed price fields to delta
      delta.price = data.price;
      delta.bid = data.bid;
      delta.ask = data.ask;
      delta.volume = data.volume;
      delta.change = data.change;
      delta.changePercent = data.changePercent;

      // Update random metrics (only send changed ones)
      const metricsToUpdate = Math.floor(Math.random() * 20) + 10;
      for (let j = 0; j < metricsToUpdate; j++) {
        const metricNum = Math.floor(Math.random() * 100) + 1;
        const metricKey = `metric${metricNum}`;
        data[metricKey] = Math.random() * 1000;
        delta[metricKey] = data[metricKey];
      }

      updates.push(delta);
    }

    ws.send(JSON.stringify({
      type: 'update',
      data: updates,
      timestamp: Date.now()
    }));

    // Schedule next burst with very short interval (5-20ms) to stress test batching
    const nextInterval = Math.floor(Math.random() * 15) + 5;
    setTimeout(sendUpdates, nextInterval);
  };

  // Start sending updates after a short delay
  setTimeout(sendUpdates, 100);

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

console.log('WebSocket server running on ws://localhost:8080');
