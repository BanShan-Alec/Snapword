import { ErrorCode } from '@app/shared/constants/error-codes';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { calculateInputSchema } from '@app/shared/schemas/calculator';
import type { CalculateResult } from '@app/shared/types/calculator';
import type { Result } from '@app/shared/types/result';
import { calculatorService } from '../services/calculator.service';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, failResult, successResult } from './utils';

export function registerCalculatorControllers(): void {
  handleTraced(
    IPC_CHANNELS.CALCULATOR_CALCULATE,
    async (_event, rawInput: unknown): Promise<Result<CalculateResult>> => {
      const parseResult = calculateInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        return successResult(calculatorService.calculate(parseResult.data));
      } catch (err) {
        return catchToResult(err);
      }
    },
  );
}
