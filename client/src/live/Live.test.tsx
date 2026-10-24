import { DEVELOPMENT_PLAYERS } from '@deadpan/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';
import { connected, playing, setup, snapshot } from './connection.test-support';
import { Live } from './Live';

describe('live screen markup', () => {
  test('reads the Vite server configuration without opening a socket on render', () => {
    vi.stubEnv('VITE_SERVER_URL', 'ws://localhost:4567');
    try {
      expect(renderToStaticMarkup(<Live />)).toContain('ws://localhost:4567');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  test('labels the mode and server, maps fixed names to IDs, and starts disconnected without a table', () => {
    const { connection, createSocket } = setup('ws://localhost:4567');
    const html = renderToStaticMarkup(<Live connection={connection} />);
    expect(html).toContain('Local development');
    expect(html).toContain('Unauthenticated');
    expect(html).toContain('ws://localhost:4567');
    expect(html).toContain('href="/"');
    for (const player of DEVELOPMENT_PLAYERS) {
      expect(html).toContain(`value="${player.id}"`);
      expect(html).toContain(player.name);
    }
    expect(html).toContain('Disconnected');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Deal first hand<\/button>/);
    expect(html).not.toContain('<fieldset');
    expect(createSocket).not.toHaveBeenCalled();
  });

  test.each(DEVELOPMENT_PLAYERS)('keeps Connect after the first identify is refused for $name', (player) => {
    const { connection, sockets } = setup();
    connection.connect(player.id);
    const socket = sockets[0]!;
    socket.open();
    socket.message({ kind: 'error', code: 'player-in-use', message: 'This player is already connected.' });
    expect(connection.getState().playerId).toBe(player.id);
    expect(connection.getState().snapshot).toBeNull();
    const html = renderToStaticMarkup(<Live connection={connection} />);
    expect(html).toContain('This player is already connected.');
    expect(html).toContain('>Connect</button>');
    expect(html).not.toContain('>Reconnect</button>');
  });

  test('offers Reconnect after an accepted view disconnects', () => {
    const { connection, socket } = connected();
    socket.closed();
    const html = renderToStaticMarkup(<Live connection={connection} />);
    expect(html).toContain('Read-only view');
    expect(html).toContain('>Reconnect</button>');
    expect(html).not.toContain('>Connect</button>');
  });

  test('renders an untimed active snapshot with controls and an acting highlight, not a countdown', () => {
    const { connection } = connected(playing());
    const html = renderToStaticMarkup(<Live connection={connection} />);
    expect(html).toContain('To act');
    expect(html).toContain('data-acting="true"');
    expect(html).not.toContain('<svg');
    expect(html).toMatch(/<fieldset[^>]*aria-label="Live table controls"/);
    expect(html).not.toMatch(/<fieldset[^>]*disabled/);
    expect(html).toMatch(/<select[^>]*disabled/);
    expect(html).toContain('>Fold</button>');
    expect(html).not.toContain('Act in advance');
  });

  test('uses a real disabled fieldset while pending and disconnected, preserving the displayed snapshot', () => {
    const { connection, socket } = connected(playing());
    connection.act({ kind: 'call' }, 1);
    const pending = renderToStaticMarkup(<Live connection={connection} />);
    expect(pending).toMatch(/<fieldset[^>]*disabled=""/);
    expect(pending).toContain('Waiting for server');
    expect(pending).toContain('>Fold</button>');
    socket.closed();
    const disconnected = renderToStaticMarkup(<Live connection={connection} />);
    expect(disconnected).toMatch(/<fieldset[^>]*disabled=""/);
    expect(disconnected).toContain('Disconnected');
    expect(disconnected).toContain('Read-only');
    expect(disconnected).toContain('>Reconnect</button>');
    expect(disconnected).toContain('>Fold</button>');
  });

  test('hides live waiting pre-actions and completed hand betting, but offers the next deal', () => {
    const waiting = connected(playing({ turn: { seat: 1, clock: null }, legalActions: null }));
    const waitingHtml = renderToStaticMarkup(<Live connection={waiting.connection} />);
    expect(waitingHtml).not.toContain('Act in advance');
    expect(waitingHtml).not.toContain('>Fold</button>');
    const complete = connected(snapshot({ seq: 2, handStatus: 'complete' }));
    const completeHtml = renderToStaticMarkup(<Live connection={complete.connection} />);
    expect(completeHtml).not.toContain('>Fold</button>');
    expect(completeHtml).not.toContain('Act in advance');
    expect(completeHtml).toMatch(/<button[^>]*>Deal next hand<\/button>/);
    expect(completeHtml).not.toMatch(/<button[^>]*disabled=""[^>]*>Deal next hand<\/button>/);
  });

  test('renders errors as escaped text and enables retry after a rejected request', () => {
    const { connection, socket } = connected();
    connection.deal(0);
    socket.message({ kind: 'error', code: 'cannot-deal', message: 'Need both players <not HTML>', replyTo: 1 });
    const html = renderToStaticMarkup(<Live connection={connection} />);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('<not HTML>');
    expect(html).not.toMatch(/<fieldset[^>]*disabled/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Deal first hand<\/button>/);
  });
});
