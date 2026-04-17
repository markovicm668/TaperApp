'use client';

import { useState, useCallback, useRef } from 'react';
import { FileText, Sparkles, FileUp, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { sampleResume } from '@/lib/api';
import { AdminOnly } from '@/components/admin-only';

type InputTab = 'text' | 'pdf';

const MAX_PDF_SIZE = 5 * 1024 * 1024;

interface ResumeInputCardProps {
  onResumeChange: (data: { type: 'file' | 'text' | 'linkedin'; content: string; fileName?: string; file?: File } | null) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeInputCard({ onResumeChange }: ResumeInputCardProps) {
  const [activeTab, setActiveTab] = useState<InputTab>('text');
  const [pastedText, setPastedText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePastedTextChange = useCallback(
    (text: string) => {
      setPastedText(text);
      if (text.trim()) {
        onResumeChange({ type: 'text', content: text });
      } else {
        onResumeChange(null);
      }
    },
    [onResumeChange]
  );

  const insertSampleResume = useCallback(() => {
    handlePastedTextChange(sampleResume);
  }, [handlePastedTextChange]);

  const validateAndSetFile = useCallback(
    (file: File) => {
      setFileError(null);

      if (file.type !== 'application/pdf') {
        setFileError('Please upload a PDF file.');
        return;
      }

      if (file.size > MAX_PDF_SIZE) {
        setFileError('File must be under 5 MB.');
        return;
      }

      setSelectedFile(file);
      onResumeChange({ type: 'file', content: '', fileName: file.name, file });
    },
    [onResumeChange]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndSetFile(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [validateAndSetFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) validateAndSetFile(file);
    },
    [validateAndSetFile]
  );

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setFileError(null);
    onResumeChange(null);
  }, [onResumeChange]);

  const switchTab = useCallback(
    (tab: InputTab) => {
      setActiveTab(tab);
      setFileError(null);
      if (tab === 'text') {
        setSelectedFile(null);
        if (pastedText.trim()) {
          onResumeChange({ type: 'text', content: pastedText });
        } else {
          onResumeChange(null);
        }
      } else {
        setPastedText('');
        if (selectedFile) {
          onResumeChange({ type: 'file', content: '', fileName: selectedFile.name, file: selectedFile });
        } else {
          onResumeChange(null);
        }
      }
    },
    [onResumeChange, pastedText, selectedFile]
  );

  return (
    <Card className="flex h-full flex-col border-border/85 bg-card/92 shadow-[0_1px_1px_rgba(15,23,42,0.05),0_10px_28px_rgba(15,23,42,0.035)]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </span>
              Resume
            </CardTitle>
            <CardDescription className="max-w-md leading-relaxed text-muted-foreground/95">
              Paste resume text or upload a PDF file.
            </CardDescription>
          </div>
          {activeTab === 'text' && (
            <AdminOnly>
              <Button
                variant="quiet"
                size="sm"
                onClick={insertSampleResume}
                className="gap-1.5 whitespace-nowrap"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Use Sample Resume
              </Button>
            </AdminOnly>
          )}
        </div>

        {/* Tab toggle */}
        <div className="mt-3 flex gap-1 rounded-lg border border-border/60 bg-muted/40 p-0.5">
          <button
            type="button"
            onClick={() => switchTab('text')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'text'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Paste Text
          </button>
          <button
            type="button"
            onClick={() => switchTab('pdf')}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'pdf'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Upload PDF
          </button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        {activeTab === 'text' ? (
          <div className="flex flex-1 flex-col space-y-2">
            <Label htmlFor="resume-text" className="text-sm font-semibold text-foreground/90">
              Resume Content
            </Label>
            <Textarea
              id="resume-text"
              placeholder="Paste your resume text here."
              className="min-h-[300px] flex-1 resize-none text-sm leading-relaxed"
              value={pastedText}
              onChange={e => handlePastedTextChange(e.target.value)}
            />
            <div className="flex justify-between text-xs text-muted-foreground/95">
              <span>Paste your full resume text</span>
              <span>{pastedText.length.toLocaleString()} characters</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col space-y-2">
            <Label className="text-sm font-semibold text-foreground/90">
              PDF File
            </Label>

            {selectedFile ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <FileUp className="h-5 w-5 text-primary" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFile}
                    className="ml-2 h-7 w-7 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`flex min-h-[300px] flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-colors ${
                  dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-border/60 hover:border-primary/40 hover:bg-muted/20'
                }`}
              >
                <FileUp className="h-10 w-10 text-muted-foreground/60" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground/80">
                    Drag and drop your PDF here
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    or click to browse (max 5 MB)
                  </p>
                </div>
              </div>
            )}

            {fileError && (
              <p className="text-sm text-destructive">{fileError}</p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
