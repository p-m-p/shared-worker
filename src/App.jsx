import { useState, useEffect, useRef, useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community';
import { PriceCellRenderer } from './components/PriceCellRenderer';
import { ChangeCellRenderer } from './components/ChangeCellRenderer';
import { MetricCellRenderer } from './components/MetricCellRenderer';
import './style.css';

ModuleRegistry.registerModules([AllCommunityModule]);

// Performance tracking
const perfStats = {
  updateCount: 0,
  totalUpdateTime: 0,
  minUpdateTime: Infinity,
  maxUpdateTime: 0,
  lastSecondUpdates: 0,
};

export default function App() {
  const [rowData, setRowData] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const [perfMetrics, setPerfMetrics] = useState({
    avg: '0',
    min: '0',
    max: '0',
    fps: '0',
    total: '0'
  });

  const gridRef = useRef(null);
  const workerRef = useRef(null);
  const pendingUpdatesRef = useRef(new Map());
  const frameScheduledRef = useRef(false);

  // Column definitions with React cell renderers
  const columnDefs = useMemo(() => {
    const cols = [
      { field: 'symbol', headerName: 'Symbol', width: 100, pinned: 'left' },
      {
        field: 'price',
        headerName: 'Price',
        width: 120,
        cellRenderer: PriceCellRenderer,
      },
      {
        field: 'bid',
        headerName: 'Bid',
        width: 120,
        valueFormatter: params => '$' + params.value?.toFixed(2)
      },
      {
        field: 'ask',
        headerName: 'Ask',
        width: 120,
        valueFormatter: params => '$' + params.value?.toFixed(2)
      },
      {
        field: 'change',
        headerName: 'Change',
        width: 120,
        cellRenderer: ChangeCellRenderer,
      },
      {
        field: 'changePercent',
        headerName: 'Change %',
        width: 120,
        cellRenderer: (props) => {
          const val = props.value || 0;
          const className = val >= 0 ? 'change-positive' : 'change-negative';
          const formatted = (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
          return <div className={className}>{formatted}</div>;
        },
      },
      {
        field: 'volume',
        headerName: 'Volume',
        width: 140,
        valueFormatter: params => params.value?.toLocaleString()
      }
    ];

    // Add 100 metric columns with custom renderer
    for (let i = 1; i <= 100; i++) {
      cols.push({
        field: `metric${i}`,
        headerName: `Metric ${i}`,
        width: 120,
        cellRenderer: MetricCellRenderer,
      });
    }

    return cols;
  }, []);

  const gridOptions = useMemo(() => ({
    defaultColDef: {
      sortable: true,
      filter: true,
      resizable: true
    },
    theme: themeQuartz.withParams({
      backgroundColor: '#1e1e1e',
      foregroundColor: 'rgba(255, 255, 255, 0.87)',
      headerBackgroundColor: '#2a2a2a',
      oddRowBackgroundColor: '#1a1a1a',
    }),
    animateRows: false,
    suppressRowTransform: true,
    getRowId: params => params.data.symbol,
  }), []);

  // Batching mechanism
  const scheduleFrame = () => {
    if (frameScheduledRef.current) return;
    frameScheduledRef.current = true;

    requestAnimationFrame(() => {
      const startTime = performance.now();

      if (pendingUpdatesRef.current.size > 0 && gridRef.current) {
        const transaction = {
          update: Array.from(pendingUpdatesRef.current.values())
        };

        gridRef.current.api.applyTransaction(transaction);
        pendingUpdatesRef.current.clear();

        // Track performance
        const updateTime = performance.now() - startTime;
        perfStats.updateCount++;
        perfStats.totalUpdateTime += updateTime;
        perfStats.minUpdateTime = Math.min(perfStats.minUpdateTime, updateTime);
        perfStats.maxUpdateTime = Math.max(perfStats.maxUpdateTime, updateTime);
        perfStats.lastSecondUpdates++;
      }

      frameScheduledRef.current = false;

      if (pendingUpdatesRef.current.size > 0) {
        scheduleFrame();
      }
    });
  };

  const queueUpdate = (updates) => {
    updates.forEach(row => {
      pendingUpdatesRef.current.set(row.symbol, row);
    });
    scheduleFrame();
  };

  // Performance stats update
  useEffect(() => {
    const interval = setInterval(() => {
      if (perfStats.updateCount > 0) {
        const avgTime = (perfStats.totalUpdateTime / perfStats.updateCount).toFixed(2);
        setPerfMetrics({
          avg: avgTime,
          min: perfStats.minUpdateTime.toFixed(2),
          max: perfStats.maxUpdateTime.toFixed(2),
          fps: perfStats.lastSecondUpdates.toString(),
          total: perfStats.updateCount.toString()
        });
        perfStats.lastSecondUpdates = 0;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Shared worker setup
  useEffect(() => {
    const worker = new SharedWorker(new URL('./market-worker.js', import.meta.url), {
      type: 'module'
    });

    workerRef.current = worker;

    worker.port.onmessage = (event) => {
      const message = event.data;

      switch (message.type) {
        case 'connected':
          setConnectionStatus('Connected');
          break;

        case 'disconnected':
          setConnectionStatus('Disconnected');
          break;

        case 'initial':
          setRowData(message.data);
          break;

        case 'update':
          queueUpdate(message.data);
          break;
      }
    };

    worker.port.start();

    return () => {
      worker.port.close();
    };
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <div style={{
        marginBottom: '10px',
        padding: '8px',
        background: '#1e1e1e',
        border: '1px solid #3a3a3a',
        borderRadius: '4px'
      }}>
        Status: <span style={{ color: connectionStatus === 'Connected' ? 'green' : 'red' }}>
          {connectionStatus}
        </span>
      </div>
      <div style={{
        marginBottom: '10px',
        padding: '8px',
        background: '#1e1e1e',
        border: '1px solid #3a3a3a',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '12px'
      }}>
        <strong>Performance:</strong>{' '}
        Updates/sec: {perfMetrics.fps} |{' '}
        Avg: {perfMetrics.avg}ms |{' '}
        Min: {perfMetrics.min}ms |{' '}
        Max: {perfMetrics.max}ms |{' '}
        Total: {perfMetrics.total}
      </div>
      <div style={{ height: '600px', width: '100%' }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          gridOptions={gridOptions}
        />
      </div>
    </div>
  );
}
