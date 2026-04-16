/**
 * Tests for useWebSocket hook.
 *
 * Covers: connection lifecycle, message sending/receiving, pong filtering,
 * reconnect with exponential backoff, ping keepalive, and clean unmount.
 */
import { renderHook, act } from '@testing-library/react-native';

import useWebSocket from '@/hooks/useWebSocket';

// ---------------------------------------------------------------------------
// Fake WebSocket implementation
// ---------------------------------------------------------------------------

/** Minimal readyState constants mirroring the real WebSocket API. */
const WS_OPEN = 1;
const WS_CLOSED = 3;

interface FakeWebSocketInstance {
  url: string;
  readyState: number;
  send: jest.Mock;
  close: jest.Mock;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  /** Trigger the onopen callback from test code. */
  simulateOpen(): void;
  /** Trigger an inbound message from test code. */
  simulateMessage(data: string): void;
  /** Trigger the onclose callback from test code. */
  simulateClose(): void;
  /** Trigger the onerror callback from test code. */
  simulateError(): void;
}

/** Tracks every FakeWebSocket created during a test. */
let wsInstances: FakeWebSocketInstance[] = [];

class FakeWebSocket implements FakeWebSocketInstance {
  static OPEN = WS_OPEN;
  static CLOSED = WS_CLOSED;

  url: string;
  readyState: number = WS_CLOSED;
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = WS_CLOSED;
  });
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }

  simulateOpen(): void {
    this.readyState = WS_OPEN;
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  simulateClose(): void {
    this.readyState = WS_CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  simulateError(): void {
    this.onerror?.(new Event('error'));
  }
}

// ---------------------------------------------------------------------------
// Global setup / teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  // Install FakeWebSocket as the global WebSocket constructor.
  (global as unknown as Record<string, unknown>).WebSocket = FakeWebSocket;
});

afterAll(() => {
  delete (global as unknown as Record<string, unknown>).WebSocket;
});

