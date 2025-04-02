
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from "@/components/ui/use-toast";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, ArrowRight } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import DropZone from '@/components/DropZone';
import { useAuth } from '@/components/AuthContext';

const Upload: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [party, setParty] = useState<string>('');
  const [customParty, setCustomParty] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
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
    
    if (!party) {
      toast({
        title: "Party information missing",
        description: "Please specify which party you represent.",
        variant: "destructive",
      });
      return;
    }

    // This would be where we'd actually process the files
    // For now, we'll just simulate a loading state and success
    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      toast({
        title: "Upload successful",
        description: "Your contracts have been uploaded and are being processed.",
      });
      
      // In a real application, we would redirect to a results page
      // or show the analysis results here
    }, 2000);
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
                  <Label htmlFor="party-select">Which party do you represent?</Label>
                  <Select value={party} onValueChange={setParty}>
                    <SelectTrigger id="party-select" className="w-full">
                      <SelectValue placeholder="Select your party" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first-party">First Party (Seller/Licensor)</SelectItem>
                      <SelectItem value="second-party">Second Party (Buyer/Licensee)</SelectItem>
                      <SelectItem value="custom">Other (specify)</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {party === 'custom' && (
                    <div className="mt-3">
                      <Label htmlFor="custom-party">Specify party name</Label>
                      <Input
                        id="custom-party"
                        value={customParty}
                        onChange={(e) => setCustomParty(e.target.value)}
                        placeholder="Enter the name of your party"
                        className="mt-1"
                      />
                    </div>
                  )}
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
