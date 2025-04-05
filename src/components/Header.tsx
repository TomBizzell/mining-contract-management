import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from './AuthContext';

const Header: React.FC = () => {
  const { user, signOut, loading } = useAuth();

  return (
    <header className="bg-white border-b border-gray-200 py-4 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <Link to="/" className="flex items-center">
          <span className="text-xl font-bold text-px4-navy">
            Mining <span className="text-px4-teal">Obligation Manager</span>
          </span>
        </Link>
        
        <nav className="hidden md:flex items-center space-x-8">
          <Link to="/" className="text-gray-600 hover:text-px4-navy">Home</Link>
          <Link to="/upload" className="text-gray-600 hover:text-px4-navy">Upload</Link>
          {user && (
            <>
              <Link to="/documents" className="text-gray-600 hover:text-px4-navy">My Documents</Link>
              <Link to="/obligations" className="text-gray-600 hover:text-px4-navy">Obligations</Link>
            </>
          )}
        </nav>
        
        <div className="flex items-center space-x-4">
          {!loading && (
            user ? (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600 hidden md:inline-block">
                  {user.email}
                </span>
                <Button 
                  variant="outline" 
                  onClick={signOut}
                  className="text-px4-navy border-px4-navy hover:bg-px4-navy hover:text-white"
                >
                  Sign Out
                </Button>
              </div>
            ) : (
              <Button asChild className="bg-px4-teal hover:bg-px4-teal/90 text-white">
                <Link to="/auth">Sign In</Link>
              </Button>
            )
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
