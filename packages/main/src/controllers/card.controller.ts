import { ErrorCode } from '@app/shared/constants/error-codes';
import { IPC_CHANNELS } from '@app/shared/constants/ipc-channels';
import { cardPinInputSchema, cardResizeInputSchema } from '@app/shared/schemas/card';
import type { Result } from '@app/shared/types/result';
import { getCardWindowModule } from '../modules/window/card-window.module';
import { handleTraced } from '../telemetry/ipc-tracer';
import { catchToResult, failResult, successResult } from './utils';

export function registerCardControllers(): void {
  handleTraced(IPC_CHANNELS.CARD_HIDE, async (_event): Promise<Result<{ success: boolean }>> => {
    try {
      const cardModule = getCardWindowModule();
      cardModule.hideCard();
      return successResult({ success: true });
    } catch (err) {
      return catchToResult(err);
    }
  });

  handleTraced(
    IPC_CHANNELS.CARD_RESIZE,
    async (_event, rawInput: unknown): Promise<Result<{ success: boolean }>> => {
      const parseResult = cardResizeInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const cardModule = getCardWindowModule();
        cardModule.resizeCard(parseResult.data.height);
        return successResult({ success: true });
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.CARD_PIN_TOGGLE,
    async (_event, rawInput: unknown): Promise<Result<{ success: boolean }>> => {
      const parseResult = cardPinInputSchema.safeParse(rawInput);
      if (!parseResult.success) {
        return failResult(parseResult.error.issues[0].message, ErrorCode.VALIDATION_ERROR);
      }
      try {
        const cardModule = getCardWindowModule();
        cardModule.setPin(parseResult.data.pin);
        return successResult({ success: true });
      } catch (err) {
        return catchToResult(err);
      }
    },
  );

  handleTraced(
    IPC_CHANNELS.CARD_OPEN_IN_HOME,
    async (_event, rawInput: unknown): Promise<Result<{ success: boolean }>> => {
      try {
        const cardModule = getCardWindowModule();
        cardModule.openInHome(rawInput);
        return successResult({ success: true });
      } catch (err) {
        return catchToResult(err);
      }
    },
  );
}
