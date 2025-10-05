// Shared Web Worker for WebSocket connection
let ws = null;
let ports = [];
let reconnectTimeout = null;
let lastInitialData = null; // Store the initial data for new connections

// Batching mechanism to prevent overloading the grid
let pendingUpdates = new Map(); // Map of symbol -> latest update
let batchTimer = null;
const BATCH_INTERVAL = 1000 / 60; // ~16.67ms for 60fps

function flushBatch() {
  if (pendingUpdates.size === 0) return;

  const batchedData = Array.from(pendingUpdates.values());
  broadcast({
    type: 'update',
    data: batchedData,
    timestamp: Date.now()
  });

  pendingUpdates.clear();
  batchTimer = null;
}

function scheduleBatch() {
  if (batchTimer !== null) return; // Already scheduled
  batchTimer = setTimeout(flushBatch, BATCH_INTERVAL);
}

function connect() {
  ws = new WebSocket('ws://localhost:8080');

  ws.onopen = () => {
    console.log('[Worker] Connected to WebSocket server');
    broadcast({ type: 'connected' });
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    // Store initial data for new connections
    if (message.type === 'initial') {
      lastInitialData = message;
      broadcast(message);
    } else if (message.type === 'update') {
      // Batch updates instead of broadcasting immediately
      message.data.forEach(row => {
        pendingUpdates.set(row.symbol, row);
      });
      scheduleBatch();
    } else {
      broadcast(message);
    }
  };

  ws.onclose = () => {
    console.log('[Worker] Disconnected from WebSocket server');
    broadcast({ type: 'disconnected' });

    // Flush any pending updates before closing
    if (batchTimer) {
      clearTimeout(batchTimer);
      flushBatch();
    }

    // Attempt to reconnect after 2 seconds
    reconnectTimeout = setTimeout(() => {
      console.log('[Worker] Attempting to reconnect...');
      connect();
    }, 2000);
  };

  ws.onerror = (error) => {
    console.error('[Worker] WebSocket error:', error);
  };
}

function broadcast(message, targetPort = null) {
  const targetPorts = targetPort ? [targetPort] : ports;
  targetPorts.forEach(port => {
    try {
      port.postMessage(message);
    } catch (e) {
      console.error('[Worker] Error sending message to port:', e);
    }
  });
}

// Handle new connections from browser tabs
self.onconnect = (e) => {
  const port = e.ports[0];
  ports.push(port);

  console.log('[Worker] New port connected. Total ports:', ports.length);

  port.onmessage = (event) => {
    if (event.data.type === 'ping') {
      port.postMessage({ type: 'pong' });
    }
  };

  // If this is the first connection, establish WebSocket
  if (ports.length === 1) {
    connect();
  } else {
    // Send stored initial data to new port if available
    if (lastInitialData) {
      port.postMessage(lastInitialData);
    }

    // Notify new port of current connection status
    port.postMessage({
      type: ws && ws.readyState === WebSocket.OPEN ? 'connected' : 'disconnected'
    });
  }

  // Handle port disconnection
  port.addEventListener('close', () => {
    const index = ports.indexOf(port);
    if (index > -1) {
      ports.splice(index, 1);
      console.log('[Worker] Port disconnected. Total ports:', ports.length);
    }

    // If no more ports, close WebSocket and cleanup
    if (ports.length === 0) {
      console.log('[Worker] No more ports, closing WebSocket');
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
    }
  });

  port.start();
};
