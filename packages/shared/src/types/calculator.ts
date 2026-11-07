export type CalcOperator = 'add' | 'subtract' | 'multiply' | 'divide';

export interface CalculateResult {
  a: number;
  b: number;
  op: CalcOperator;
  result: number;
}
