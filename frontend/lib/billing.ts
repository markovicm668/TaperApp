import type { CreditPackId } from './api';

// Display-only pack info. The server is authoritative for what a purchase
// actually grants — keep credits/prices here in sync with
// backend/config/creditPacks.js and the Lemon Squeezy product prices.
export interface CreditPackDisplay {
  id: CreditPackId;
  name: string;
  credits: number;
  priceLabel: string;
  highlight?: boolean;
}

export const CREDIT_PACKS: CreditPackDisplay[] = [
  { id: 'small', name: 'Starter', credits: 25, priceLabel: '$5' },
  { id: 'medium', name: 'Plus', credits: 75, priceLabel: '$12', highlight: true },
  { id: 'large', name: 'Pro', credits: 200, priceLabel: '$25' },
];
