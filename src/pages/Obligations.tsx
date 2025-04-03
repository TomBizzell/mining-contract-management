
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from '@/components/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger 
} from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, FileText, AlertCircle } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

// Define the interfaces for our data structure
interface Obligation {
  obligation: string;
  section?: string;
  dueDate?: string;
  raw_response?: string;
}

interface ContractObligations {
  id: string;
  filename: string;
  party: string;
  status: string;
  created_at: string;
  analysis_results: Obligation[] | null;
  error_message?: string;
}

const ObligationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [contracts, setContracts] = useState<ContractObligations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // Redirect to auth page if not logged in
  useEffect(() => {
    if (!loading && !user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to access this page.",
        variant: "destructive",
      });
      navigate('/auth');
    }
  }, [user, loading, navigate, toast]);

  // Fetch all analyzed contracts for the user
  useEffect(() => {
    const fetchContracts = async () => {
      if (!user) return;
      
      try {
        setIsLoading(true);
        
        const { data, error } = await supabase
          .from('documents')
          .select('*, analysis_results')
          .eq('user_id', user.id)
          .eq('status', 'analyzed')
          .order('created_at', { ascending: false });
          
        if (error) {
          throw error;
        }
        
        // Make sure to properly cast the data to match our expected type
        const typedData = data?.map(doc => ({
          id: doc.id,
          filename: doc.filename,
          party: doc.party,
          status: doc.status,
          created_at: doc.created_at,
          analysis_results: doc.analysis_results as Obligation[] | null
        })) as ContractObligations[];
        
        setContracts(typedData || []);
      } catch (error) {
        console.error('Error fetching contracts:', error);
        toast({
          title: "Error",
          description: "Failed to load obligations data.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    if (user) {
      fetchContracts();
    }
  }, [user, toast]);

  // If still loading auth state, show loading indicator
  if (loading || isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-grow flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-4 border-px4-teal border-t-transparent rounded-full"></div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      <main className="flex-grow py-12 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-px4-navy">Your Contract Obligations</h1>
            <p className="mt-3 text-gray-600">
              Review all obligations extracted from your contracts
            </p>
          </div>
          
          {contracts.length === 0 ? (
            <Card className="bg-white">
              <CardContent className="pt-6 flex flex-col items-center justify-center p-10 text-center">
                <div className="rounded-full bg-gray-100 p-3 mb-4">
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium mb-2">No Analyzed Contracts</h3>
                <p className="text-gray-500 mb-6">You don't have any analyzed contracts yet.</p>
                <button 
                  onClick={() => navigate('/upload')}
                  className="bg-px4-teal hover:bg-px4-teal/90 text-white px-4 py-2 rounded-md"
                >
                  Upload Contracts
                </button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {contracts.map((contract) => (
                <Card key={contract.id} className="bg-white shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-xl text-px4-navy">{contract.filename}</CardTitle>
                        <CardDescription className="mt-1">
                          Representing: <span className="font-medium">{contract.party}</span>
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Analyzed
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {!contract.analysis_results || contract.analysis_results.length === 0 ? (
                      <div className="py-4 text-center">
                        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                        <p className="text-gray-500">No obligations were found for this contract.</p>
                      </div>
                    ) : (
                      <Accordion type="single" collapsible className="w-full">
                        {Array.isArray(contract.analysis_results) && contract.analysis_results.map((obligation, index) => (
                          <AccordionItem key={index} value={`item-${index}`}>
                            <AccordionTrigger className="hover:bg-gray-50 px-4 py-3 rounded-md">
                              <div className="text-left">
                                <span className="font-medium">{obligation.obligation.substring(0, 80)}{obligation.obligation.length > 80 ? '...' : ''}</span>
                                {obligation.dueDate && (
                                  <div className="flex items-center mt-1 text-sm text-gray-500">
                                    <Calendar className="h-3.5 w-3.5 mr-1" />
                                    <span>Due: {obligation.dueDate}</span>
                                  </div>
                                )}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pt-2 pb-4">
                              <div className="space-y-3">
                                <p className="text-gray-700">{obligation.obligation}</p>
                                
                                {obligation.section && (
                                  <div className="flex items-center text-sm text-gray-500">
                                    <FileText className="h-3.5 w-3.5 mr-1" />
                                    <span>Section: {obligation.section}</span>
                                  </div>
                                )}
                                
                                {obligation.dueDate && (
                                  <div className="flex items-center text-sm text-gray-500">
                                    <Clock className="h-3.5 w-3.5 mr-1" />
                                    <span>Due date: {obligation.dueDate}</span>
                                  </div>
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default ObligationsPage;
