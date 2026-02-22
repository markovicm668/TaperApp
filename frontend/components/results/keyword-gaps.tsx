'use client';

import { AlertCircle, AlertTriangle, Info, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { KeywordGap } from '@/lib/types';

interface KeywordGapsProps {
  gaps: KeywordGap[];
}

export function KeywordGaps({ gaps }: KeywordGapsProps) {
  const handleAddToResume = (keyword: string) => {
    toast.success(`Added "${keyword}" to clipboard`, {
      description: 'Paste it into your resume editor',
    });
  };

  const getImportanceIcon = (importance: KeywordGap['importance']) => {
    switch (importance) {
      case 'high':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'medium':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'low':
        return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getImportanceBadge = (importance: KeywordGap['importance']) => {
    return (
      <Badge
        variant="outline"
        className={cn(
          'text-xs',
          importance === 'high' && 'border-destructive/50 text-destructive',
          importance === 'medium' && 'border-warning/50 text-warning',
          importance === 'low' && 'border-muted-foreground/50 text-muted-foreground'
        )}
      >
        {importance === 'high' ? 'High Priority' : importance === 'medium' ? 'Medium' : 'Low'}
      </Badge>
    );
  };

  const groupedGaps = gaps.reduce(
    (acc, gap) => {
      if (!acc[gap.importance]) {
        acc[gap.importance] = [];
      }
      acc[gap.importance].push(gap);
      return acc;
    },
    {} as Record<string, KeywordGap[]>
  );

  const order: KeywordGap['importance'][] = ['high', 'medium', 'low'];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm">{groupedGaps.high?.length || 0} High</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span className="text-sm">{groupedGaps.medium?.length || 0} Medium</span>
        </div>
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{groupedGaps.low?.length || 0} Low</span>
        </div>
      </div>

      <div className="space-y-4">
        {order.map(importance => {
          const importanceGaps = groupedGaps[importance];
          if (!importanceGaps?.length) return null;

          return (
            <div key={importance} className="space-y-3">
              {importanceGaps.map((gap, idx) => (
                <Card key={idx} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getImportanceIcon(gap.importance)}
                        <CardTitle className="text-base">{gap.keyword}</CardTitle>
                      </div>
                      {getImportanceBadge(gap.importance)}
                    </div>
                    <CardDescription>
                      Missing from {gap.category}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="mb-2 text-sm font-medium text-muted-foreground">
                        Suggested phrases to incorporate:
                      </p>
                      <ul className="space-y-2">
                        {gap.suggestedPhrases.map((phrase, phraseIdx) => (
                          <li
                            key={phraseIdx}
                            className="flex items-center justify-between gap-2 rounded-md bg-secondary/50 px-3 py-2 text-sm"
                          >
                            <span className="text-foreground">{phrase}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleAddToResume(phrase)}
                            >
                              <Plus className="mr-1 h-3 w-3" />
                              Add
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
