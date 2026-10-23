import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { makeSnapshot, type Scenario } from '../playground/mocks';
import { Table } from './Table';

const ignore = () => {};

test.each([2, 6, 9])('renders the timed playground and terminal controls with %i players', (count) => {
  const render = (scenario: Scenario) => renderToStaticMarkup(
    <Table
      snapshot={makeSnapshot(scenario, count, 1, Date.now())}
      onAct={ignore}
      onPreAction={ignore}
      onSit={ignore}
    />,
  );

  const acting = render('my-turn');
  expect(acting).toContain('<svg');
  expect(acting).toContain('To act');
  expect(acting).toContain('>Fold</button>');
  expect(acting).not.toContain('Act in advance');

  const waiting = render('waiting');
  expect(waiting).toContain('<svg');
  expect(waiting).toContain('Act in advance');

  for (const scenario of ['all-in', 'showdown'] as const) {
    const html = render(scenario);
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('>Fold</button>');
    expect(html).not.toContain('Act in advance');
  }
});
