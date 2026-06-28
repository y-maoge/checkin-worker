import { wetalk } from './wetalk.js';
import { pingme } from './pingme.js';

export const providers = [wetalk, pingme];

export function getProvider(id) {
  return providers.find(p => p.id === id) || null;
}
