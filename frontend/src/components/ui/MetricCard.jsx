import './ui.css';

export default function MetricCard({ label, value, className = '' }) {
  return (
    <div className={`metric-card${className ? ` ${className}` : ''}`}>
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value">{value}</div>
    </div>
  );
}
