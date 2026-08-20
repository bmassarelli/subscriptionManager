import './shell.css';
import TopBar from './TopBar';
import Sidebar from './Sidebar';

export default function AppShell({ activeModule, onSelectModule, children }) {
  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-shell__body">
        <Sidebar activeModule={activeModule} onSelect={onSelectModule} />
        <div className="app-shell__main">{children}</div>
      </div>
    </div>
  );
}
