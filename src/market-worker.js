// Shared Web Worker for WebSocket connection
let ws = null;
let ports = new Map(); // Map of port -> { id, lastPong }
let reconnectTimeout = null;
let lastInitialData = null; // Store the initial data for new connections
let nextPortId = 1;
let heartbeatInterval = null;

// Batching mechanism to prevent overloading the grid
let pendingUpdates = new Map(); // Map of symbol -> latest update
let batchTimer = null;
const BATCH_INTERVAL = 1000 / 60; // ~16.67ms for 60fps

function flushBatch() {
  if (pendingUpdates.size === 0) return;

  const batchedData = Array.from(pendingUpdates.values());
  broadcast({
    type: "update",
    data: batchedData,
    timestamp: Date.now(),
  });

  pendingUpdates.clear();
  batchTimer = null;
}

function scheduleBatch() {
  if (batchTimer !== null) return; // Already scheduled
  batchTimer = setTimeout(flushBatch, BATCH_INTERVAL);
}

function connect() {
  ws = new WebSocket("ws://localhost:8080");

  ws.onopen = () => {
    console.log("[Worker] Connected to WebSocket server");
    broadcast({ type: "connected" });
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    // Store initial data for new connections
    if (message.type === "initial") {
      lastInitialData = message;
      broadcast(message);
    } else if (message.type === "update") {
      // Batch updates instead of broadcasting immediately
      message.data.forEach((row) => {
        pendingUpdates.set(row.symbol, row);
      });
      scheduleBatch();
    } else {
      broadcast(message);
    }
  };

  ws.onclose = () => {
    console.log("[Worker] Disconnected from WebSocket server");
    broadcast({ type: "disconnected" });

    // Flush any pending updates before closing
    if (batchTimer) {
      clearTimeout(batchTimer);
      flushBatch();
    }

    // Only attempt to reconnect if there are active ports
    if (ports.size > 0) {
      reconnectTimeout = setTimeout(() => {
        console.log("[Worker] Attempting to reconnect...");
        connect();
      }, 2000);
    } else {
      console.log("[Worker] No active ports, not reconnecting");
      ws = null;
    }
  };

  ws.onerror = (error) => {
    console.error("[Worker] WebSocket error:", error);
  };
}

function broadcast(message) {
  for (const [port] of ports.entries()) {
    port.postMessage(message);
  }
}

function removePort(port) {
  if (ports.has(port)) {
    const portInfo = ports.get(port);
    ports.delete(port);
    console.log(`[Worker] Port ${portInfo.id} removed. Total ports: ${ports.size}`);
    checkCleanup();
  }
}

function checkCleanup() {
  // If no more ports, close WebSocket and cleanup
  if (ports.size === 0) {
    console.log("[Worker] No more ports, closing WebSocket");
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
  }
}

function checkHeartbeats() {
  const now = Date.now();
  const HEARTBEAT_TIMEOUT = 30000; // 30 seconds - generous timeout for background tabs

  for (const [port, portInfo] of ports.entries()) {
    if (now - portInfo.lastPong > HEARTBEAT_TIMEOUT) {
      console.log(`[Worker] Port ${portInfo.id} heartbeat timeout (${now - portInfo.lastPong}ms), removing`);
      removePort(port);
    }
  }
}

function sendHeartbeats() {
  for (const [port, portInfo] of ports.entries()) {
    try {
      port.postMessage({ type: "ping" });
    } catch (e) {
      console.error(`[Worker] Error sending ping to port ${portInfo.id}:`, e);
      removePort(port);
    }
  }
}

function startHeartbeatMonitoring() {
  if (heartbeatInterval) return;
  // Send pings every 10 seconds, timeout after 30 seconds
  heartbeatInterval = setInterval(() => {
    sendHeartbeats();
    checkHeartbeats();
  }, 10000);
}

// Handle new connections from browser tabs
self.onconnect = (e) => {
  const port = e.ports[0];
  const portId = nextPortId++;

  ports.set(port, { id: portId, lastPong: Date.now() });

  console.log(`[Worker] Port ${portId} connected. Total ports: ${ports.size}`);

  port.onmessage = (event) => {
    const portInfo = ports.get(port);
    if (!portInfo) return;

    if (event.data.type === "pong") {
      portInfo.lastPong = Date.now();
      console.log(`[Worker] Port ${portInfo.id} pong received`);
    } else if (event.data.type === "disconnect") {
      console.log(`[Worker] Port ${portInfo.id} explicit disconnect`);
      removePort(port);
    } else if (event.data.type === "setFrequency") {
      const frequency = event.data.frequency;
      console.log(`[Worker] Setting update frequency to ${frequency}ms`);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "setFrequency", frequency }));
      }
      // Broadcast frequency change to all other ports
      for (const [p, info] of ports.entries()) {
        if (p !== port) {
          p.postMessage({ type: "frequencyChanged", frequency });
        }
      }
    } else if (event.data.type === "setBatchSize") {
      const { min, max } = event.data;
      console.log(`[Worker] Setting batch size to ${min}-${max}`);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "setBatchSize", min, max }));
      }
      // Broadcast batch size change to all other ports
      for (const [p, info] of ports.entries()) {
        if (p !== port) {
          p.postMessage({ type: "batchSizeChanged", min, max });
        }
      }
    }
  };

  port.start();

  // If no WebSocket connection exists, establish it
  if (!ws) {
    connect();
    startHeartbeatMonitoring();
  } else {
    // Send stored initial data to new port if available
    if (lastInitialData) {
      port.postMessage(lastInitialData);
    }

    // Notify new port of current connection status
    port.postMessage({
      type:
        ws && ws.readyState === WebSocket.OPEN ? "connected" : "disconnected",
    });
  }
};
