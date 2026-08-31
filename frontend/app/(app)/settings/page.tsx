'use client';

import { Settings, Shield, HardDrive, Database, Cpu } from 'lucide-react';
import TopNav from '@/components/layout/TopNav';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  return (
    <div className="w-full flex flex-col space-y-6">
      <TopNav breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Settings' }]} />

      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Settings className="w-5 h-5 text-brand-500" />
            Workspace Settings
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure system execution parameters and backend runtime switches (PRD §2.4)
          </p>
        </div>

        {/* Runtime Configuration Card */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Runtime Configuration</CardTitle>
            <CardDescription className="text-xs">
              Local-first development contract switches (`core/config.py`)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div>
                <p className="text-sm font-medium">Storage Backend</p>
                <p className="text-xs text-muted-foreground">`STORAGE_BACKEND` (local | gcs)</p>
              </div>
              <Badge variant="outline" className="bg-brand-500/10 text-brand-500 font-mono">
                LOCAL
              </Badge>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div>
                <p className="text-sm font-medium">Database Backend</p>
                <p className="text-xs text-muted-foreground">`DB_BACKEND` (sqlite | firestore)</p>
              </div>
              <Badge variant="outline" className="bg-brand-500/10 text-brand-500 font-mono">
                SQLITE
              </Badge>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div>
                <p className="text-sm font-medium">Planner Backend</p>
                <p className="text-xs text-muted-foreground">`PLANNER_BACKEND` (local | vertex)</p>
              </div>
              <Badge variant="outline" className="bg-brand-500/10 text-brand-500 font-mono">
                LOCAL (Rule-based)
              </Badge>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Offline Evaluation Mode</p>
                <p className="text-xs text-muted-foreground">`AUTH_DISABLED=true` (Zero external network calls)</p>
              </div>
              <Badge variant="outline" className="bg-confidence-high/10 text-confidence-high font-mono">
                ENABLED
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Workspace Info */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Workspace Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground">Workspace Name:</span>
              <span className="font-semibold text-foreground">ISRO SAC Evaluation Workspace</span>
            </div>
            <div className="flex justify-between py-1 border-b border-border/50">
              <span className="text-muted-foreground">Organisation Type:</span>
              <span className="font-semibold text-foreground">Government / ISRO</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Default AOI Region:</span>
              <span className="font-semibold text-foreground">India (South Asia)</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
