'use client';

import mixpanel from 'mixpanel-browser';

type AnalyticsEvent =
  | 'landing_cta_clicked'
  | 'login_page_viewed'
  | 'signin_started'
  | 'signin_completed'
  | 'signin_failed'
  | 'resume_uploaded'
  | 'job_description_added'
  | 'analysis_started'
  | 'analysis_completed'
  | 'analysis_failed'
  | 'results_viewed'
  | 'resume_exported'
  | 'resume_export_failed';

type EventProps = Record<string, string | number | boolean | null | undefined>;

let initialized = false;

function getToken(): string | null {
  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
  return token && token.length > 0 ? token : null;
}

export function initAnalytics() {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  const token = getToken();
  if (!token) return;

  mixpanel.init(token, {
    track_pageview: true,
    persistence: 'localStorage',
    debug: process.env.NODE_ENV !== 'production',
  });
  initialized = true;
}

export function identifyUser(userId: string, traits?: EventProps) {
  if (!initialized) return;
  mixpanel.identify(userId);
  if (traits) {
    mixpanel.people.set(traits);
  }
}

export function resetAnalytics() {
  if (!initialized) return;
  mixpanel.reset();
}

export function track(event: AnalyticsEvent, props?: EventProps) {
  if (!initialized) return;
  mixpanel.track(event, props);
}
