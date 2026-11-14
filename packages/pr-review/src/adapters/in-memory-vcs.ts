import type {
  BranchContext,
  CiCheck,
  CommitSummary,
  ConflictCheckResult,
  CreatePrInput,
  CreatePrResult,
  MergePrInput,
  PrDetails,
  VcsProvider,
} from '../ports/vcs-provider.ts';

export interface InMemoryVcsOptions {
  currentBranch?: string;
  defaultBranch?: string;
  isClean?: boolean;
  uncommittedFiles?: string[];
  commits?: CommitSummary[];
  hasConflict?: boolean;
  existingPr?: PrDetails | null;
  requiredChecks?: string[] | null;
  checksPollSequence?: Array<CiCheck[] | null>;
}

export class InMemoryVcsAdapter implements VcsProvider {
  currentBranch: string;
  defaultBranch: string;
  isClean: boolean;
  uncommittedFiles: string[];
  commits: CommitSummary[];
  hasConflict: boolean;
  existingPr: PrDetails | null;
  requiredChecks: string[] | null;
  checksPollSequence: Array<CiCheck[] | null>;
  currentPollIndex = 0;

  pushedBranches: string[] = [];
  createdPrs: CreatePrInput[] = [];
  mergedPrs: MergePrInput[] = [];
  comments: Array<{ target: string; body: string }> = [];

  constructor(options: InMemoryVcsOptions = {}) {
    this.currentBranch = options.currentBranch ?? 'feat/test';
    this.defaultBranch = options.defaultBranch ?? 'main';
    this.isClean = options.isClean ?? true;
    this.uncommittedFiles = options.uncommittedFiles ?? [];
    this.commits = options.commits ?? [];
    this.hasConflict = options.hasConflict ?? false;
    this.existingPr = options.existingPr ?? null;
    this.requiredChecks = options.requiredChecks ?? null;
    this.checksPollSequence = options.checksPollSequence ? [...options.checksPollSequence] : [];
  }

  ensureAuth(): void {}

  reset(): void {
    this.currentPollIndex = 0;
    this.pushedBranches = [];
    this.createdPrs = [];
    this.mergedPrs = [];
    this.comments = [];
  }

  getBranchContext(): Promise<BranchContext> {
    return Promise.resolve({
      currentBranch: this.currentBranch,
      defaultBranch: this.defaultBranch,
      isClean: this.isClean,
      uncommittedFiles: this.uncommittedFiles,
    });
  }

  getCommitsAgainst(_baseBranch: string): Promise<CommitSummary[]> {
    return Promise.resolve(this.commits);
  }

  checkConflict(branch: string, targetBranch: string): Promise<ConflictCheckResult> {
    const existing =
      this.existingPr && this.existingPr.headRefName === branch ? this.existingPr : null;
    const created = this.createdPrs.find((pr) => pr.head === branch);
    const resolvedTarget = created?.base ?? existing?.baseRefName ?? targetBranch;

    return Promise.resolve({
      hasConflict: this.hasConflict,
      targetBranch: resolvedTarget,
      details: this.hasConflict ? `Branch ${branch} conflicts with ${resolvedTarget}` : undefined,
    });
  }

  getPrForBranch(branch: string): Promise<PrDetails | null> {
    if (this.existingPr && this.existingPr.headRefName === branch) {
      return Promise.resolve(this.existingPr);
    }
    const idx = this.createdPrs.findIndex((pr) => pr.head === branch);
    if (idx !== -1) {
      const foundCreated = this.createdPrs[idx]!;
      const prNumber = idx + 1;
      return Promise.resolve({
        number: prNumber,
        title: foundCreated.title,
        url: `https://github.com/owner/repo/pull/${prNumber}`,
        baseRefName: foundCreated.base,
        headRefName: foundCreated.head,
        mergeable: this.hasConflict ? 'CONFLICTING' : 'MERGEABLE',
      });
    }
    return Promise.resolve(null);
  }

  pushBranch(branch: string): Promise<void> {
    this.pushedBranches.push(branch);
    return Promise.resolve();
  }

  createPr(input: CreatePrInput): Promise<CreatePrResult> {
    this.createdPrs.push(input);
    const prNumber = this.createdPrs.length;
    const details: PrDetails = {
      number: prNumber,
      title: input.title,
      url: `https://github.com/owner/repo/pull/${prNumber}`,
      baseRefName: input.base,
      headRefName: input.head,
      mergeable: this.hasConflict ? 'CONFLICTING' : 'MERGEABLE',
    };
    this.existingPr = details;
    return Promise.resolve({ number: prNumber, url: details.url });
  }

  getRequiredCheckNames(_baseBranch: string): Promise<string[] | null> {
    return Promise.resolve(this.requiredChecks);
  }

  getChecks(_branch: string): Promise<CiCheck[] | null> {
    if (this.checksPollSequence.length > 0) {
      const idx = Math.min(this.currentPollIndex, this.checksPollSequence.length - 1);
      const res = this.checksPollSequence[idx] ?? null;
      this.currentPollIndex++;
      return Promise.resolve(res);
    }
    return Promise.resolve(null);
  }

  mergePr(input: MergePrInput): Promise<void> {
    this.mergedPrs.push(input);
    return Promise.resolve();
  }

  commentPr(prNumberOrBranch: string, body: string): Promise<void> {
    this.comments.push({ target: prNumberOrBranch, body });
    return Promise.resolve();
  }

  showStatus(): Promise<void> {
    return Promise.resolve();
  }
}
