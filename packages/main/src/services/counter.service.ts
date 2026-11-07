import type { CounterResult } from '@app/shared/types/counter';
import { getAppConfigStore } from '../modules/config.module';

export class CounterService {
  getCounter(): CounterResult {
    const store = getAppConfigStore();
    return { count: store.get('serverCounter') };
  }

  increment(step = 1): CounterResult {
    const store = getAppConfigStore();
    const newCount = store.get('serverCounter') + step;
    store.set({ serverCounter: newCount });
    return { count: newCount, step };
  }

  decrement(step = 1): CounterResult {
    const store = getAppConfigStore();
    const newCount = store.get('serverCounter') - step;
    store.set({ serverCounter: newCount });
    return { count: newCount, step };
  }

  reset(): CounterResult {
    const store = getAppConfigStore();
    store.set({ serverCounter: 0 });
    return { count: 0 };
  }
}

export const counterService = new CounterService();
