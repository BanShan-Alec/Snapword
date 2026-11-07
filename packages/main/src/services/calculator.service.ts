import { ErrorCode } from '@app/shared/constants/error-codes';
import type { CalculateInput } from '@app/shared/schemas/calculator';
import type { CalculateResult } from '@app/shared/types/calculator';
import { AppError } from '../errors/AppError';

export class CalculatorService {
  calculate(input: CalculateInput): CalculateResult {
    const { a, b, op } = input;
    if (op === 'divide' && b === 0) {
      throw new AppError('Cannot divide by zero!', ErrorCode.DIVIDE_BY_ZERO);
    }

    let result = 0;
    switch (op) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        result = a / b;
        break;
    }

    return { a, b, op, result };
  }
}

export const calculatorService = new CalculatorService();
