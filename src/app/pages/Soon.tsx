const DROPS: Record<string, { drop: number; what: string }> = {
  Reports: {
    drop: 4,
    what: 'Month, quarter and financial-year reports with comparisons and exports.',
  },
  Recurring: {
    drop: 4,
    what: 'A 30-day timeline of repeating payments and subscription detection.',
  },
};

export function Soon({ page }: { page: 'Reports' | 'Recurring' }) {
  const info = DROPS[page]!;
  return (
    <section className="card empty">
      <h2>Arrives in drop {info.drop}</h2>
      <p className="muted">{info.what}</p>
    </section>
  );
}
