import type { PlanId } from './api';

// Display-only plan info. The server is authoritative for what a purchase
// actually grants — keep prices here in sync with backend/config/plans.js and
// the Lemon Squeezy product prices.
export interface PlanDisplay {
  id: PlanId;
  name: string;
  priceLabel: string;
  cadence: string;
  blurb: string;
  badge?: string;
  highlight?: boolean;
}

export const PLANS: PlanDisplay[] = [
  {
    id: 'weekly',
    name: 'Weekly',
    priceLabel: '$4',
    cadence: '/ week',
    blurb: 'Billed weekly · Cancel anytime',
  },
  {
    id: 'monthly',
    name: 'Monthly',
    priceLabel: '$9',
    cadence: '/ month',
    blurb: 'Billed monthly · Cancel anytime',
    badge: 'Most popular',
    highlight: true,
  },
  {
    id: 'lifetime',
    name: 'Lifetime',
    priceLabel: '$29',
    cadence: 'one-time',
    blurb: 'Pay once, unlimited forever',
    badge: 'Best value',
  },
];

export const PLAN_LABEL: Record<PlanId, string> = {
  weekly: 'Weekly Plan',
  monthly: 'Monthly Plan',
  lifetime: 'Lifetime',
};
