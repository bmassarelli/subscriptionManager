import './ui.css';

export default function EmptyState({ message }) {
  return (
    <div className="alert alert-secondary" role="status">
      {message}
    </div>
  );
}
