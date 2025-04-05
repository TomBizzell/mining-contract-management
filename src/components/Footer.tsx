import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  return (
    <footer className="bg-px4-navy text-white py-8 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between">
          <div className="mb-6 md:mb-0">
            <h2 className="text-xl font-bold">
              Mining <span className="text-px4-teal">Obligation Manager</span>
            </h2>
            <p className="mt-2 text-gray-300 max-w-xs">
              Simplify contract obligation management with AI-powered analysis
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-px4-teal">
                Navigation
              </h3>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link to="/" className="text-gray-300 hover:text-white">
                    Home
                  </Link>
                </li>
                <li>
                  <Link to="/upload" className="text-gray-300 hover:text-white">
                    Upload
                  </Link>
                </li>
                <li>
                  <Link to="/auth" className="text-gray-300 hover:text-white">
                    Sign In
                  </Link>
                </li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-px4-teal">
                Legal
              </h3>
              <ul className="mt-4 space-y-2">
                <li>
                  <span className="text-gray-300">
                    &copy; {new Date().getFullYear()} Mining Obligation Manager
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
