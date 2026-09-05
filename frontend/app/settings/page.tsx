'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, FileText, Loader2, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useTokens } from '@/lib/tokens/TokenContext';
import { PLAN_LABEL } from '@/lib/billing';
import { Input } from '@/components/ui/input';
import {
  deleteSavedResume,
  fetchPortalUrl,
  listSavedResumes,
  renameSavedResume,
} from '@/lib/api';
import type { SavedResumeSummary } from '@/lib/types';
import { track } from '@/lib/analytics';
import { UpgradePlansDialog } from '@/components/upgrade-plans-dialog';

function BillingCard() {
  const {
    tokensRemaining,
    plan,
    entitled,
    planExpiresAt,
    hasSubscription,
    subscriptionStatus,
  } = useTokens();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const handleManageSubscription = async () => {
    track('manage_subscription_clicked', { source: 'settings' });
    setPortalLoading(true);
    try {
      const { url } = await fetchPortalUrl();
      window.open(url, '_blank');
    } catch (err) {
      toast.error('Could not open the billing portal', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const expiryLabel = planExpiresAt
    ? new Date(planExpiresAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <Card className="border-border/80 bg-card/85">
      <CardHeader>
        <CardTitle>Billing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!entitled && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Free Plan</p>
                <p className="text-sm text-muted-foreground">{tokensRemaining} credits remaining</p>
              </div>
              <Button onClick={() => setUpgradeOpen(true)}>Upgrade</Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Upgrade for unlimited analyses, saves, and downloads.
            </p>
          </>
        )}

        {entitled && plan === 'lifetime' && (
          <div>
            <p className="text-sm font-medium">{PLAN_LABEL.lifetime}</p>
            <p className="text-sm text-muted-foreground">
              Lifetime access — pay once, yours forever. Unlimited everything.
            </p>
          </div>
        )}

        {entitled && plan && plan !== 'lifetime' && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{PLAN_LABEL[plan]}</p>
              {expiryLabel && (
                <p className="text-sm text-muted-foreground">
                  {subscriptionStatus === 'cancelled' ? 'Access until' : 'Renews'} {expiryLabel}
                </p>
              )}
            </div>
            {hasSubscription && (
              <Button variant="outline" disabled={portalLoading} onClick={handleManageSubscription}>
                {portalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Manage subscription
              </Button>
            )}
          </div>
        )}
      </CardContent>
      <UpgradePlansDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} source="settings" />
    </Card>
  );
}

// Mirrors MAX_SAVED_RESUMES in backend/services/savedResumeService.js.
const MAX_SAVED_RESUMES = 5;

function SavedResumesCard() {
  const [resumes, setResumes] = useState<SavedResumeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSavedResumes()
      .then(next => {
        if (!cancelled) setResumes(next);
      })
      .catch(err => {
        if (!cancelled) {
          toast.error('Could not load your saved resumes', {
            description: err instanceof Error ? err.message : undefined,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startEditing = useCallback((resume: SavedResumeSummary) => {
    setEditingId(resume.id);
    setDraftLabel(resume.label);
  }, []);

  const handleRename = useCallback(
    async (id: string) => {
      const label = draftLabel.trim();
      if (!label) {
        toast.error('Name cannot be empty');
        return;
      }

      setBusyId(id);
      try {
        const updated = await renameSavedResume(id, label);
        setResumes(prev => prev.map(r => (r.id === id ? updated : r)));
        setEditingId(null);
        track('saved_resume_renamed', { source: 'settings' });
      } catch (err) {
        toast.error('Could not rename that resume', {
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        setBusyId(null);
      }
    },
    [draftLabel]
  );

  const handleDelete = useCallback(async (resume: SavedResumeSummary) => {
    if (!window.confirm(`Delete "${resume.label}"? This can't be undone.`)) return;

    setBusyId(resume.id);
    try {
      await deleteSavedResume(resume.id);
      setResumes(prev => prev.filter(r => r.id !== resume.id));
      track('saved_resume_deleted', { source: 'settings' });
      toast.success('Saved resume deleted');
    } catch (err) {
      toast.error('Could not delete that resume', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <Card className="border-border/80 bg-card/85">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Saved Resumes</CardTitle>
        {!loading && (
          <span className="text-sm text-muted-foreground tabular-nums">
            {resumes.length} of {MAX_SAVED_RESUMES} saved
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : resumes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You haven&apos;t saved any resumes yet. When you upload one on the Analyze page,
            turn on <span className="font-medium text-foreground">Save this resume for future
            analyses</span> to reuse it later without re-uploading.
          </p>
        ) : (
          <ul className="divide-y divide-border/70 rounded-lg border border-border/70">
            {resumes.map(resume => (
              <li key={resume.id} className="flex items-center gap-3 px-3.5 py-3">
                <FileText className="h-4 w-4 flex-shrink-0 text-primary" />
                {editingId === resume.id ? (
                  <>
                    <Input
                      value={draftLabel}
                      onChange={e => setDraftLabel(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void handleRename(resume.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="h-8 flex-1"
                      autoFocus
                      aria-label="Resume name"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => void handleRename(resume.id)}
                      disabled={busyId === resume.id}
                      aria-label="Save name"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setEditingId(null)}
                      aria-label="Cancel rename"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1 leading-tight">
                      <p className="truncate text-sm font-medium text-foreground">{resume.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {resume.wordCount.toLocaleString()} words
                        {resume.createdAt
                          ? ` · saved ${new Date(resume.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}`
                          : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => startEditing(resume)}
                      aria-label={`Rename ${resume.label}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => void handleDelete(resume)}
                      disabled={busyId === resume.id}
                      aria-label={`Delete ${resume.label}`}
                    >
                      {busyId === resume.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  // Mock state for settings
  const [strictAtsMode, setStrictAtsMode] = useState(true);
  const [notifications, setNotifications] = useState(true);

  return (
    <div className="mx-auto w-full max-w-[980px] space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">Preferences</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your application preferences and configuration.</p>
      </div>

      <BillingCard />

      <SavedResumesCard />

      <Card className="border-border/80 bg-card/85">
        <CardHeader>
          <CardTitle>Analysis Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="strict-ats-mode">Strict ATS Mode</Label>
            <Switch
              id="strict-ats-mode"
              checked={strictAtsMode}
              onCheckedChange={setStrictAtsMode}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Enabling this mode enforces stricter ATS compliance checks, prioritizing keyword exactness over semantic relevance.
          </p>
        </CardContent>
      </Card>
      
      <Card className="border-border/80 bg-card/85">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="notifications">Receive Email Notifications</Label>
            <Switch
              id="notifications"
              checked={notifications}
              onCheckedChange={setNotifications}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Get updates on new features, analysis completion, and credit low-balance warnings.
          </p>
        </CardContent>
      </Card>
      
      <div className="flex justify-end">
        <Button>Save Settings</Button>
      </div>
    </div>
  );
}
