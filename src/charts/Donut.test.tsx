import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../domain/categories';
import { Donut } from './Donut';

afterEach(cleanup);

const props = {
  categories: DEFAULT_CATEGORIES,
  currency: 'INR',
  caption: 'Preview',
  onSelect: () => undefined,
};

describe('Donut legend', () => {
  it('keeps a fixed set of rows when given one, whatever the totals, so its height never changes', () => {
    const ids = ['housing', 'food', 'transport'];
    const { rerender } = render(
      <Donut {...props} legendIds={ids} totals={[{ categoryId: 'food', totalMinor: 50000 }]} />,
    );
    const rows = () =>
      within(screen.getByRole('list', { name: 'Categories' })).getAllByRole('button');
    expect(rows().map((r) => r.textContent)).toEqual([
      'Housing & Utilities–',
      'Food & Dining₹500.00100%',
      'Transport & Travel–',
    ]);
    expect(rows()[0]).toBeDisabled();
    expect(rows()[1]).toBeEnabled();
    // An empty month (a preview of a month with nothing) keeps the same three rows.
    rerender(<Donut {...props} legendIds={ids} totals={[]} />);
    expect(rows()).toHaveLength(3);
    expect(screen.queryByText('Nothing spent in this month.')).toBeNull();
  });

  it('without a fixed set lists the totals, and says when there is nothing', () => {
    render(<Donut {...props} totals={[]} />);
    expect(screen.getByText('Nothing spent in this month.')).toBeInTheDocument();
  });
});
