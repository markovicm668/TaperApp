'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { RecommendedEdit } from '@/lib/types';

interface RecommendedEditsProps {
  edits: RecommendedEdit[];
}

export function RecommendedEdits({ edits }: RecommendedEditsProps) {
  const completedCount = edits.filter(edit => edit.completed).length;

  if (!edits.length) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recommended Edits</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No recommended edits available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {completedCount} of {edits.length} edits completed.
        </p>
        <Badge variant="secondary" className="text-xs">
          {completedCount}/{edits.length}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recommended Edits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {edits.map(edit => (
            <div key={edit.id} className="flex items-start gap-2">
              {edit.completed ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              )}
              <span
                className={cn(
                  'text-sm',
                  edit.completed && 'text-muted-foreground line-through'
                )}
              >
                {edit.text}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
