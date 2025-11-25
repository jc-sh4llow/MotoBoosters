// src/components/Navbar.tsx
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function Navbar() {
  return (
    <nav className="bg-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <h1 className="text-white text-xl font-bold">MotoBooster</h1>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                <NavLink to="/">Dashboard</NavLink>
                <NavLink to="/inventory">Inventory</NavLink>
                <NavLink to="/sales">Sales Records</NavLink>
                <NavLink to="/services">Services</NavLink>
                <NavLink to="/transactions">Transactions</NavLink>
                <NavLink to="/users">Users</NavLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
    >
      {children}
    </Link>
  );
}