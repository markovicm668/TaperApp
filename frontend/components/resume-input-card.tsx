'use client';

import { useState, useCallback, useRef } from 'react';
import { Check, Clipboard, FileText, FileUp, Sparkles, Upload, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { sampleResume } from '@/lib/api';
import { AdminOnly } from '@/components/admin-only';

type InputTab = 'text' | 'pdf';

const MAX_PDF_SIZE = 5 * 1024 * 1024;

interface ResumeInputCardProps {
  onResumeChange: (data: { type: 'file' | 'text' | 'linkedin'; content: string; fileName?: string; file?: File } | null) => void;
  hideSampleButton?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeInputCard({ onResumeChange, hideSampleButton = false }: ResumeInputCardProps) {
  const [activeTab, setActiveTab] = useState<InputTab>('pdf');
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

  const wordCount = pastedText.trim() ? pastedText.trim().split(/\s+/).length : 0;

  return (
    <Card className="flex h-full flex-col gap-0 overflow-hidden rounded-[18px] border-border/85 bg-card py-0 shadow-[0_1px_1px_rgba(15,23,42,0.04),0_14px_36px_rgba(15,23,42,0.04)]">
      <CardHeader className="px-5 pb-4 pt-5 sm:px-[22px] sm:pt-[22px]">
        <div className="mb-3.5 flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] border border-primary/20 bg-gradient-to-b from-primary/10 to-primary/5 text-primary">
              <FileText className="h-[15px] w-[15px]" />
            </span>
            <div className="leading-tight">
              <div className="text-[17px] font-semibold tracking-[-0.015em] text-foreground">
                Resume
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Upload a PDF or paste text.
              </div>
            </div>
          </div>
          {activeTab === 'text' && !hideSampleButton && (
            <AdminOnly>
              <Button
                variant="quiet"
                size="sm"
                onClick={insertSampleResume}
                className="h-7 gap-1.5 whitespace-nowrap rounded-[7px] border border-primary/15 bg-primary/[0.08] px-2.5 text-[12px] font-medium text-primary hover:bg-primary/[0.15]"
              >
                <Sparkles className="h-3 w-3" />
                Use sample
              </Button>
            </AdminOnly>
          )}
        </div>

        {/* Tab toggle */}
        <div className="flex gap-0.5 rounded-[10px] border border-border bg-muted/60 p-[3px]">
          <button
            type="button"
            onClick={() => switchTab('pdf')}
            className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-medium transition-colors ${
              activeTab === 'pdf'
                ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.07)]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Upload className="h-3 w-3" />
            Upload PDF
          </button>
          <button
            type="button"
            onClick={() => switchTab('text')}
            className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-medium transition-colors ${
              activeTab === 'text'
                ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.07)]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clipboard className="h-3 w-3" />
            Paste text
          </button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col px-5 pb-5 sm:px-[22px] sm:pb-[22px]">
        {activeTab === 'text' ? (
          <div className="flex flex-1 flex-col">
            <textarea
              id="resume-text"
              placeholder="Maya Kowalski&#10;Senior Frontend Engineer&#10;&#10;Experience&#10;Acme Corp — Senior Frontend Engineer (2022–Present)&#10;• Built new features for the web app using React…"
              className="min-h-[300px] w-full flex-1 resize-none rounded-xl border border-border/70 bg-muted/55 px-4 py-3.5 text-[13.5px] leading-[1.65] text-foreground outline-none transition-all placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-[3px] focus:ring-primary/15"
              value={pastedText}
              onChange={e => handlePastedTextChange(e.target.value)}
            />
            <div className="mt-2.5 flex items-center justify-between px-1 text-[11.5px] text-muted-foreground/80">
              <span>Paste your full resume text — every section helps.</span>
              <span className="font-medium tabular-nums">
                {pastedText.length.toLocaleString()} chars · {wordCount} words
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
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
                className={`flex min-h-[300px] flex-1 cursor-pointer flex-col items-center justify-center rounded-[14px] border-[1.5px] border-dashed bg-muted/55 px-5 text-center transition-colors ${
                  dragOver
                    ? 'border-primary bg-primary/[0.05]'
                    : 'border-border hover:border-primary/40'
                }`}
              >
                <span className="mb-3.5 inline-flex h-14 w-14 items-center justify-center rounded-[14px] border border-border bg-card text-primary shadow-[0_4px_12px_rgba(15,23,42,0.04)]">
                  <FileUp className="h-[26px] w-[26px]" />
                </span>
                <p className="text-[15px] font-semibold text-foreground">
                  Drop your PDF here
                </p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  or <span className="font-semibold text-primary">browse files</span> · max 5 MB · single page recommended
                </p>
                <div className="mt-3.5 flex items-center justify-center gap-3.5 text-[11px] text-muted-foreground/80">
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-2.5 w-2.5 text-success" strokeWidth={2.5} />
                    Text-extractable PDFs
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-2.5 w-2.5 text-success" strokeWidth={2.5} />
                    Encrypted in transit
                  </span>
                </div>
              </div>
            )}

            {fileError && (
              <p className="mt-2 text-sm text-destructive">{fileError}</p>
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
