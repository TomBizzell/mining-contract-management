
import React from 'react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  return (
    <footer className="bg-px4-navy text-white py-12 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="col-span-1 md:col-span-2">
          <h3 className="font-bold text-xl mb-4">PX4 Obligation Manager</h3>
          <p className="text-gray-300 mb-4 max-w-md">
            Upload your contracts and generate a comprehensive obligations registry to stay
            on top of your legal commitments.
          </p>
          <p className="text-gray-300">© {new Date().getFullYear()} PX4 Obligation Manager. All rights reserved.</p>
        </div>
        
        <div>
          <h4 className="font-semibold text-lg mb-4">Product</h4>
          <ul className="space-y-2 text-gray-300">
            <li><Link to="/" className="hover:text-px4-teal transition-colors">Home</Link></li>
            <li><Link to="/upload" className="hover:text-px4-teal transition-colors">Upload Contracts</Link></li>
            <li><Link to="#" className="hover:text-px4-teal transition-colors">Features</Link></li>
            <li><Link to="#" className="hover:text-px4-teal transition-colors">Pricing</Link></li>
          </ul>
        </div>
        
        <div>
          <h4 className="font-semibold text-lg mb-4">Support</h4>
          <ul className="space-y-2 text-gray-300">
            <li><Link to="#" className="hover:text-px4-teal transition-colors">Help Center</Link></li>
            <li><Link to="#" className="hover:text-px4-teal transition-colors">Documentation</Link></li>
            <li><Link to="#" className="hover:text-px4-teal transition-colors">Privacy Policy</Link></li>
            <li><Link to="#" className="hover:text-px4-teal transition-colors">Terms of Service</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
