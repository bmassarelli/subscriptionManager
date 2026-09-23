import './ui.css';

export const TOKEN_COLOR = {
  signal: 'var(--color-signal)',
  amber: 'var(--color-amber)',
  slate: 'var(--color-slate)',
  'slate-muted': 'var(--color-slate-muted)',
  graphite: 'var(--color-graphite)',
  coral: 'var(--color-coral)',
  'cat-1': 'var(--chart-cat-1)',
  'cat-2': 'var(--chart-cat-2)',
  'cat-3': 'var(--chart-cat-3)',
  'cat-4': 'var(--chart-cat-4)',
  'cat-5': 'var(--chart-cat-5)',
  'cat-6': 'var(--chart-cat-6)',
  'cat-7': 'var(--chart-cat-7)',
  'cat-8': 'var(--chart-cat-8)',
  'cat-9': 'var(--chart-cat-9)',
};

// A pie chart is a color-only encoding, so the legend is not decoration —
// it is what keeps every slice's identity and value readable without
// relying on hue alone (screen readers, CVD, grayscale print).
export default function PieChart({ slices }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  let cumulative = 0;
  const stops = slices
    .filter(slice => slice.value > 0)
    .map(slice => {
      const start = (cumulative / total) * 100;
      cumulative += slice.value;
      const end = (cumulative / total) * 100;
      return `${TOKEN_COLOR[slice.token]} ${start}% ${end}%`;
    });

  const background = total === 0
    ? 'var(--color-surface-sunken)'
    : `conic-gradient(${stops.join(', ')})`;

  return (
    <div className="pie-chart">
      <div className="pie-chart__circle" style={{ background }} aria-hidden="true" />
      <ul className="pie-chart__legend">
        {slices.map(slice => {
          const pct = total === 0 ? 0 : Math.round((slice.value / total) * 100);
          return (
            <li key={slice.key} className="pie-chart__legend-item" title={`${slice.label}: ${slice.value} (${pct}%)`}>
              <span className={`pie-chart__swatch pie-chart__swatch--${slice.token}`} />
              <span className="pie-chart__legend-label">{slice.label}</span>
              <span className="pie-chart__legend-value">{slice.value}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
