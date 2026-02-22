'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function HistoryPage() {
  // Mock data for history items
  const historyItems = [
    { id: '1', role: 'Senior Software Engineer', company: 'Tech Corp', date: '2024-01-15', score: 92 },
    { id: '2', role: 'Full Stack Developer', company: 'Startup XYZ', date: '2023-12-01', score: 78 },
    { id: '3', role: 'Lead Frontend Engineer', company: 'Global Solutions', date: '2023-11-20', score: 85 },
  ];

  return (
    <div className="mx-auto w-full max-w-[1080px] space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary/80">History</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Analysis History</h1>
        <p className="mt-1 text-muted-foreground">Review your past resume analysis sessions.</p>
      </div>

      <div className="space-y-4">
        {historyItems.map(item => (
          <Card
            key={item.id}
            className="cursor-pointer border-border/80 bg-card/85 transition-shadow hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
          >
            <CardHeader className="flex flex-row items-center justify-between p-5">
              <CardTitle className="text-lg">
                {item.role} at {item.company}
              </CardTitle>
              <span className={`text-xl font-bold ${item.score > 80 ? 'text-green-600' : 'text-yellow-600'}`}>
                {item.score}%
              </span>
            </CardHeader>
            <CardContent className="flex justify-between p-5 pt-0 text-sm text-muted-foreground">
              <span>Analyzed on {item.date}</span>
              {/* Future: Add a button/link here to view details */}
            </CardContent>
          </Card>
        ))}
      </div>

      {historyItems.length === 0 && (
        <p className="mt-10 text-center text-muted-foreground">No analysis history found.</p>
      )}
    </div>
  );
}
