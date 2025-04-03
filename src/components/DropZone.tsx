
import React, { useCallback, useState, useRef } from 'react';
import { useToast } from "@/components/ui/use-toast";
import { Upload, File, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DropZoneProps {
  onFilesAdded: (files: File[]) => void;
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
}

const DropZone: React.FC<DropZoneProps> = ({ onFilesAdded, files, setFiles }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    const pdfFiles = droppedFiles.filter(file => file.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      toast({
        title: "Invalid file type",
        description: "Only PDF files are accepted.",
        variant: "destructive"
      });
      return;
    }
    
    onFilesAdded(pdfFiles);
  }, [onFilesAdded, toast]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const pdfFiles = selectedFiles.filter(file => file.type === 'application/pdf');
      
      if (pdfFiles.length === 0) {
        toast({
          title: "Invalid file type",
          description: "Only PDF files are accepted.",
          variant: "destructive"
        });
        return;
      }
      
      onFilesAdded(pdfFiles);
    }
  }, [onFilesAdded, toast]);

  const handleBrowseClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const removeFile = (index: number) => {
    setFiles(prevFiles => prevFiles.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div 
        className={`border-2 border-dashed ${isDragging ? 'border-px4-teal bg-blue-50' : 'border-gray-300'} rounded-lg p-6 transition-colors`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center justify-center">
          <Upload className="h-10 w-10 text-px4-teal mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Drag and drop your contracts</h3>
          <p className="text-sm text-gray-500 mt-1">or</p>
          <div className="mt-4">
            <Button 
              type="button" 
              variant="outline" 
              className="mt-2"
              onClick={handleBrowseClick}
            >
              Browse Files
            </Button>
            <input
              ref={fileInputRef}
              id="file-upload"
              name="file-upload"
              type="file"
              className="sr-only"
              multiple={true}
              accept=".pdf"
              onChange={handleFileInput}
            />
          </div>
          <p className="text-xs text-gray-500 mt-4">Only PDF files are accepted</p>
        </div>
      </div>

      {files.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Uploaded Files:</h4>
          <ul className="space-y-2">
            {files.map((file, index) => (
              <li key={index} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                <div className="flex items-center">
                  <File className="h-5 w-5 text-px4-teal mr-2" />
                  <span className="text-sm text-gray-700 truncate max-w-xs">{file.name}</span>
                  <span className="text-xs text-gray-500 ml-2">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFile(index)}
                  className="text-gray-500 hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default DropZone;
