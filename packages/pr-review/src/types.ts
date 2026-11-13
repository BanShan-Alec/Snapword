export interface OcrComment {
  path: string;
  start_line?: number;
  end_line?: number;
  line?: number;
  content: string;
  category?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestion_code?: string;
  existing_code?: string;
}

export interface OcrResult {
  summary?: {
    files_reviewed?: number;
    comments?: number;
    elapsed?: string;
  };
  comments?: OcrComment[];
}

export interface RunInfo {
  id: string;
  round: number;
  totalRuns: number;
  status: string;
  allPrRunIds?: string[];
}

export interface GhReviewComment {
  path: string;
  line?: number;
  original_line?: number;
  html_url: string;
}

export interface HistoricalIssueState {
  path: string;
  line: number;
  summary: string;
  isIgnored: boolean;
  userNote: string;
  fingerprint: string;
}

export interface CiCheckItem {
  name: string;
  status?: string;
  conclusion?: string | null;
  detailsUrl?: string;
  workflowName?: string;
}
