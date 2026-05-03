const STORAGE_KEY = 'taper.freeAnalysisUsed';

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function hasUsedFreeAnalysis(): boolean {
  if (!canUseLocalStorage()) return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markFreeAnalysisUsed(): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Ignore quota / privacy-mode failures.
  }
}

export function clearFreeAnalysisFlag(): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
