import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FileText, ArrowRight } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import DropZone from '@/components/DropZone';
import { useAuth } from '@/components/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

const Upload: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [party, setParty] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({});
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

  const handleFilesAdded = (newFiles: File[]) => {
    setFiles(prevFiles => [...prevFiles, ...newFiles]);
  };

  const uploadFileToSupabase = async (file: File, userId: string): Promise<{ path: string, size: number } | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${userId}/${uuidv4()}.${fileExt}`;
      
      // Track upload progress manually instead of using onUploadProgress
      setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
      
      const { error: uploadError, data } = await supabase.storage
        .from('contracts')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }
      
      // Set progress to 100% when upload is complete
      setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
      
      return { path: filePath, size: file.size };
    } catch (error: any) {
      console.error('Error uploading file:', error);
      toast({
        title: "Upload error",
        description: `Failed to upload ${file.name}: ${error.message}`,
        variant: "destructive",
      });
      return null;
    }
  };

  const saveDocumentToDatabase = async (
    userId: string, 
    fileName: string, 
    filePath: string, 
    fileSize: number,
    partyValue: string
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('documents')
        .insert({
          user_id: userId,
          filename: fileName,
          file_path: filePath,
          file_size: fileSize,
          party: partyValue,
          status: 'pending'
        });

      if (error) {
        throw error;
      }
    } catch (error: any) {
      console.error('Error saving document to database:', error);
      toast({
        title: "Database error",
        description: `Failed to save document metadata: ${error.message}`,
        variant: "destructive",
      });
      return false;
    }
    
    return true;
  };

  const processDocuments = async (): Promise<boolean> => {
    try {
      console.log("Triggering process-documents edge function");
      
      // Trigger the edge function to process documents
      const { data, error } = await supabase.functions.invoke('process-documents', {
        method: 'POST',
        body: { userId: user?.id }
      });

      if (error) {
        console.error("Error from process-documents:", error);
        throw error;
      }

      console.log("Successfully invoked process-documents function:", data);
      return true;
    } catch (error: any) {
      console.error('Error processing documents:', error);
      toast({
        title: "Processing error",
        description: `Failed to process documents with OpenAI: ${error.message}`,
        variant: "destructive",
      });
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please upload at least one contract.",
        variant: "destructive",
      });
      return;
    }
    
    if (!party.trim()) {
      toast({
        title: "Party information missing",
        description: "Please specify which party you represent.",
        variant: "destructive",
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: "Authentication required",
        description: "Please sign in to upload contracts.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    // Initialize progress tracking
    const initialProgress = {};
    files.forEach(file => {
      initialProgress[file.name] = 0;
    });
    setUploadProgress(initialProgress);
    
    // Upload each file to storage and save metadata
    let allUploadsSuccessful = true;
    for (const file of files) {
      const uploadResult = await uploadFileToSupabase(file, user.id);
      
      if (!uploadResult) {
        allUploadsSuccessful = false;
        continue;
      }
      
      const dbSaveResult = await saveDocumentToDatabase(
        user.id,
        file.name,
        uploadResult.path,
        uploadResult.size,
        party
      );
      
      if (!dbSaveResult) {
        allUploadsSuccessful = false;
      }
    }
    
    if (allUploadsSuccessful) {
      // Trigger processing on the server side
      await processDocuments();
      
      toast({
        title: "Upload successful",
        description: "Your contracts have been uploaded and are being processed.",
      });
      
      // Reset form
      setFiles([]);
      setParty('');
    }
    
    setIsLoading(false);
  };

  // If still loading auth state, show loading indicator
  if (loading) {
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
            <h1 className="text-3xl font-bold text-px4-navy">Upload Your Contracts</h1>
            <p className="mt-3 text-gray-600">
              Upload your contracts and specify which party you represent to generate your obligations registry.
            </p>
          </div>
          
          <Card className="bg-white shadow-sm animate-fade-in">
            <CardHeader>
              <CardTitle className="flex items-center text-px4-navy">
                <FileText className="h-5 w-5 mr-2 text-px4-teal" />
                Contract Upload
              </CardTitle>
              <CardDescription>
                Upload PDF contracts to extract your obligations
              </CardDescription>
            </CardHeader>
            
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-6">
                <div>
                  <DropZone
                    onFilesAdded={handleFilesAdded}
                    files={files}
                    setFiles={setFiles}
                  />
                </div>
                
                <div className="space-y-3">
                  <Label htmlFor="party-input">Which party do you represent?</Label>
                  <Input
                    id="party-input"
                    type="text"
                    value={party}
                    onChange={(e) => setParty(e.target.value)}
                    placeholder="Enter the name of your party (e.g., Company Name, LLC)"
                    className="w-full"
                  />
                </div>
              </CardContent>
              
              <CardFooter className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={isLoading}
                  className="bg-px4-teal hover:bg-px4-teal/90 text-white"
                >
                  {isLoading ? (
                    <span className="flex items-center">
                      Processing...
                      <span className="ml-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                    </span>
                  ) : (
                    <span className="flex items-center">
                      Submit
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </span>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
          
          <div className="mt-8 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h2 className="text-xl font-semibold text-px4-navy mb-4">What happens next?</h2>
            <ol className="space-y-3 list-decimal list-inside text-gray-700">
              <li>Our AI engine will process your uploaded contracts</li>
              <li>The system will extract all obligations relevant to your party</li>
              <li>You'll receive a structured registry of obligations categorized by type, due date, and priority</li>
              <li>You can export the registry, set up reminders, or integrate with your existing systems</li>
            </ol>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Upload;
