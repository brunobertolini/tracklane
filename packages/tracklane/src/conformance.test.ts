import { describe } from 'vitest';
import { conformsAsBrowserProvider } from './conformance.js';

describe('browser conformance with a host installation hook', () => {
  let calls: unknown[] = [];
  conformsAsBrowserProvider({
    create: () => ({
      name: 'custom',
      default: 'ignore',
      install: () => {
        throw new Error('Installation is outside event-mapping conformance');
      },
      track: (name, data, options) => {
        calls.push([name, data, options]);
      },
    }),
    captured: () => calls,
    reset: () => {
      calls = [];
    },
  });
});