beforeEach(() => {
  wsInstances = [];
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helper: latest created WS instance
// ---------------------------------------------------------------------------
function latestWs(): FakeWebSocketInstance {
  const ws = wsInstances[wsInstances.length - 1];
  if (!ws) throw new Error('No WebSocket instance created yet');
  return ws;
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

describe('connection', () => {
  it('creates a WebSocket with the given url on mount when enabled=true', () => {
    renderHook(() => useWebSocket({ url: 'wss://example.com/ws' }));
    expect(wsInstances).toHaveLength(1);
    expect(wsInstances[0].url).toBe('wss://example.com/ws');
  });

  it('sets isConnected=true after socket opens', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws' }),
    );

    expect(result.current.isConnected).toBe(false);

    act(() => { latestWs().simulateOpen(); });

    expect(result.current.isConnected).toBe(true);
  });

  it('does NOT create a WebSocket when enabled=false', () => {
    renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws', enabled: false }),
    );
    expect(wsInstances).toHaveLength(0);
  });

  it('connects when enabled flips from false to true', () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useWebSocket({ url: 'wss://example.com/ws', enabled }),
      { initialProps: { enabled: false } },
    );

    expect(wsInstances).toHaveLength(0);

    rerender({ enabled: true });

    expect(wsInstances).toHaveLength(1);
  });

  it('closes existing socket and disconnects when enabled flips to false', () => {
    const { rerender, result } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useWebSocket({ url: 'wss://example.com/ws', enabled }),
      { initialProps: { enabled: true } },
    );

    act(() => { latestWs().simulateOpen(); });
    expect(result.current.isConnected).toBe(true);

    rerender({ enabled: false });

    expect(latestWs().close).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Sending messages
// ---------------------------------------------------------------------------

describe('send', () => {
  it('sends a string payload as-is when socket is open', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws' }),
    );

    act(() => { latestWs().simulateOpen(); });
    act(() => { result.current.send('hello'); });

    expect(latestWs().send).toHaveBeenCalledWith('hello');
  });

  it('serialises non-string values to JSON before sending', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws' }),
    );

    act(() => { latestWs().simulateOpen(); });
    act(() => { result.current.send({ type: 'chat', text: 'hi' }); });

    expect(latestWs().send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'chat', text: 'hi' }),
    );
  });

  it('is a no-op when the socket is not yet open', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws' }),
    );

    // Socket exists but readyState is CLOSED (not opened yet).
    act(() => { result.current.send('too early'); });

    expect(latestWs().send).not.toHaveBeenCalled();
  });

  it('is a no-op when enabled=false (no socket)', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws', enabled: false }),
    );

    // No socket was created; send must not throw.
    expect(() => { result.current.send('noop'); }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Receiving messages
// ---------------------------------------------------------------------------

describe('receiving messages', () => {
  it('updates lastMessage with parsed JSON payload', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws' }),
    );

    act(() => { latestWs().simulateOpen(); });
    act(() => {
      latestWs().simulateMessage(JSON.stringify({ type: 'update', id: 42 }));
    });

    expect(result.current.lastMessage).toEqual({ type: 'update', id: 42 });
  });

  it('updates lastMessage with raw string when payload is not valid JSON', () => {
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws' }),
    );

    act(() => { latestWs().simulateOpen(); });
    act(() => { latestWs().simulateMessage('plain text'); });

    expect(result.current.lastMessage).toBe('plain text');
  });

  it('calls onMessage callback with the parsed payload', () => {
    const onMessage = jest.fn();
    renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws', onMessage }),
    );

    act(() => { latestWs().simulateOpen(); });
    act(() => {
      latestWs().simulateMessage(JSON.stringify({ type: 'hello' }));
    });

    expect(onMessage).toHaveBeenCalledWith({ type: 'hello' });
  });

  it('does NOT call onMessage and does not update lastMessage for pong frames', () => {
    const onMessage = jest.fn();
    const { result } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws', onMessage }),
    );

    act(() => { latestWs().simulateOpen(); });
    act(() => {
      latestWs().simulateMessage(JSON.stringify({ type: 'pong' }));
    });

    expect(onMessage).not.toHaveBeenCalled();
    expect(result.current.lastMessage).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Ping / pong keepalive
// ---------------------------------------------------------------------------

describe('ping keepalive', () => {
  it('sends a ping after one pingIntervalMs tick while socket is open', () => {
    renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws', pingIntervalMs: 5_000 }),
    );

    act(() => { latestWs().simulateOpen(); });
    act(() => { jest.advanceTimersByTime(5_000); });

    expect(latestWs().send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'ping' }),
    );
  });

  it('sends multiple pings on each interval tick', () => {
    renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws', pingIntervalMs: 5_000 }),
    );

    act(() => { latestWs().simulateOpen(); });
    act(() => { jest.advanceTimersByTime(15_000); });

    const pings = latestWs()
      .send.mock.calls.filter(
        ([payload]: [string]) => payload === JSON.stringify({ type: 'ping' }),
      );
    expect(pings).toHaveLength(3);
  });

  it('does NOT send a ping when socket readyState is not OPEN', () => {
    const { result: _r } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws', pingIntervalMs: 5_000 }),
    );

    // open then immediately close — readyState is now CLOSED
    act(() => { latestWs().simulateOpen(); });
    act(() => { latestWs().simulateClose(); });

    // clear previous send calls (none expected, but be explicit)
    latestWs().send.mockClear();

    // Even if the old interval somehow fires, readyState check blocks the send.
    act(() => { jest.advanceTimersByTime(5_000); });

    // The old socket (now closed) should not have had more sends.
    // (A new WS may have been created for reconnect; we check the first one.)
    expect(wsInstances[0].send).not.toHaveBeenCalled();
  });

  it('stops pinging after unmount', () => {
    const { unmount } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws', pingIntervalMs: 5_000 }),
    );

    act(() => { latestWs().simulateOpen(); });
    unmount();

    const ws = wsInstances[0];
    ws.send.mockClear();

    act(() => { jest.advanceTimersByTime(15_000); });

    expect(ws.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Reconnect with exponential backoff
// ---------------------------------------------------------------------------

describe('reconnect', () => {
  it('schedules a reconnect after the socket closes', () => {
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws',
        reconnectBaseMs: 1_000,
        reconnectMaxMs: 10_000,
      }),
    );

    act(() => { latestWs().simulateOpen(); });
    act(() => { latestWs().simulateClose(); });

    // One WS so far; after base delay a second one should appear.
    expect(wsInstances).toHaveLength(1);

    act(() => { jest.advanceTimersByTime(1_000); });

    expect(wsInstances).toHaveLength(2);
  });

  it('uses exponential backoff for subsequent reconnect attempts', () => {
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws',
        reconnectBaseMs: 1_000,
        reconnectMaxMs: 30_000,
      }),
    );

    // Attempt 0 → backoff = 1_000 * 2^0 = 1_000
    act(() => { latestWs().simulateOpen(); });
    act(() => { latestWs().simulateClose(); });
    act(() => { jest.advanceTimersByTime(1_000); });
    expect(wsInstances).toHaveLength(2);

    // Attempt 1 → backoff = 1_000 * 2^1 = 2_000
    act(() => { latestWs().simulateClose(); });
    act(() => { jest.advanceTimersByTime(2_000); });
    expect(wsInstances).toHaveLength(3);

    // Attempt 2 → backoff = 1_000 * 2^2 = 4_000
    act(() => { latestWs().simulateClose(); });
    act(() => { jest.advanceTimersByTime(4_000); });
    expect(wsInstances).toHaveLength(4);
  });

  it('caps backoff at reconnectMaxMs', () => {
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws',
        reconnectBaseMs: 1_000,
        reconnectMaxMs: 4_000,
      }),
    );

    // Drive through several reconnect failures to saturate the cap.
    for (let i = 0; i < 6; i++) {
      act(() => { latestWs().simulateOpen(); });
      act(() => { latestWs().simulateClose(); });
      // Advance enough for any backoff ≤ reconnectMaxMs to fire.
      act(() => { jest.advanceTimersByTime(4_000); });
    }

    // Every new instance should have been opened — cap is respected (no delay
    // longer than 4 000 ms was needed).
    expect(wsInstances.length).toBeGreaterThanOrEqual(7);
  });

  it('resets reconnect attempt counter after a successful open', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws',
        reconnectBaseMs: 1_000,
        reconnectMaxMs: 30_000,
      }),
    );

    // First successful connection.
    act(() => { latestWs().simulateOpen(); });
    act(() => { latestWs().simulateClose(); });
    act(() => { jest.advanceTimersByTime(1_000); });

    // Second connection succeeds → counter resets.
    act(() => { latestWs().simulateOpen(); });
    expect(result.current.isConnected).toBe(true);

    // Next close should again use base delay (1_000), not doubled delay.
    act(() => { latestWs().simulateClose(); });
    act(() => { jest.advanceTimersByTime(1_000); });

    expect(wsInstances).toHaveLength(3);
  });

  it('does not reconnect after unmount', () => {
    const { unmount } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws',
        reconnectBaseMs: 500,
        reconnectMaxMs: 5_000,
      }),
    );

    act(() => { latestWs().simulateOpen(); });
    act(() => { latestWs().simulateClose(); });

    unmount();

    act(() => { jest.advanceTimersByTime(2_000); });

    // Still only the original socket — no reconnect after unmount.
    expect(wsInstances).toHaveLength(1);
  });

  it('reconnects after an onerror event (which precedes onclose)', () => {
    renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws',
        reconnectBaseMs: 1_000,
        reconnectMaxMs: 10_000,
      }),
    );

    act(() => { latestWs().simulateOpen(); });
    // Real browsers fire onerror then onclose in sequence.
    act(() => {
      latestWs().simulateError();
      latestWs().simulateClose();
    });

    act(() => { jest.advanceTimersByTime(1_000); });

    expect(wsInstances).toHaveLength(2);
  });

  it('sets isConnected=false immediately on close before reconnect fires', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws',
        reconnectBaseMs: 5_000,
        reconnectMaxMs: 30_000,
      }),
    );

    act(() => { latestWs().simulateOpen(); });
    expect(result.current.isConnected).toBe(true);

    act(() => { latestWs().simulateClose(); });
    expect(result.current.isConnected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Disconnect / unmount teardown
// ---------------------------------------------------------------------------

describe('disconnect on unmount', () => {
  it('closes the socket when the hook unmounts', () => {
    const { unmount } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws' }),
    );

    act(() => { latestWs().simulateOpen(); });
    const ws = latestWs();

    unmount();

    expect(ws.close).toHaveBeenCalled();
  });

  it('cancels pending reconnect timer on unmount', () => {
    const { unmount } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws',
        reconnectBaseMs: 1_000,
        reconnectMaxMs: 10_000,
      }),
    );

    act(() => { latestWs().simulateOpen(); });
    act(() => { latestWs().simulateClose(); });

    // Unmount before the reconnect timer fires.
    unmount();
    const countBefore = wsInstances.length;

    act(() => { jest.advanceTimersByTime(2_000); });

    // No new WebSocket should have been created.
    expect(wsInstances).toHaveLength(countBefore);
  });

  it('removes all socket event handlers on disconnect to prevent reconnect loop', () => {
    const { unmount } = renderHook(() =>
      useWebSocket({ url: 'wss://example.com/ws' }),
    );

    act(() => { latestWs().simulateOpen(); });
    const ws = latestWs();

    unmount();

    // Handlers should be nulled out before close is called.
    expect(ws.onopen).toBeNull();
    expect(ws.onclose).toBeNull();
    expect(ws.onerror).toBeNull();
    expect(ws.onmessage).toBeNull();
  });
});
