# AG Grid Real-Time Market Data - Performance Optimizations

High-frequency market data grid demonstrating AG Grid virtualization and multi-tier batching strategies.

## Performance Optimizations

### 1. Two-Tier Update Batching

**Shared Worker Batching (16.67ms)**
- Aggregates WebSocket updates at 60fps intervals (`1000/60 ≈ 16.67ms`)
- Deduplicates updates by symbol using Map
- Reduces message passing overhead between worker and main thread

**Grid Render Batching (requestAnimationFrame)**
- Queues updates in main thread using Map
- Applies transactions at 60fps via `requestAnimationFrame`
- Prevents render thrashing during high-frequency updates

### 2. Shared Web Worker Architecture

**Single WebSocket Connection Pooling:**
- One WebSocket connection shared across **all browser tabs**
- Traditional approach: N tabs = N connections, N data streams
- Shared Worker: N tabs = 1 connection, 1 data stream broadcast to N tabs
- **Dramatically reduces server load** - scales to hundreds of tabs without additional server burden
- **Reduces bandwidth** - server sends data once, worker distributes to all connected tabs
- **Consistency** - all tabs receive identical data simultaneously

**Additional Benefits:**
- Stores initial state for late-joining tabs (no re-fetch from server)
- Automatic reconnection with cleanup on tab closure
- Connection survives individual tab crashes/reloads

### 3. AG Grid Virtualization

- 150 rows × 107 columns (16,050 total cells)
- Only renders visible cells in viewport
- Enables smooth scrolling despite large dataset
- Row animations disabled (`animateRows: false`, `suppressRowTransform: true`)

### 4. Delta Updates

**Server-Side Optimization:**
- Sends only changed fields per update, not entire row objects
- Typical update: ~17 fields instead of 107 total fields
- **~84% reduction in payload size** per update
- Reduces JSON parsing overhead and network bandwidth

**Implementation:**
- Server tracks changed metrics and price fields
- Delta object contains: symbol + changed fields only
- Client-side transaction updates merge deltas with existing rows

### 5. React Cell Renderers with Memoization

**Custom Components:**
- `PriceCellRenderer` - Tracks value changes with useEffect, triggers 200ms flash
- `MetricCellRenderer` - Reusable across 100 metric columns, short animation cycles
- `ChangeCellRenderer` - Static formatting with CSS classes
- `ChangePercentCellRenderer` - Percentage formatting with color coding

**Optimizations:**
- All components wrapped in `React.memo()` to prevent unnecessary re-renders
- Component-level state management for animations
- Efficient re-rendering via React's reconciliation
- Declarative flash animations without grid configuration

### 6. AG Grid Performance Tuning

**Configuration:**
- `suppressCellFocus: true` - Reduces focus management overhead
- `suppressFieldDotNotation: true` - Faster field access (simple field names)
- `animateRows: false` - No row position animations
- `suppressRowTransform: true` - Disables CSS transform animations during scroll

### 7. Server-Side Stress Testing

- Updates every 5-20ms (50-200 updates/sec)
- Batch size: 10-30 rows per update
- 10-30 random metrics updated per row
- Demonstrates batching efficacy under load

## Performance Metrics

Real-time instrumentation displays:
- Updates per second (batched renders)
- Average/Min/Max update time (ms)
- Total update count

## Tech Stack

- **Frontend:** React 19, AG Grid 34 (React), Vite 7
- **Backend:** Node.js WebSocket server (ws)
- **Worker:** Shared Web Worker for connection pooling

## Running

```bash
# Terminal 1 - WebSocket server
pnpm server

# Terminal 2 - Dev server
pnpm dev
```

Open multiple tabs to see shared worker connection pooling in action.
