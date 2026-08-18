const MODULES = [
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'clients', label: 'Clients' },
];

export default function Sidebar({ activeModule, onSelect }) {
  return (
    <nav className="d-flex flex-column bg-dark p-2" style={{ width: '200px' }}>
      {MODULES.map(module => (
        <button
          key={module.id}
          type="button"
          className={`btn text-start mb-1 ${
            activeModule === module.id ? 'btn-primary' : 'btn-outline-light border-0'
          }`}
          aria-current={activeModule === module.id ? 'true' : undefined}
          onClick={() => onSelect(module.id)}
        >
          {module.label}
        </button>
      ))}
    </nav>
  );
}
