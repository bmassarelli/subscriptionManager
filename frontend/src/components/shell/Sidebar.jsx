const MODULES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'clients', label: 'Clients' },
  { id: 'operations', label: 'Operations' },
];

export default function Sidebar({ activeModule, onSelect }) {
  return (
    <nav className="sidebar" aria-label="Modules">
      {MODULES.map(module => {
        const isActive = activeModule === module.id;
        return (
          <button
            key={module.id}
            type="button"
            className={`sidebar__item${isActive ? ' sidebar__item--active' : ''}`}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => onSelect(module.id)}
          >
            {module.label}
          </button>
        );
      })}
    </nav>
  );
}
