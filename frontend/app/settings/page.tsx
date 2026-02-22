'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

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
