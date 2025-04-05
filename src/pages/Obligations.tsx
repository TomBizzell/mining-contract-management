import React, { useState, useEffect, useCallback } from 'react';
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
import { Calendar, Clock, FileText, AlertCircle, Tag, BookOpen, Table } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table as UITable,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Define the interfaces for our data structure
interface Obligation {
  obligation: string;
  section?: string;
  dueDate?: string | null;
  raw_response?: string;
  documentId?: string;  // Added to track source document when consolidated
  documentName?: string; // Added to display source document name
}

interface ContractObligations {
  id: string;
  filename: string;
  party: string;
  status: string;
  created_at: string;
  updated_at?: string; // Added to track processing time
  analysis_results: Obligation[] | null;
  error_message?: string;
}

interface ConsolidatedObligation extends Obligation {
  documentId: string;
  documentName: string;
}

const ObligationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [contracts, setContracts] = useState<ContractObligations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showConsolidated, setShowConsolidated] = useState(false);
  const [consolidatedObligations, setConsolidatedObligations] = useState<ConsolidatedObligation[]>([]);
  const [lastUploadDate, setLastUploadDate] = useState<string | null>(null);
  const [pendingDocuments, setPendingDocuments] = useState<number>(0);
  const [isPolling, setIsPolling] = useState<boolean>(false);
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

  // Fetch analyzed and pending contracts
  const fetchContracts = useCallback(async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      
      console.log("Fetching documents for user:", user.id);
      
      // Fetch analyzed documents
      const { data: analyzedData, error: analyzedError } = await supabase
        .from('documents')
        .select('*') // Get all fields for better debugging
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
        
      if (analyzedError) {
        console.error('Database error fetching analyzed documents:', analyzedError);
        throw analyzedError;
      }
      
      // Log the full response for debugging
      console.log("Received documents from database:", analyzedData);
      
      // Filter analyzed documents client-side
      const analyzedDocs = analyzedData?.filter(doc => 
        doc.status === 'analyzed' && 
        doc.analysis_results && 
        Array.isArray(doc.analysis_results)
      ) || [];
      
      console.log("Filtered analyzed documents:", analyzedDocs);
      
      // Fetch pending and processing documents
      const pendingDocs = analyzedData?.filter(doc => 
        doc.status === 'pending' || doc.status === 'processing'
      ) || [];
      
      // Update pending documents count
      const pendingCount = pendingDocs.length;
      setPendingDocuments(pendingCount);
      
      // If we have pending documents, start polling
      if (pendingCount > 0 && !isPolling) {
        setIsPolling(true);
      } else if (pendingCount === 0) {
        setIsPolling(false);
      }
      
      // Make sure data is not null before proceeding with analyzed documents
      if (analyzedDocs && analyzedDocs.length > 0) {
        // Type cast to ensure TS understands this data structure
        const typedData = analyzedDocs as unknown as ContractObligations[];
        setContracts(typedData);
        
        // Determine if contracts were uploaded/processed together
        // by checking their updated_at timestamps
        if (typedData.length > 1) {
          // Set the most recent upload date as reference
          setLastUploadDate(typedData[0].updated_at || typedData[0].created_at);
          
          // Check if multiple contracts were uploaded in the same batch
          const recentTime = new Date(typedData[0].updated_at || typedData[0].created_at).getTime();
          const multipleRecentUploads = typedData.filter(contract => {
            const contractTime = new Date(contract.updated_at || contract.created_at).getTime();
            // Consider documents updated within 10 minutes of each other as part of the same batch
            return Math.abs(recentTime - contractTime) < 10 * 60 * 1000;
          }).length > 1;
          
          setShowConsolidated(multipleRecentUploads);
          
          // Create consolidated obligations list from all contracts
          const allObligations: ConsolidatedObligation[] = [];
          
          typedData.forEach(contract => {
            if (contract.analysis_results && Array.isArray(contract.analysis_results)) {
              contract.analysis_results.forEach(obligation => {
                allObligations.push({
                  ...obligation,
                  documentId: contract.id,
                  documentName: contract.filename
                });
              });
            }
          });
          
          // Sort by due date (nulls last)
          const sortedObligations = allObligations.sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          });
          
          setConsolidatedObligations(sortedObligations);
        } else {
          setShowConsolidated(false);
        }
      } else {
        setContracts([]);
        setShowConsolidated(false);
      }
    } catch (error: any) {
      console.error('Error fetching contracts:', error);
      toast({
        title: "Error",
        description: "Failed to load obligations data: " + error.message,
        variant: "destructive",
      });
      setContracts([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, toast, isPolling]);
  
  // Initial fetch
  useEffect(() => {
    if (user) {
      fetchContracts();
    }
  }, [user, fetchContracts]);
  
  // Setup polling if there are pending documents
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    if (isPolling && user) {
      intervalId = setInterval(() => {
        console.log('Polling for document updates...');
        fetchContracts();
      }, 10000); // Poll every 10 seconds
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPolling, user, fetchContracts]);
  
  // Notify user when pending documents are completed
  useEffect(() => {
    if (pendingDocuments === 0 && isPolling) {
      toast({
        title: "Processing Complete",
        description: "Your contracts have been analyzed and are now available.",
      });
      setIsPolling(false);
    }
  }, [pendingDocuments, isPolling, toast]);

  // Format the date for display
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'No date';
    
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  };

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
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-px4-navy">Your Contract Obligations</h1>
            <p className="mt-3 text-gray-600">
              Review all obligations extracted from your contracts
            </p>
            {pendingDocuments > 0 && (
              <div className="mt-4 bg-blue-50 text-blue-700 p-4 rounded-md inline-flex items-center">
                <div className="animate-spin h-5 w-5 border-2 border-blue-700 border-t-transparent rounded-full mr-3"></div>
                <span>
                  Processing {pendingDocuments} document{pendingDocuments !== 1 ? 's' : ''}...
                  This may take a few minutes.
                </span>
              </div>
            )}
          </div>
          
          {contracts.length === 0 ? (
            <Card className="bg-white">
              <CardContent className="pt-6 flex flex-col items-center justify-center p-10 text-center">
                <div className="rounded-full bg-gray-100 p-3 mb-4">
                  {pendingDocuments > 0 ? (
                    <div className="h-8 w-8 animate-spin border-4 border-blue-500 border-t-transparent rounded-full" />
                  ) : (
                    <FileText className="h-8 w-8 text-gray-400" />
                  )}
                </div>
                <h3 className="text-lg font-medium mb-2">
                  {pendingDocuments > 0 
                    ? "Documents Being Processed" 
                    : "No Analyzed Contracts"}
                </h3>
                <p className="text-gray-500 mb-6">
                  {pendingDocuments > 0 
                    ? `${pendingDocuments} document${pendingDocuments !== 1 ? 's are' : ' is'} currently being processed. This page will automatically update when they're ready.`
                    : "You don't have any analyzed contracts yet."}
                </p>
                <button 
                  onClick={() => navigate('/upload')}
                  className="bg-px4-teal hover:bg-px4-teal/90 text-white px-4 py-2 rounded-md"
                >
                  {pendingDocuments > 0 ? "Upload More Contracts" : "Upload Contracts"}
                </button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {showConsolidated && (
                <Tabs defaultValue="consolidated" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="consolidated" className="flex items-center">
                      <Table className="h-4 w-4 mr-2" />
                      Obligation Register
                    </TabsTrigger>
                    <TabsTrigger value="individual" className="flex items-center">
                      <BookOpen className="h-4 w-4 mr-2" />
                      Individual Contracts
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* Consolidated view of all obligations */}
                  <TabsContent value="consolidated">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-xl text-px4-navy">
                          Consolidated Obligation Register
                        </CardTitle>
                        <CardDescription>
                          Showing all obligations from your contracts, ordered by due date
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {consolidatedObligations.length === 0 ? (
                          <div className="py-4 text-center">
                            <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                            <p className="text-gray-500">No obligations were found in any of your contracts.</p>
                          </div>
                        ) : (
                          <UITable>
                            <TableCaption>A list of all your contract obligations.</TableCaption>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Obligation</TableHead>
                                <TableHead>Source Document</TableHead>
                                <TableHead>Section</TableHead>
                                <TableHead>Due Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {consolidatedObligations.map((obligation, index) => (
                                <TableRow key={index}>
                                  <TableCell className="font-medium">{obligation.obligation}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center">
                                      <FileText className="h-4 w-4 mr-1 text-gray-400" />
                                      {obligation.documentName}
                                    </div>
                                  </TableCell>
                                  <TableCell>{obligation.section || "N/A"}</TableCell>
                                  <TableCell>
                                    {obligation.dueDate ? (
                                      <div className="flex items-center text-sm">
                                        <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                                        {formatDate(obligation.dueDate)}
                                      </div>
                                    ) : (
                                      <span className="text-gray-500">No due date</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </UITable>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                  
                  {/* Individual contracts view */}
                  <TabsContent value="individual">
                    <div className="space-y-6">
                      {/* Individual contracts list - reusing existing code */}
                      {contracts.map((contract) => (
                        <SingleContractCard 
                          key={contract.id} 
                          contract={contract} 
                          formatDate={formatDate}
                        />
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              )}
              
              {/* If not showing consolidated view, show individual contracts */}
              {!showConsolidated && (
                <div className="space-y-6">
                  {contracts.map((contract) => (
                    <SingleContractCard 
                      key={contract.id} 
                      contract={contract} 
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

// Extracted component for single contract display
const SingleContractCard: React.FC<{
  contract: ContractObligations;
  formatDate: (date: string | null | undefined) => string;
}> = ({ contract, formatDate }) => {
  return (
    <Card className="bg-white shadow-sm">
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
            {contract.analysis_results.map((obligation, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="hover:bg-gray-50 px-4 py-3 rounded-md">
                  <div className="text-left w-full">
                    <div className="flex justify-between items-start w-full pr-4">
                      <span className="font-medium">{obligation.obligation.substring(0, 80)}{obligation.obligation.length > 80 ? '...' : ''}</span>
                      {obligation.dueDate && (
                        <Badge variant="outline" className="ml-2 bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
                          Due: {formatDate(obligation.dueDate)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pt-2 pb-4">
                  <div className="space-y-3">
                    <p className="text-gray-700">{obligation.obligation}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {obligation.section && (
                        <div className="flex items-center text-sm text-gray-500">
                          <Tag className="h-3.5 w-3.5 mr-1" />
                          <span>Section: {obligation.section}</span>
                        </div>
                      )}
                      
                      {obligation.dueDate && (
                        <div className="flex items-center text-sm text-gray-500">
                          <Clock className="h-3.5 w-3.5 mr-1" />
                          <span>Due date: {formatDate(obligation.dueDate)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};

export default ObligationsPage;
