export default function SubscriptionHistoryTimeline({ operations }) {
  if (operations.length === 0) {
    return <div className="text-muted small">No operations recorded yet.</div>;
  }

  const sorted = [...operations].sort(
    (a, b) => new Date(b.createdDate) - new Date(a.createdDate)
  );

  return (
    <ul className="list-group">
      {sorted.map(op => {
        const failed = op.status === 'FAILED';
        return (
          <li
            key={op.id}
            className={`list-group-item ${failed ? 'list-group-item-danger' : ''}`}
          >
            <div className="d-flex justify-content-between">
              <span className="fw-semibold">{op.operationType}</span>
              <span className="text-muted small">{op.createdDate}</span>
            </div>
            <div>{op.description || op.errorMessage}</div>
            <span className={`badge ${failed ? 'bg-danger' : 'bg-success'}`}>{op.status}</span>
          </li>
        );
      })}
    </ul>
  );
}
