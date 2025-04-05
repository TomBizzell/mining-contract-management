import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from '@/components/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  AlertCircle, 
  FileCheck, 
  Clock, 
  Loader2, 
  ExternalLink, 
  Calendar, 
  Plus,
  CheckCircle,
  XCircle,
  UserCircle
} from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Define interfaces
interface Document {
  id: string;
  user_id: string;
  filename: string;
  file_path: string;
  file_size: number;
  party: string;
  status: string;
  created_at: string;
  updated_at?: string;
  openai_file_id?: string | null;
  analysis_results?: any[] | null;
  error?: string | null;
}

const DocumentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPolling, setIsPolling] = useState(false);
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

  // Fetch all documents for the user
  const fetchDocuments = useCallback(async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      
      console.log("Fetching all documents for user:", user.id);
      
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('Database error fetching documents:', error);
        throw error;
      }
      
      // Log the full response for debugging
      console.log("Received documents from database:", data);
      
      if (data) {
        setDocuments(data);
        
        // Check if there are any pending or processing documents
        const hasPendingDocuments = data.some(doc => 
          doc.status === 'pending' || doc.status === 'processing'
        );
        
        // Start or stop polling based on document status
        if (hasPendingDocuments && !isPolling) {
          setIsPolling(true);
        } else if (!hasPendingDocuments && isPolling) {
          setIsPolling(false);
        }
      } else {
        setDocuments([]);
        setIsPolling(false);
      }
    } catch (error: any) {
      console.error('Error fetching documents:', error);
      toast({
        title: "Error",
        description: "Failed to load documents: " + error.message,
        variant: "destructive",
      });
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, [user, toast, isPolling]);
  
  // Initial fetch
  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [user, fetchDocuments]);
  
  // Setup polling if there are pending documents
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    if (isPolling && user) {
      intervalId = setInterval(() => {
        console.log('Polling for document updates...');
        fetchDocuments();
      }, 10000); // Poll every 10 seconds
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPolling, user, fetchDocuments]);

  // Format the date for display
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };
  
  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
            <Clock className="h-3.5 w-3.5 mr-1" />
            Pending
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-300">
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            Processing
          </Badge>
        );
      case 'analyzed':
        return (
          <Badge className="bg-green-100 text-green-800 border-green-300">
            <CheckCircle className="h-3.5 w-3.5 mr-1" />
            Analyzed
          </Badge>
        );
      case 'error':
        return (
          <Badge className="bg-red-100 text-red-800 border-red-300">
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge className="bg-gray-100 text-gray-800 border-gray-300">
            {status}
          </Badge>
        );
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
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-px4-navy">My Documents</h1>
              <p className="mt-2 text-gray-600">
                View and manage all your uploaded contracts
              </p>
            </div>
            <div className="mt-4 md:mt-0">
              <Button 
                onClick={() => navigate('/upload')}
                className="bg-px4-teal hover:bg-px4-teal/90 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Upload New Contract
              </Button>
            </div>
          </div>
          
          {documents.length === 0 ? (
            <Card className="bg-white">
              <CardContent className="pt-6 flex flex-col items-center justify-center p-10 text-center">
                <div className="rounded-full bg-gray-100 p-3 mb-4">
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium mb-2">No Documents Yet</h3>
                <p className="text-gray-500 mb-6">You haven't uploaded any contracts yet.</p>
                <Button 
                  onClick={() => navigate('/upload')}
                  className="bg-px4-teal hover:bg-px4-teal/90 text-white"
                >
                  Upload Your First Contract
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>All Documents</CardTitle>
                <CardDescription>
                  {documents.length} document{documents.length !== 1 ? 's' : ''} in total
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id} className="group hover:bg-gray-50">
                        <TableCell className="font-medium">
                          <div className="flex items-center">
                            <FileText className="h-4 w-4 mr-2 text-gray-400" />
                            <span>{doc.filename}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <UserCircle className="h-4 w-4 mr-1 text-gray-400" />
                            {doc.party}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(doc.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Calendar className="h-4 w-4 mr-1 text-gray-400" />
                            {formatDate(doc.created_at)}
                          </div>
                        </TableCell>
                        <TableCell>{formatFileSize(doc.file_size)}</TableCell>
                        <TableCell className="text-right">
                          {doc.status === 'analyzed' ? (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => navigate('/obligations')}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <FileCheck className="h-4 w-4 mr-1" />
                              View Obligations
                            </Button>
                          ) : doc.status === 'error' ? (
                            <div className="text-red-500 text-sm">
                              <AlertCircle className="h-4 w-4 inline mr-1" />
                              Processing failed
                            </div>
                          ) : (
                            <div className="text-gray-500 text-sm">
                              {doc.status === 'pending' ? 'Awaiting processing' : 'Being processed...'}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          
          <div className="mt-8 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold text-px4-navy mb-4">About Document Processing</h2>
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <Clock className="h-5 w-5 text-yellow-500" />
                </div>
                <div className="ml-3">
                  <h3 className="text-base font-medium">Pending</h3>
                  <p className="text-sm text-gray-600">
                    Document has been uploaded and is waiting to be processed.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <Loader2 className="h-5 w-5 text-blue-500" />
                </div>
                <div className="ml-3">
                  <h3 className="text-base font-medium">Processing</h3>
                  <p className="text-sm text-gray-600">
                    Our AI is currently analyzing the document to extract obligations.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                <div className="ml-3">
                  <h3 className="text-base font-medium">Analyzed</h3>
                  <p className="text-sm text-gray-600">
                    Processing is complete and obligations have been extracted.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start">
                <div className="flex-shrink-0 mt-1">
                  <XCircle className="h-5 w-5 text-red-500" />
                </div>
                <div className="ml-3">
                  <h3 className="text-base font-medium">Error</h3>
                  <p className="text-sm text-gray-600">
                    There was an issue processing the document. Please try uploading it again.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default DocumentsPage; 