import './ui.css';

export default function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="state-placeholder">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">{label}</span>
      </div>
    </div>
  );
}
