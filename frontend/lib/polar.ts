// Opens Polar's embedded overlay checkout. The embed module is dynamically
// imported so its code stays out of the main bundle until a user actually
// starts a purchase.

export async function openPolarCheckout(
  url: string,
  { onSuccess }: { onSuccess: () => void }
): Promise<void> {
  const { PolarEmbedCheckout } = await import('@polar-sh/checkout/embed');

  const theme =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

  const checkout = await PolarEmbedCheckout.create(url, { theme });
  checkout.addEventListener('success', () => {
    onSuccess();
  });
}
