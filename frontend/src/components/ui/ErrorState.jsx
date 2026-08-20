import './ui.css';

export default function ErrorState({ message }) {
  return (
    <div className="alert alert-danger" role="alert">
      {message}
    </div>
  );
}
