import type { Weights } from './types';

export const DEFAULT_WEIGHTS: Weights = { service: 45, cost: 20, delay: 15, co2: 10, risk: 10 };
export const WEIGHT_KEYS = ['service', 'cost', 'delay', 'co2', 'risk'] as const;
export const WEIGHT_LABELS: Record<keyof Weights, string> = {
  service: 'Service client',
  cost: 'Coût',
  delay: 'Délai',
  co2: 'CO₂',
  risk: 'Risque',
};

export function validWeights(weights: Weights): boolean {
  return (
    WEIGHT_KEYS.every(
      (key) => Number.isInteger(weights[key]) && weights[key] >= 0 && weights[key] <= 100,
    ) && WEIGHT_KEYS.reduce((sum, key) => sum + weights[key], 0) === 100
  );
}

// Largest remainders preserve integer percentages without losing a point to rounding.
function distribute(keys: (keyof Weights)[], weights: Weights, total: number): Partial<Weights> {
  const sum = keys.reduce((value, key) => value + Math.max(0, weights[key] || 0), 0);
  const shares = keys.map((key) => ({
    key,
    value: sum ? (Math.max(0, weights[key] || 0) / sum) * total : total / keys.length,
  }));
  const result: Partial<Weights> = {};
  shares.forEach(({ key, value }) => {
    result[key] = Math.floor(value);
  });
  const remainder = total - shares.reduce((value, share) => value + Math.floor(share.value), 0);
  [...shares]
    .sort((a, b) => (b.value % 1) - (a.value % 1))
    .slice(0, remainder)
    .forEach(({ key }) => {
      result[key] = (result[key] ?? 0) + 1;
    });
  return result;
}

export function normalizeWeights(weights: Weights): Weights {
  return { ...weights, ...distribute([...WEIGHT_KEYS], weights, 100) };
}

export function changeWeight(weights: Weights, key: keyof Weights, value: number): Weights {
  const bounded = Math.round(Math.min(100, Math.max(0, value)));
  return {
    ...weights,
    ...distribute(
      WEIGHT_KEYS.filter((other) => other !== key),
      weights,
      100 - bounded,
    ),
    [key]: bounded,
  };
}

export const number = (value: number) => new Intl.NumberFormat('fr-FR').format(value);
export const euro = (value: number, digits = 2) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }).format(
    new Date(value),
  );
export const duration = (ms: number) => `${number(Math.round(ms) / 1000)} s`;

export const statusLabels: Record<string, string> = {
  running: 'En cours',
  awaiting_approval: 'À approuver',
  completed: 'Terminé',
  rejected: 'Refusé',
  blocked: 'Bloqué',
  degraded: 'Dégradé',
  failed: 'Échec',
  pending: 'En attente',
  suspended: 'Suspendu',
  active: 'Actif',
  approved: 'Approuvé',
  local: 'Simulateur local',
  configured: 'Configuré · non vérifié',
  not_connected: 'À connecter au tenant',
};
