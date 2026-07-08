'use client';

import mixpanel from 'mixpanel-browser';

type AnalyticsEvent =
  | 'landing_hero_cta_clicked'
  | 'landing_try_analyze_clicked'
  | 'landing_signed_in_workspace_clicked'
  | 'landing_signup_after_used_clicked'
  | 'landing_footer_terms_clicked'
  | 'landing_footer_privacy_clicked'
  | 'nav_logo_clicked'
  | 'nav_analyze_clicked'
  | 'nav_results_clicked'
  | 'nav_tracker_clicked'
  | 'nav_help_clicked'
  | 'nav_upgrade_clicked'
  | 'nav_upgrade_plan_selected'
  | 'nav_upgrade_confirmed_clicked'
  | 'nav_invite_clicked'
  | 'nav_referral_link_copied'
  | 'nav_profile_menu_opened'
  | 'nav_profile_settings_clicked'
  | 'nav_signout_clicked'
  | 'nav_signin_clicked'
  | 'nav_get_started_clicked'
  | 'nav_mobile_menu_opened'
  | 'login_page_viewed'
  | 'signin_started'
  | 'signin_email_link_sent'
  | 'signin_completed'
  | 'signin_failed'
  | 'resume_uploaded'
  | 'job_description_added'
  | 'analysis_started'
  | 'analysis_completed'
  | 'analysis_failed'
  | 'results_viewed'
  | 'resume_exported'
  | 'resume_export_failed'
  | 'resume_template_changed'
  | 'guest_download_blocked'
  | 'tracker_viewed'
  | 'tracker_application_opened'
  | 'tracker_stage_changed'
  | 'tracker_application_reopened'
  | 'tracker_application_deleted'
  | 'tracker_add_role_clicked'
  | 'tracker_searched';

type EventProps = Record<string, string | number | boolean | null | undefined>;

let initialized = false;

function getToken(): string | null {
  const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;
  return token && token.length > 0 ? token : null;
}

function appVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown';
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
  mixpanel.register({ is_guest: true, app_version: appVersion() });
  initialized = true;
}

export function identifyUser(userId: string, traits?: EventProps) {
  if (!initialized) return;
  mixpanel.identify(userId);
  mixpanel.register({ is_guest: false, user_id: userId, app_version: appVersion() });
  const now = new Date().toISOString();
  mixpanel.people.set({ ...(traits ?? {}), last_seen: now });
  mixpanel.people.set_once({ first_seen: now });
}

export function resetAnalytics() {
  if (!initialized) return;
  mixpanel.reset();
  mixpanel.register({ is_guest: true, app_version: appVersion() });
}

export function track(event: AnalyticsEvent, props?: EventProps) {
  if (!initialized) return;
  mixpanel.track(event, props);
}

export function incrementPeopleProperty(name: string, by: number = 1) {
  if (!initialized) return;
  mixpanel.people.increment(name, by);
}
