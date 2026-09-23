import './ui.css';

export default function DataTable({ children, className = '' }) {
  return (
    <div className="data-table-wrap">
      <table className={`table data-table${className ? ` ${className}` : ''}`}>
        {children}
      </table>
    </div>
  );
}
