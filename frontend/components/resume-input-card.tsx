'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { BookmarkCheck, Check, Clipboard, FileText, FileUp, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getSavedResume, listSavedResumes, sampleResume } from '@/lib/api';
import { useAuth } from '@/lib/auth/useAuth';
import { track } from '@/lib/analytics';
import { AdminOnly } from '@/components/admin-only';
import type { ResumeInput, SavedResumeSummary } from '@/lib/types';

type InputTab = 'text' | 'pdf';

type ResumeChangePayload = ResumeInput | null;

const MAX_PDF_SIZE = 5 * 1024 * 1024;
// Mirrors MAX_SAVED_RESUMES in backend/services/savedResumeService.js. The
// server is the authority (it 409s past the cap); this only drives the hint.
const MAX_SAVED_RESUMES = 5;

interface ResumeInputCardProps {
  onResumeChange: (data: ResumeChangePayload) => void;
  hideSampleButton?: boolean;
  /** Tailwind min-height class for the input area (textarea / drop zone). */
  inputMinHeightClassName?: string;
}

const DEFAULT_TEXT_LABEL = 'My resume';

/** "Maya_Kowalski_2026.pdf" -> "Maya_Kowalski_2026" */
function defaultLabelFromFileName(fileName: string): string {
  return fileName.replace(/\.pdf$/i, '').trim() || DEFAULT_TEXT_LABEL;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeInputCard({
  onResumeChange,
  hideSampleButton = false,
  inputMinHeightClassName = 'min-h-[300px]',
}: ResumeInputCardProps) {
  const [activeTab, setActiveTab] = useState<InputTab>('pdf');
  const [pastedText, setPastedText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Saved resumes are a signed-in-only affordance. `user` is null for the
  // anonymous Firebase sessions the landing page mints (see AuthProvider), so
  // this whole block stays inert there without any extra prop threading.
  const { user } = useAuth();
  const [savedResumes, setSavedResumes] = useState<SavedResumeSummary[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(null);
  const [loadingSavedId, setLoadingSavedId] = useState<string | null>(null);
  // `saveLabel` doubles as the consent flag: non-null means the user confirmed
  // the save prompt, and it holds the name they chose.
  const [saveLabel, setSaveLabel] = useState<string | null>(null);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');

  const atSavedLimit = savedResumes.length >= MAX_SAVED_RESUMES;

  // Fire resume_uploaded from the single funnel here so every consumer (the
  // signed-in /analyze page and the guest landing page) emits it identically.
  // Deduped by input type + file name so paste keystrokes don't re-fire.
  const trackedResumeKeyRef = useRef<string | null>(null);
  const reportResume = useCallback(
    (data: ResumeChangePayload) => {
      onResumeChange(data);
      if (!data) {
        trackedResumeKeyRef.current = null;
        return;
      }
      const key = `${data.type}:${data.fileName ?? ''}:${data.savedResumeId ?? ''}`;
      if (trackedResumeKeyRef.current === key) return;
      trackedResumeKeyRef.current = key;
      track('resume_uploaded', {
        input_type: data.type,
        has_file: Boolean(data.file),
        file_name: data.fileName || null,
        char_count: data.content.length,
        from_saved_resume: Boolean(data.savedResumeId),
      });
    },
    [onResumeChange]
  );

  useEffect(() => {
    if (!user) {
      setSavedResumes([]);
      setSelectedSavedId(null);
      return;
    }

    let cancelled = false;
    listSavedResumes()
      .then(resumes => {
        if (!cancelled) setSavedResumes(resumes);
      })
      .catch(err => {
        // Non-fatal: the picker just stays hidden and upload still works.
        console.error('Failed to load saved resumes:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const handlePastedTextChange = useCallback(
    (text: string) => {
      setPastedText(text);
      setSelectedSavedId(null);
      if (text.trim()) {
        reportResume({
          type: 'text',
          content: text,
          saveForLater: saveLabel !== null,
          ...(saveLabel ? { saveLabel } : {}),
        });
      } else {
        reportResume(null);
      }
    },
    [reportResume, saveLabel]
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
      setSelectedSavedId(null);
      // A new file is a different resume, so any name chosen for the previous
      // one is dropped rather than silently reused.
      setSaveLabel(null);
      reportResume({ type: 'file', content: '', fileName: file.name, file });

      // Uploading is the discrete moment the prompt belongs to. Pasted text has
      // no such moment (it would fire mid-keystroke), so that path opens the
      // same dialog from the button below instead.
      if (user && !atSavedLimit) {
        setDraftLabel(defaultLabelFromFileName(file.name));
        setSavePromptOpen(true);
      }
    },
    [reportResume, user, atSavedLimit]
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
    setSaveLabel(null);
    reportResume(null);
  }, [reportResume]);

  // Picking a saved resume pulls its stored parse payload down with it. That
  // payload is what lets useAnalyzeFlow skip the /parse round-trip entirely.
  const handleSelectSaved = useCallback(
    async (id: string) => {
      setLoadingSavedId(id);
      setFileError(null);
      try {
        const detail = await getSavedResume(id);
        setSelectedSavedId(id);
        setSelectedFile(null);
        setPastedText('');
        setSaveLabel(null);
        reportResume({
          type: detail.inputType,
          content: detail.rawText,
          fileName: detail.fileName ?? undefined,
          savedResumeId: detail.id,
          ...(detail.parsed ? { parsed: detail.parsed } : {}),
        });
        track('saved_resume_used', { saved_resume_id: id, input_type: detail.inputType });
      } catch (err) {
        console.error('Failed to load saved resume:', err);
        setFileError('Could not load that saved resume. Please try again.');
      } finally {
        setLoadingSavedId(null);
      }
    },
    [reportResume]
  );

  const handleClearSaved = useCallback(() => {
    setSelectedSavedId(null);
    reportResume(null);
  }, [reportResume]);

  const openSavePrompt = useCallback(() => {
    setDraftLabel(
      saveLabel ??
        (selectedFile ? defaultLabelFromFileName(selectedFile.name) : DEFAULT_TEXT_LABEL)
    );
    setSavePromptOpen(true);
  }, [saveLabel, selectedFile]);

  // Re-report so the choice reaches the analyze flow immediately; the analytics
  // dedupe key is unchanged, so this never re-fires resume_uploaded.
  const reportWithSaveLabel = useCallback(
    (nextLabel: string | null) => {
      if (selectedFile) {
        reportResume({
          type: 'file',
          content: '',
          fileName: selectedFile.name,
          file: selectedFile,
          saveForLater: nextLabel !== null,
          ...(nextLabel ? { saveLabel: nextLabel } : {}),
        });
      } else if (pastedText.trim()) {
        reportResume({
          type: 'text',
          content: pastedText,
          saveForLater: nextLabel !== null,
          ...(nextLabel ? { saveLabel: nextLabel } : {}),
        });
      }
    },
    [reportResume, selectedFile, pastedText]
  );

  const handleConfirmSave = useCallback(() => {
    const label = draftLabel.trim();
    if (!label) return;
    setSaveLabel(label);
    setSavePromptOpen(false);
    reportWithSaveLabel(label);
  }, [draftLabel, reportWithSaveLabel]);

  const handleCancelSave = useCallback(() => {
    setSavePromptOpen(false);
  }, []);

  const handleUndoSave = useCallback(() => {
    setSaveLabel(null);
    reportWithSaveLabel(null);
  }, [reportWithSaveLabel]);

  const switchTab = useCallback(
    (tab: InputTab) => {
      setActiveTab(tab);
      setFileError(null);
      setSelectedSavedId(null);
      setSaveLabel(null);
      if (tab === 'text') {
        setSelectedFile(null);
        if (pastedText.trim()) {
          reportResume({ type: 'text', content: pastedText });
        } else {
          reportResume(null);
        }
      } else {
        setPastedText('');
        if (selectedFile) {
          reportResume({
            type: 'file',
            content: '',
            fileName: selectedFile.name,
            file: selectedFile,
          });
        } else {
          reportResume(null);
        }
      }
    },
    [reportResume, pastedText, selectedFile]
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

        {/* Saved resume picker — signed-in users with at least one saved resume */}
        {user && savedResumes.length > 0 && (
          <div className="mb-2.5 flex items-center gap-2">
            <span className="flex-shrink-0 text-[12px] font-medium text-muted-foreground">
              Use a saved resume
            </span>
            <Select value={selectedSavedId ?? ''} onValueChange={handleSelectSaved}>
              <SelectTrigger
                className="h-8 flex-1 rounded-[7px] border-border bg-muted/40 text-[12px]"
                aria-label="Use a saved resume"
              >
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {savedResumes.map(resume => (
                  <SelectItem key={resume.id} value={resume.id} className="text-[12px]">
                    {resume.label}
                    <span className="ml-2 text-muted-foreground">
                      {resume.wordCount.toLocaleString()} words
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingSavedId && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            {selectedSavedId && !loadingSavedId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSaved}
                className="h-8 w-8 flex-shrink-0 p-0"
                aria-label="Clear saved resume selection"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}

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
              className={`${inputMinHeightClassName} w-full flex-1 resize-none rounded-xl border border-border/70 bg-muted/55 px-4 py-3.5 text-[13.5px] leading-[1.65] text-foreground outline-none transition-all placeholder:text-muted-foreground/70 focus:border-primary focus:bg-card focus:ring-[3px] focus:ring-primary/15`}
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
                className={`flex ${inputMinHeightClassName} flex-1 cursor-pointer flex-col items-center justify-center rounded-[14px] border-[1.5px] border-dashed bg-muted/55 px-5 text-center transition-colors ${
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
                  or <span className="font-semibold text-primary">browse files</span> · max 5 MB
                </p>
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

        {/* Save-for-later, opt-in and signed-in only, and only for a freshly
            supplied resume — a saved one is already stored. The write itself
            happens after the parse step, so it costs no extra AI call. */}
        {user && !selectedSavedId && (selectedFile || pastedText.trim()) && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] border border-border/70 bg-muted/40 px-3.5 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <BookmarkCheck
                className={`h-4 w-4 flex-shrink-0 ${saveLabel ? 'text-primary' : 'text-muted-foreground'}`}
              />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[12.5px] font-medium text-foreground">
                  {saveLabel ? `Saving as "${saveLabel}"` : 'Save this resume for future analyses'}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {atSavedLimit
                    ? `You've saved ${MAX_SAVED_RESUMES} resumes — remove one in Settings to save another.`
                    : saveLabel
                      ? 'Stored when you run your analysis.'
                      : 'Reuse it next time without re-uploading. Free.'}
                </p>
              </div>
            </div>
            {saveLabel ? (
              <div className="flex flex-shrink-0 items-center gap-1">
                <Button variant="quiet" size="sm" onClick={openSavePrompt} className="h-7 text-[12px]">
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleUndoSave}
                  className="h-7 w-7 p-0"
                  aria-label="Don't save this resume"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={openSavePrompt}
                disabled={atSavedLimit}
                className="h-7 flex-shrink-0 text-[12px]"
              >
                Save
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={savePromptOpen} onOpenChange={setSavePromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save this resume?</DialogTitle>
            <DialogDescription>
              Give it a name so you can reuse it on future analyses without re-uploading.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="saved-resume-name">Name</Label>
            <Input
              id="saved-resume-name"
              value={draftLabel}
              onChange={e => setDraftLabel(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirmSave();
                }
              }}
              placeholder={DEFAULT_TEXT_LABEL}
              maxLength={80}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {savedResumes.length} of {MAX_SAVED_RESUMES} slots used.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={handleCancelSave}>
              Not now
            </Button>
            <Button onClick={handleConfirmSave} disabled={!draftLabel.trim()}>
              Save resume
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
