import './ui.css';
import StatusBadge from './StatusBadge';

export default function Timeline({ items }) {
  return (
    <ul className="timeline">
      {items.map(item => (
        <li
          key={item.id}
          className={`timeline__item${item.failed ? ' timeline__item--failed' : ''}`}
        >
          <span className={`timeline__dot timeline__dot--${item.token}`} />
          <div className="timeline__header">
            <span>{item.title}</span>
            <span className="timeline__date font-mono">{item.date}</span>
          </div>
          <div className="timeline__body">{item.body}</div>
          {item.status && (
            <div className="mt-1">
              <StatusBadge token={item.token} label={item.status} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
