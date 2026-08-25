'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Globe, ArrowRight, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

const ORG_TYPES = [
  'Government / ISRO',
  'Research Institution',
  'Academic',
  'Commercial / Enterprise',
  'Individual Analyst',
];

export default function WorkspaceSetupPage() {
  const router = useRouter();
  const { user, setActiveWorkspace } = useAuth();

  const [name, setName] = useState('ISRO SAC Workspace');
  const [orgType, setOrgType] = useState('Government / ISRO');
  const [defaultRegion, setDefaultRegion] = useState('India (South Asia)');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    const newWs = {
      id: `ws_${Date.now()}`,
      name: name.trim(),
      orgType,
      defaultRegion: defaultRegion.trim() || 'Global',
    };

    setActiveWorkspace(newWs);
    setLoading(false);
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg bg-card border-border shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-brand-500/20 flex items-center justify-center mb-3">
            <Building2 className="w-6 h-6 text-brand-500" />
          </div>
          <CardTitle className="text-xl font-bold">Workspace Setup</CardTitle>
          <CardDescription className="text-xs">
            Every scene, query, and trace is scoped to a workspace (PRD §5.3)
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Workspace Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. ISRO SAC Evaluation Workspace"
                required
                className="w-full h-10 px-3 rounded-md bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Organisation Type</label>
              <select
                value={orgType}
                onChange={(e) => setOrgType(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-secondary/50 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {ORG_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Default AOI Region (Optional)</label>
              <div className="relative">
                <Globe className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                <input
                  type="text"
                  value={defaultRegion}
                  onChange={(e) => setDefaultRegion(e.target.value)}
                  placeholder="e.g. India (South Asia)"
                  className="w-full h-10 pl-9 pr-3 rounded-md bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={loading || !name.trim()}
                className="w-full h-10 bg-brand-500 hover:bg-brand-600 text-white font-medium gap-2"
              >
                Complete Setup & Launch Dashboard
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
