import type { SelectionPayload } from '../schemas/capture';

export interface CardActionPayload {
  action: 'translate' | 'notice';
  text?: string;
  context?: string;
  mode?: 'word' | 'sentence';
  notice?: string;
  selection?: SelectionPayload;
}
