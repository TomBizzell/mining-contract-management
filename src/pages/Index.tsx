import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle, FileText, List, Search, Upload, Clock } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/components/AuthContext';

const Index: React.FC = () => {
  const { user } = useAuth();

  const features = [
    {
      icon: <Upload className="h-8 w-8 text-px4-teal" />,
      title: 'Easy Upload',
      description: 'Upload multiple contracts at once in PDF format with our intuitive interface.'
    },
    {
      icon: <Search className="h-8 w-8 text-px4-teal" />,
      title: 'AI-Powered Analysis',
      description: 'Advanced AI extracts obligations specific to your party with high accuracy.'
    },
    {
      icon: <List className="h-8 w-8 text-px4-teal" />,
      title: 'Comprehensive Registry',
      description: 'Receive a structured registry of all your obligations across contracts.'
    },
    {
      icon: <Clock className="h-8 w-8 text-px4-teal" />,
      title: 'Save Time',
      description: 'Reduce manual review time by up to 80% while improving accuracy.'
    }
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-white to-gray-50 py-16 md:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center md:text-left">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="animate-fade-in">
                <h1 className="text-4xl md:text-5xl font-bold text-px4-navy tracking-tight">
                  Simplify Contract Obligation Management
                </h1>
                <p className="mt-6 text-xl text-gray-600 max-w-xl">
                  Upload your contracts, specify your party, and generate a comprehensive obligations registry in minutes.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row justify-center md:justify-start gap-4">
                  {user ? (
                    <>
                      <Button asChild size="lg" className="bg-px4-teal hover:bg-px4-teal/90 text-white px-8">
                        <Link to="/upload">Upload Contracts</Link>
                      </Button>
                      <Button asChild size="lg" variant="outline" className="text-px4-navy border-px4-navy hover:bg-px4-navy/10 px-8">
                        <Link to="/documents">My Documents</Link>
                      </Button>
                    </>
                  ) : (
                    <Button asChild size="lg" className="bg-px4-teal hover:bg-px4-teal/90 text-white px-8">
                      <Link to="/auth">Get Started</Link>
                    </Button>
                  )}
                </div>
              </div>
              <div className="hidden md:block relative animate-fade-in">
                <div className="absolute -top-8 -left-8 w-64 h-64 bg-px4-teal/10 rounded-full filter blur-3xl"></div>
                <div className="relative bg-white rounded-xl shadow-xl p-6 border border-gray-200">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-6 w-6 text-px4-teal" />
                      <span className="font-medium text-px4-navy">Contract Analysis</span>
                    </div>
                    <div className="text-xs font-medium text-white bg-green-500 px-2 py-1 rounded-full">Completed</div>
                  </div>
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                        <div>
                          <p className="font-medium text-sm text-gray-900">Obligation #{i}</p>
                          <p className="text-xs text-gray-600">Due in {i * 10} days</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-px4-navy">How It Works</h2>
              <p className="mt-4 text-xl text-gray-600 max-w-2xl mx-auto">
                Our AI-powered platform extracts obligations with precision and builds a comprehensive registry.
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {features.map((feature, index) => (
                <Card key={index} className="border border-gray-200 transition-all duration-300 hover:shadow-md animate-slide-up" style={{ animationDelay: `${index * 100}ms` }}>
                  <CardContent className="pt-6">
                    <div className="mb-4">{feature.icon}</div>
                    <h3 className="text-xl font-semibold text-px4-navy mb-2">{feature.title}</h3>
                    <p className="text-gray-600">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
        
        {/* CTA Section */}
        <section className="bg-px4-navy py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-3xl font-bold text-white mb-6">Ready to Streamline Your Contract Management?</h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Join hundreds of legal professionals who save time and reduce risk with Mining Obligation Manager.
            </p>
            {user ? (
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Button asChild size="lg" className="bg-px4-teal hover:bg-px4-teal/90 text-white px-8">
                  <Link to="/upload">Upload Your Contracts</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="text-white border-white hover:bg-white/10 px-8">
                  <Link to="/documents">View Your Documents</Link>
                </Button>
              </div>
            ) : (
              <Button asChild size="lg" className="bg-px4-teal hover:bg-px4-teal/90 text-white px-8">
                <Link to="/auth">Get Started Now</Link>
              </Button>
            )}
          </div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
};

export default Index;
