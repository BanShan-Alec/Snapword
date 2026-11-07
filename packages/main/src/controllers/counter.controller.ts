import { ErrorCode } from '@app/shared/constants/error-codes';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { stepInputSchema } from '@app/shared/schemas/counter';
import type { CounterResult } from '@app/shared/types/counter';
import type { Result } from '@app/shared/types/result';
import { counterService } from '../services/counter.service';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, failResult, successResult } from './utils';

export function registerCounterControllers(): void {
  handleTraced(IPC_CHANNELS.COUNTER_GET, async (): Promise<Result<CounterResult>> => {
    try {
      return successResult(counterService.getCounter());
    } catch (err) {
      return catchToResult(err);
    }
  });

  handleTraced(
    IPC_CHANNELS.COUNTER_INCREMENT,
    async (_event, rawInput: unknown): Promise<Result<CounterResult>> => {
      const parseResult = stepInputSchema.safeParse(rawInput ?? {});
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        return successResult(counterService.increment(parseResult.data.step));
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.COUNTER_DECREMENT,
    async (_event, rawInput: unknown): Promise<Result<CounterResult>> => {
      const parseResult = stepInputSchema.safeParse(rawInput ?? {});
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        return successResult(counterService.decrement(parseResult.data.step));
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(IPC_CHANNELS.COUNTER_RESET, async (): Promise<Result<CounterResult>> => {
    try {
      return successResult(counterService.reset());
    } catch (err) {
      return catchToResult(err);
    }
  });
}
