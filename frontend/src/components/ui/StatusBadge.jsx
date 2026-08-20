import './ui.css';

export default function StatusBadge({ token, label, className = '' }) {
  return (
    <span className={`status-badge status-badge--${token}${className ? ` ${className}` : ''}`}>
      {label}
    </span>
  );
}
