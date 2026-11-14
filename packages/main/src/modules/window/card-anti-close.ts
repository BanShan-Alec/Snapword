export type CardVisibilityState = 'hidden' | 'visible_normal' | 'visible_pinned';

export interface SourceProcessInfo {
  processName?: string;
  processId?: number;
}

export interface ForegroundProcessInfo {
  processName: string;
  processId: number;
  windowTitle?: string;
  isFullscreen?: boolean;
}

export type BlurReason =
  | 'ime_candidate'
  | 'ime_composition'
  | 'system_popup'
  | 'tray_menu'
  | 'raw_blur'
  | 'external_window';

export interface StateMachineAction {
  shouldClose: boolean;
  shouldAbortRequest: boolean;
  shouldOpenHome?: boolean;
  reason?: string;
}

export interface CardAntiCloseStateMachineOptions {
  snapwordProcessId?: number;
}

/**
 * CardAntiCloseStateMachine
 * 翻译卡片防误关状态机与三窗口协同逻辑内核 (Slice-05)
 *
 * 规范依据：
 * - docs/specs/interaction-spec-v2.md (§13.3 RC-08~14, §13.5 RX-01~07)
 * - docs/specs/PRD.md (IA-07, IA-08, IA-09, IA-11, IA-25)
 */
export class CardAntiCloseStateMachine {
  private state: CardVisibilityState = 'hidden';
  private isPinned = false;
  private sourceProcess: SourceProcessInfo | null = null;
  private readonly snapwordProcessId: number;

  constructor(options?: CardAntiCloseStateMachineOptions) {
    this.snapwordProcessId = options?.snapwordProcessId ?? process.pid;
  }

  public getState(): CardVisibilityState {
    return this.state;
  }

  public getPin(): boolean {
    return this.isPinned;
  }

  /**
   * 切换 Pin 防误关图钉状态 (RC-04 / RC-14)
   * 「防误关」只阻止点击卡片外部关闭，不阻止切换到其他应用，也不锁定内容。
   */
  public setPin(pinned: boolean): void {
    this.isPinned = pinned;
    if (this.state === 'visible_normal' && pinned) {
      this.state = 'visible_pinned';
    } else if (this.state === 'visible_pinned' && !pinned) {
      this.state = 'visible_normal';
    }
  }

  /**
   * 打开卡片并记录本次触发翻译的源进程信息
   */
  public onOpen(source?: SourceProcessInfo): StateMachineAction {
    this.sourceProcess = source ?? null;
    this.state = this.isPinned ? 'visible_pinned' : 'visible_normal';
    return { shouldClose: false, shouldAbortRequest: false };
  }

  /**
   * 点击关闭按钮：立即关闭卡片并中止进行中的请求 (RC-14 / IA-11)
   */
  public onCloseButton(): StateMachineAction {
    this.state = 'hidden';
    return { shouldClose: true, shouldAbortRequest: true, reason: 'close_button' };
  }

  /**
   * 在主窗口打开：卡片关闭/隐藏，主窗口激活定位 (RC-18 / IA-25)
   */
  public onOpenInHome(): StateMachineAction {
    this.state = 'hidden';
    return {
      shouldClose: true,
      shouldAbortRequest: true,
      shouldOpenHome: true,
      reason: 'open_in_home',
    };
  }

  /**
   * 点击外部网页空白 (RC-14 / IA-07 / IA-08)
   * - 普通状态：关闭卡片，中止进行中的请求 (IA-07)
   * - 防误关状态：卡片保持打开且内容不锁定，请求继续 (IA-08)
   */
  public onOutsideClick(): StateMachineAction {
    if (this.state === 'hidden') {
      return { shouldClose: false, shouldAbortRequest: false };
    }

    if (this.isPinned || this.state === 'visible_pinned') {
      return { shouldClose: false, shouldAbortRequest: false, reason: 'pinned_suppressed' };
    }

    this.state = 'hidden';
    return { shouldClose: true, shouldAbortRequest: true, reason: 'outside_click' };
  }

