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
import { Calendar, Clock, FileText, AlertCircle, Tag, BookOpen, Table, Download } from 'lucide-react';
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
import { Button } from "@/components/ui/button";

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
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);

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
      setError(null);
      
      // Log user ID for debugging
      console.log("Fetching documents for user:", user.id);
      
      // Simplified query to just get all documents first
      const { data, error: fetchError } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id);
        
      if (fetchError) {
        console.error('Database error fetching documents:', fetchError);
        setError(`Error fetching documents: ${fetchError.message || 'Unknown error'}`);
        throw fetchError;
      }
      
      // Basic validation of data
      if (!data) {
        console.log("No data returned from Supabase");
        setContracts([]);
        setShowConsolidated(false);
        setIsLoading(false);
        return;
      }
      
      // Log raw data to debug
      console.log("Raw documents data:", data);
      
      // Count documents by status
      const statuses = data.reduce((acc: Record<string, number>, doc: any) => {
        const status = doc.status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      console.log("Document status counts:", statuses);
      
      // Simple filtering for pending documents (don't do complex filtering yet)
      const pendingDocs = data.filter((doc: any) => 
        doc.status === 'pending' || doc.status === 'processing'
      );
      
      // Update pending documents count
      const pendingCount = pendingDocs.length;
      setPendingDocuments(pendingCount);
      
      // Handle polling based on pending status
      if (pendingCount > 0 && !isPolling) {
        setIsPolling(true);
      } else if (pendingCount === 0) {
        setIsPolling(false);
      }
      
      // Now filter for analyzed documents
      const analyzedDocs = data.filter((doc: any) => doc.status === 'analyzed');
      console.log("Analyzed documents:", analyzedDocs);
      
      // Check if each analyzed doc has analysis_results
      analyzedDocs.forEach((doc: any) => {
        console.log(`Doc ${doc.id} analysis_results:`, doc.analysis_results);
        if (!doc.analysis_results) {
          console.warn(`Document ${doc.id} has status 'analyzed' but no analysis_results`);
        } else if (typeof doc.analysis_results === 'string') {
          // If it's a string, try to parse JSON
          try {
            const parsed = JSON.parse(doc.analysis_results);
            console.log(`Parsed analysis_results for ${doc.id}:`, parsed);
            doc.analysis_results = parsed;
          } catch (e) {
            console.warn(`Document ${doc.id} has analysis_results but it's not valid JSON:`, e);
          }
        } else if (!Array.isArray(doc.analysis_results)) {
          console.warn(`Document ${doc.id} has analysis_results but it's not an array:`, 
            typeof doc.analysis_results);
        }
      });
      
      // Filter to only the properly analyzed documents
      const validAnalyzedDocs = analyzedDocs.filter((doc: any) => {
        // Ensure analysis_results is an array (parsed from JSON if needed)
        if (typeof doc.analysis_results === 'string') {
          try {
            doc.analysis_results = JSON.parse(doc.analysis_results);
          } catch (e) {
            console.error(`Error parsing analysis_results for ${doc.id}:`, e);
            return false;
          }
        }
        
        return doc.analysis_results && Array.isArray(doc.analysis_results);
      });
      
      console.log("Valid analyzed documents:", validAnalyzedDocs);
      
      // Convert to our type
      const typedContracts: ContractObligations[] = validAnalyzedDocs.map((doc: any) => ({
        id: doc.id,
        filename: doc.filename,
        party: doc.party,
        status: doc.status,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        analysis_results: Array.isArray(doc.analysis_results) 
          ? doc.analysis_results 
          : typeof doc.analysis_results === 'string'
            ? JSON.parse(doc.analysis_results)
            : null
      }));
      
      // Update state with valid analyzed documents
      setContracts(typedContracts);
      
      // Handle consolidated view logic only if we have valid documents
      if (typedContracts.length > 1) {
        // Simplified consolidated logic
        const allObligations: ConsolidatedObligation[] = [];
        
        typedContracts.forEach(contract => {
          if (contract.analysis_results && Array.isArray(contract.analysis_results)) {
            contract.analysis_results.forEach(obligation => {
              try {
                // Safely handle potentially malformed obligation objects
                if (typeof obligation !== 'object' || obligation === null) {
                  console.warn(`Invalid obligation format in document ${contract.id}:`, obligation);
                  return; // Skip this obligation
                }
                
                // Make sure the obligation has the required properties
                if (!('obligation' in obligation) || typeof obligation.obligation !== 'string') {
                  console.warn(`Obligation missing required 'obligation' property in document ${contract.id}:`, obligation);
                  return; // Skip this obligation
                }
                
                // Add to consolidated list with safe defaults for missing properties
                allObligations.push({
                  ...obligation,
                  documentId: contract.id,
                  documentName: contract.filename,
                  // Ensure section is a string
                  section: typeof obligation.section === 'string' ? obligation.section : 'N/A',
                  // Check dueDate format
                  dueDate: isValidDate(obligation.dueDate) ? obligation.dueDate : null
                });
              } catch (err) {
                console.error(`Error processing obligation from ${contract.id}:`, err);
              }
            });
          }
        });
        
        console.log("All consolidated obligations:", allObligations);
        
        // Sort by due date (nulls last) safely
        const sortedObligations = [...allObligations].sort((a, b) => {
          // Handle null/invalid date cases
          if (!isValidDate(a.dueDate) && !isValidDate(b.dueDate)) return 0;
          if (!isValidDate(a.dueDate)) return 1; // a goes after b
          if (!isValidDate(b.dueDate)) return -1; // a goes before b
          
          try {
            // Safe comparison of valid dates
            const dateA = new Date(a.dueDate!).getTime();
            const dateB = new Date(b.dueDate!).getTime();
            return dateA - dateB;
          } catch (err) {
            console.error("Error comparing dates:", err);
            return 0; // Keep original order if comparison fails
          }
        });
        
        if (sortedObligations.length > 0) {
          setShowConsolidated(true);
          setConsolidatedObligations(sortedObligations);
        } else {
          setShowConsolidated(false);
        }
      } else {
        setShowConsolidated(false);
      }
    } catch (error: any) {
      console.error('Error in fetchContracts:', error);
      setError(`Error: ${error.message || 'Unknown error'}`);
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
  
  // Export obligations to webhook
  const exportObligations = async () => {
    if (!user || consolidatedObligations.length === 0) return;
    
    try {
      setIsExporting(true);
      setDocumentUrl(null);
      
      console.log("Exporting obligations to webhook");
      
      const { data, error } = await supabase.functions.invoke('export-obligations', {
        body: {
          obligations: consolidatedObligations,
          userId: user.id
        }
      });
      
      if (error) {
        throw new Error(`Error exporting obligations: ${error.message}`);
      }
      
      console.log("Export response:", data);
      
      if (data?.success && data.documentUrl) {
        setDocumentUrl(data.documentUrl);
        toast({
          title: "Export successful",
          description: "Your obligation register has been exported. Click the button to download.",
        });
      } else {
        throw new Error("Export failed: No document URL returned");
      }
    } catch (error: any) {
      console.error("Export error:", error);
      toast({
        title: "Export failed",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };
  
  // Open the document URL in a new tab
  const openDocumentUrl = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank');
    }
  };
  
  // Add debug mode
  const [showDebug, setShowDebug] = useState(false);
  
  // Toggle debug information
  const toggleDebug = () => {
    setShowDebug(!showDebug);
  };
  
  // Format debug data
  const formatDebugData = (data: any) => {
    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return 'Error formatting data: ' + e.message;
    }
  };
  
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

  // Helper to safely check if date is valid
  const isValidDate = (dateString: string | null | undefined): boolean => {
    if (!dateString) return false;
    try {
      const date = new Date(dateString);
      return !isNaN(date.getTime());
    } catch (e) {
      return false;
    }
  };

  // Format the date for display
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'No date';
    
    try {
      // Try to create a date object
      const date = new Date(dateString);
      
      // Check if date is valid (Invalid dates return NaN for getTime())
      if (isNaN(date.getTime())) {
        console.warn(`Invalid date format encountered: ${dateString}`);
        return 'Invalid date';
      }
      
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(date);
    } catch (err) {
      console.error(`Error formatting date "${dateString}":`, err);
      return 'Invalid date';
    }
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
            
            {/* Display any errors */}
            {error && (
              <div className="mt-4 bg-red-50 text-red-700 p-4 rounded-md">
                <AlertCircle className="h-5 w-5 inline-block mr-2" />
                <span>Error: {error}</span>
                <p className="mt-2 text-sm">
                  If this problem persists, please reload the page or contact support.
                  <Button 
                    variant="link" 
                    className="text-red-700 underline ml-2" 
                    onClick={fetchContracts}
                  >
                    Try Again
                  </Button>
                </p>
              </div>
            )}
            
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
                <Button 
                  onClick={() => navigate('/upload')}
                  className="bg-px4-teal hover:bg-px4-teal/90 text-white px-4 py-2 rounded-md"
                >
                  {pendingDocuments > 0 ? "Upload More Contracts" : "Upload Contracts"}
                </Button>
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
                        <CardTitle className="text-xl text-px4-navy flex justify-between items-center">
                          <span>Consolidated Obligation Register</span>
                          <div className="flex gap-2">
                            <Button
                              onClick={exportObligations}
                              disabled={isExporting || consolidatedObligations.length === 0}
                              className="bg-green-600 hover:bg-green-700 text-white"
                              size="sm"
                            >
                              {isExporting ? (
                                <><div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div> Exporting</>
                              ) : (
                                <>Export</>
                              )}
                            </Button>
                            {documentUrl && (
                              <Button
                                onClick={openDocumentUrl}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                size="sm"
                              >
                                <Download className="h-4 w-4 mr-1" /> Download
                              </Button>
                            )}
                          </div>
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
          
          {/* Debug Panel */}
          <div className="mt-12 text-right">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={toggleDebug} 
              className="text-gray-500"
            >
              {showDebug ? "Hide Debug Info" : "Show Debug Info"}
            </Button>
          </div>
          
          {showDebug && (
            <div className="mt-4 p-4 bg-gray-100 rounded-md border border-gray-300 text-left overflow-auto max-h-[500px]">
              <h3 className="text-lg font-semibold mb-2">Debug Information</h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium">User ID:</h4>
                  <pre className="bg-white p-2 rounded text-xs">{user?.id || 'No user'}</pre>
                </div>
                
                <div>
                  <h4 className="font-medium">Total Documents:</h4>
                  <pre className="bg-white p-2 rounded text-xs">{contracts.length}</pre>
                </div>
                
                <div>
                  <h4 className="font-medium">Pending Documents:</h4>
                  <pre className="bg-white p-2 rounded text-xs">{pendingDocuments}</pre>
                </div>
                
                <div>
                  <h4 className="font-medium">Error State:</h4>
                  <pre className="bg-white p-2 rounded text-xs">{error || 'No errors'}</pre>
                </div>
                
                <div>
                  <h4 className="font-medium">Documents Data (first 3):</h4>
                  <pre className="bg-white p-2 rounded text-xs overflow-auto">
                    {formatDebugData(contracts.slice(0, 3))}
                  </pre>
                </div>
                
                <div>
                  <h4 className="font-medium">Is Polling:</h4>
                  <pre className="bg-white p-2 rounded text-xs">{isPolling ? 'Yes' : 'No'}</pre>
                </div>
                
                <div>
                  <h4 className="font-medium">Export Status:</h4>
                  <pre className="bg-white p-2 rounded text-xs">{isExporting ? 'Exporting...' : 'Idle'}</pre>
                </div>
                
                <div>
                  <h4 className="font-medium">Document URL:</h4>
                  <pre className="bg-white p-2 rounded text-xs">{documentUrl || 'None'}</pre>
                </div>
                
                <Button 
                  variant="default"
                  size="sm"
                  onClick={fetchContracts}
                  className="mt-4"
                >
                  Refresh Data
                </Button>
              </div>
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
  // Handle possible malformed data
  let safeAnalysisResults: Obligation[] = [];
  
  if (contract.analysis_results && Array.isArray(contract.analysis_results)) {
    safeAnalysisResults = contract.analysis_results
      .filter(item => {
        // Verify each item is a valid obligation object
        if (!item || typeof item !== 'object') {
          console.warn(`Invalid obligation in contract ${contract.id}:`, item);
          return false;
        }
        
        // Make sure it has the required obligation field
        if (!('obligation' in item) || typeof item.obligation !== 'string') {
          console.warn(`Obligation missing required field in contract ${contract.id}:`, item);
          return false;
        }
        
        return true;
      })
      .map(item => ({
        // Ensure all fields have expected types
        obligation: String(item.obligation),
        section: typeof item.section === 'string' ? item.section : 'N/A',
        dueDate: item.dueDate ? item.dueDate : null
      }));
  }
  
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
          <Badge className="bg-green-50 text-green-700 border-green-200">
            Analyzed
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {safeAnalysisResults.length === 0 ? (
          <div className="py-4 text-center">
            <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
            <p className="text-gray-500">No obligations were found for this contract.</p>
          </div>
        ) : (
          <Accordion type="single" collapsible className="w-full">
            {safeAnalysisResults.map((obligation, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="hover:bg-gray-50 px-4 py-3 rounded-md">
                  <div className="text-left w-full">
                    <div className="flex justify-between items-start w-full pr-4">
                      <span className="font-medium">{obligation.obligation.substring(0, 80)}{obligation.obligation.length > 80 ? '...' : ''}</span>
                      {obligation.dueDate && (
                        <Badge className="ml-2 bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
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
