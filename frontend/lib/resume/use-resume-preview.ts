import { useEffect, useRef, useState } from 'react';
import type { ResumePdfPayload } from '../types';
import { fetchResumePreviewHtml } from '../api';

interface PreviewState {
  html: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useResumePreview(
  payload: ResumePdfPayload | null,
  debounceMs = 600
): PreviewState {
  const [state, setState] = useState<PreviewState>({
    html: null,
    isLoading: false,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const payloadRef = useRef<ResumePdfPayload | null>(null);

  // Serialize outside the effect so the string (compared by value) is the
  // stable dependency — prevents re-runs when the object reference changes
  // but the content is identical, and also fixes the Strict Mode double-invoke.
  const payloadJson = payload ? JSON.stringify(payload) : null;

  useEffect(() => {
    if (!payloadJson || !payload) {
      setState({ html: null, isLoading: false, error: null });
      return;
    }

    // Keep a ref to the current payload so the async callback captures the
    // right value even after React re-renders.
    payloadRef.current = payload;

    setState(prev => {
      if (prev.isLoading) return prev; // avoid re-render if already loading
      return { ...prev, isLoading: true, error: null };
    });

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const html = await fetchResumePreviewHtml(payloadRef.current!);
        if (!controller.signal.aborted) {
          setState({ html, isLoading: false, error: null });
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : 'Preview failed',
          }));
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadJson, debounceMs]);

  return state;
}