  /**
   * 前台应用切换检测 (foreground_changed) (RC-14 / IA-08 / IA-09)
   * - 切换至其他第三方应用程序（前台既不是源应用也不是 Snapword）：
   *   无论防误关是否开启，卡片立即关闭并中止请求 (IA-09)
   * - 点击回源目标应用（外部空白）：
   *   防误关开启时保持打开 (IA-08)；防误关关闭时关窗并中止请求 (IA-07)
   * - 焦点在 Snapword 主窗口：
   *   防误关开启时保持打开 (IA-08)；防误关关闭时关窗并中止请求 (IA-07)
   */
  public onForegroundChanged(fg: ForegroundProcessInfo): StateMachineAction {
    if (this.state === 'hidden') {
      return { shouldClose: false, shouldAbortRequest: false };
    }

    const isSnapword =
      fg.processId === this.snapwordProcessId ||
      /^(snapword|electron)(\.exe)?$/i.test(fg.processName);

    const isSourceApp = Boolean(
      this.sourceProcess &&
        ((this.sourceProcess.processId && fg.processId === this.sourceProcess.processId) ||
          (this.sourceProcess.processName &&
            fg.processName.toLowerCase() === this.sourceProcess.processName.toLowerCase())),
    );

    if (isSnapword) {
      // 检查是否为 Snapword 主窗口获得焦点（通过标题或由调用方指示）
      const isHomeWindow =
        fg.windowTitle &&
        !/翻译卡片|Card/i.test(fg.windowTitle) &&
        /Snapword|Home/i.test(fg.windowTitle);

      if (isHomeWindow) {
        return this.onHomeWindowFocused();
      }

      // 卡片自身或其他 Snapword 浮层获焦，保持展示
      return { shouldClose: false, shouldAbortRequest: false };
    }

    if (isSourceApp) {
      // 点击回到源应用（如 Chrome/Edge 页面空白）
      if (this.isPinned || this.state === 'visible_pinned') {
        return { shouldClose: false, shouldAbortRequest: false, reason: 'pinned_suppressed' };
      }
      this.state = 'hidden';
      return { shouldClose: true, shouldAbortRequest: true, reason: 'source_app_outside_click' };
    }

    // 既不是 Snapword 也不是源应用 -> 用户通过 Alt+Tab 或任务栏切换到了其他应用程序 (IA-09)
    // 规范明确：防误关状态下切换到其他应用，卡片关闭，请求中止
    this.state = 'hidden';
    return { shouldClose: true, shouldAbortRequest: true, reason: 'app_switch' };
  }

  /**
   * 点击或聚焦 Snapword 主窗口 (RC-14 / IA-07 / IA-08)
   */
  public onHomeWindowFocused(): StateMachineAction {
    if (this.state === 'hidden') {
      return { shouldClose: false, shouldAbortRequest: false };
    }

    if (this.isPinned || this.state === 'visible_pinned') {
      return { shouldClose: false, shouldAbortRequest: false, reason: 'pinned_suppressed' };
    }

    this.state = 'hidden';
    return { shouldClose: true, shouldAbortRequest: true, reason: 'home_window_focused' };
  }

  /**
   * 窗口失焦保护 (RC-01 / RC-15 防闪退红线)
   * 绝对红线：严禁仅依赖原生 blur 事件关窗！必须区分系统原生窗口焦点转移
   * （如中文输入法候选框弹起、通知弹窗、系统托盘右键等）
   */
  public onWindowBlur(reason?: BlurReason): StateMachineAction {
    if (this.state === 'hidden') {
      return { shouldClose: false, shouldAbortRequest: false };
    }

    // 中文输入法候选框、系统通知弹窗、托盘右键、原生模糊事件均严禁关窗
    if (
      reason === 'ime_candidate' ||
      reason === 'ime_composition' ||
      reason === 'system_popup' ||
      reason === 'tray_menu' ||
      reason === 'raw_blur' ||
      !reason
    ) {
      return {
        shouldClose: false,
        shouldAbortRequest: false,
        reason: 'blur_ignored_for_ime_or_popup',
      };
    }

    if (this.isPinned || this.state === 'visible_pinned') {
      return { shouldClose: false, shouldAbortRequest: false, reason: 'pinned_suppressed' };
    }

    // 经底层勾子确认的真实外部窗口失焦
    if (reason === 'external_window') {
      this.state = 'hidden';
      return { shouldClose: true, shouldAbortRequest: true, reason: 'external_window_blur' };
    }

    return { shouldClose: false, shouldAbortRequest: false };
  }
}
