export type InAppBrowserName =
  | 'linkedin'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'twitter'
  | 'webview';

export type InAppBrowserPlatform = 'ios' | 'android';

export interface InAppBrowserDetection {
  isInAppBrowser: boolean;
  name?: InAppBrowserName;
  platform?: InAppBrowserPlatform;
}

const NAMED_PATTERNS: Array<{ name: InAppBrowserName; pattern: RegExp }> = [
  { name: 'linkedin', pattern: /LinkedInApp/i },
  { name: 'facebook', pattern: /FBAN|FBAV|FB_IAB/i },
  { name: 'instagram', pattern: /Instagram/i },
  { name: 'tiktok', pattern: /musical_ly|BytedanceWebview|ByteLocale/i },
  { name: 'twitter', pattern: /Twitter(?:Android)?/i },
];

export function detectInAppBrowser(): InAppBrowserDetection {
  if (typeof navigator === 'undefined') return { isInAppBrowser: false };

  const ua = navigator.userAgent || '';
  const platform: InAppBrowserPlatform | undefined = /iPhone|iPad|iPod/i.test(ua)
    ? 'ios'
    : /Android/i.test(ua)
      ? 'android'
      : undefined;

  for (const { name, pattern } of NAMED_PATTERNS) {
    if (pattern.test(ua)) return { isInAppBrowser: true, name, platform };
  }

  if (platform === 'android' && /;\s*wv\)/i.test(ua)) {
    return { isInAppBrowser: true, name: 'webview', platform };
  }

  // iOS WKWebView heuristic: real Safari UA contains "Safari/"; embedded
  // WKWebViews typically omit it. Exclude Chrome/Firefox on iOS (CriOS/FxiOS),
  // which are legitimate standalone browsers that also lack "Safari/".
  if (
    platform === 'ios' &&
    !/Safari\//.test(ua) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  ) {
    return { isInAppBrowser: true, name: 'webview', platform };
  }

  return { isInAppBrowser: false, platform };
}
