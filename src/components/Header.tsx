
import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 sm:px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center space-x-2">
          <FileText className="h-8 w-8 text-px4-teal" />
          <span className="font-bold text-xl text-px4-navy">PX4 Obligation Manager</span>
        </Link>
        <nav className="hidden md:flex items-center space-x-6">
          <Link to="/" className="text-gray-600 hover:text-px4-navy transition-colors">
            Home
          </Link>
          <Link to="/upload" className="text-gray-600 hover:text-px4-navy transition-colors">
            Upload
          </Link>
          <Link to="#" className="text-gray-600 hover:text-px4-navy transition-colors">
            About
          </Link>
          <Link to="#" className="text-gray-600 hover:text-px4-navy transition-colors">
            Contact
          </Link>
        </nav>
        <div className="flex items-center space-x-4">
          <Button variant="outline" className="hidden md:inline-flex">
            Sign In
          </Button>
          <Button className="bg-px4-teal hover:bg-px4-teal/90 text-white">
            Get Started
          </Button>
        </div>
      </div>
    </header>
  );
};

export default Header;
