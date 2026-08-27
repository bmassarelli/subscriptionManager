import './ui.css';

export default function FilterPanel({ title = 'Filters', children }) {
  return (
    <aside className="filter-panel">
      <div className="filter-panel__title">{title}</div>
      {children}
    </aside>
  );
}
