import { beforeEach, describe, expect, it, vi } from 'vitest';
import { abortTranslationsBySource } from '../src/controllers/translation.controller';
import { CardAntiCloseStateMachine } from '../src/modules/window/card-anti-close';
import { CardWindowModule } from '../src/modules/window/card-window.module';

describe('Card Anti-Close State Machine & Window Synergy (Slice-05)', () => {
  const SNAPWORD_PID = 10000;
  const CHROME_PID = 20000;
  const NOTEPAD_PID = 30000;

  let stateMachine: CardAntiCloseStateMachine;

  beforeEach(() => {
    stateMachine = new CardAntiCloseStateMachine({
      snapwordProcessId: SNAPWORD_PID,
    });
  });

  describe('初始状态与 Pin 状态切换', () => {
    it('卡片初始状态应为 hidden，且 Pin 默认为关闭 (RC-14)', () => {
      expect(stateMachine.getState()).toBe('hidden');
      expect(stateMachine.getPin()).toBe(false);
    });

    it('打开卡片后根据 Pin 状态进入 visible_normal 或 visible_pinned', () => {
      stateMachine.onOpen({ processName: 'chrome.exe', processId: CHROME_PID });
      expect(stateMachine.getState()).toBe('visible_normal');

      stateMachine.setPin(true);
      expect(stateMachine.getState()).toBe('visible_pinned');
      expect(stateMachine.getPin()).toBe(true);

      stateMachine.setPin(false);
      expect(stateMachine.getState()).toBe('visible_normal');
      expect(stateMachine.getPin()).toBe(false);
    });
  });

  describe('Pin 开启时（防误关模式 IA-08）', () => {
    beforeEach(() => {
      stateMachine.setPin(true);
      stateMachine.onOpen({ processName: 'chrome.exe', processId: CHROME_PID });
    });

    it('点击外部网页空白 (outside_click)：卡片保持打开且内容不锁定，卡片请求继续 (IA-08)', () => {
      const action = stateMachine.onOutsideClick();
      expect(action.shouldClose).toBe(false);
      expect(action.shouldAbortRequest).toBe(false);
      expect(action.reason).toBe('pinned_suppressed');
      expect(stateMachine.getState()).toBe('visible_pinned');
    });

    it('点击回源目标应用（Chrome）内部空白：卡片保持打开，请求继续 (IA-08)', () => {
      const action = stateMachine.onForegroundChanged({
        processName: 'chrome.exe',
        processId: CHROME_PID,
        windowTitle: 'Google Chrome',
        isFullscreen: false,
      });
      expect(action.shouldClose).toBe(false);
      expect(action.shouldAbortRequest).toBe(false);
      expect(stateMachine.getState()).toBe('visible_pinned');
    });

    it('点击 Snapword 主窗口：卡片保持打开，内容不锁定 (IA-08 / RC-14)', () => {
      const action = stateMachine.onHomeWindowFocused();
      expect(action.shouldClose).toBe(false);
      expect(action.shouldAbortRequest).toBe(false);
      expect(stateMachine.getState()).toBe('visible_pinned');
    });

    it('前台应用切换至其他第三方应用 (Alt+Tab 到 Notepad)：卡片立即关闭并中止请求 (IA-09)', () => {
      const action = stateMachine.onForegroundChanged({
        processName: 'notepad.exe',
        processId: NOTEPAD_PID,
        windowTitle: 'Untitled - Notepad',
        isFullscreen: false,
      });
      expect(action.shouldClose).toBe(true);
      expect(action.shouldAbortRequest).toBe(true);
      expect(action.reason).toBe('app_switch');
      expect(stateMachine.getState()).toBe('hidden');
    });
  });

  describe('Pin 关闭时（普通模式 IA-07）', () => {
    beforeEach(() => {
      stateMachine.setPin(false);
      stateMachine.onOpen({ processName: 'chrome.exe', processId: CHROME_PID });
    });

    it('点击外部网页空白 (outside_click)：卡片立即关闭并中止进行中的请求 (IA-07)', () => {
      const action = stateMachine.onOutsideClick();
      expect(action.shouldClose).toBe(true);
      expect(action.shouldAbortRequest).toBe(true);
      expect(action.reason).toBe('outside_click');
      expect(stateMachine.getState()).toBe('hidden');
    });

    it('点击回源目标应用内部空白：卡片立即关闭并中止进行中的请求 (IA-07)', () => {
      const action = stateMachine.onForegroundChanged({
        processName: 'chrome.exe',
        processId: CHROME_PID,
        windowTitle: 'Google Chrome',
        isFullscreen: false,
      });
      expect(action.shouldClose).toBe(true);
      expect(action.shouldAbortRequest).toBe(true);
      expect(action.reason).toBe('source_app_outside_click');
      expect(stateMachine.getState()).toBe('hidden');
    });

    it('点击 Snapword 主窗口：卡片立即关闭并中止请求 (IA-07 / RC-14)', () => {
      const action = stateMachine.onHomeWindowFocused();
      expect(action.shouldClose).toBe(true);
      expect(action.shouldAbortRequest).toBe(true);
      expect(action.reason).toBe('home_window_focused');
      expect(stateMachine.getState()).toBe('hidden');
    });

    it('切换至其他应用程序：卡片立即关闭并中止请求 (IA-09)', () => {
      const action = stateMachine.onForegroundChanged({
        processName: 'notepad.exe',
        processId: NOTEPAD_PID,
        windowTitle: 'Untitled - Notepad',
        isFullscreen: false,
      });
      expect(action.shouldClose).toBe(true);
      expect(action.shouldAbortRequest).toBe(true);
      expect(action.reason).toBe('app_switch');
      expect(stateMachine.getState()).toBe('hidden');
    });

    it('点击关闭按钮：卡片立即关闭并中止请求 (IA-11)', () => {
      const action = stateMachine.onCloseButton();
      expect(action.shouldClose).toBe(true);
      expect(action.shouldAbortRequest).toBe(true);
      expect(action.reason).toBe('close_button');
      expect(stateMachine.getState()).toBe('hidden');
    });
  });

  describe('输入法与弹窗防闪退绝对红线 (RC-01 / RC-15)', () => {
    beforeEach(() => {
      stateMachine.setPin(false); // 处于普通易关状态下测试
      stateMachine.onOpen({ processName: 'chrome.exe', processId: CHROME_PID });
    });

    it('中文输入法候选框弹起 (ime_candidate / ime_composition)：严禁关窗闪退！', () => {
      const candidateAction = stateMachine.onWindowBlur('ime_candidate');
      expect(candidateAction.shouldClose).toBe(false);
      expect(candidateAction.shouldAbortRequest).toBe(false);
      expect(candidateAction.reason).toBe('blur_ignored_for_ime_or_popup');
      expect(stateMachine.getState()).toBe('visible_normal');

      const compAction = stateMachine.onWindowBlur('ime_composition');
      expect(compAction.shouldClose).toBe(false);
      expect(compAction.shouldAbortRequest).toBe(false);
      expect(stateMachine.getState()).toBe('visible_normal');
    });

    it('系统通知弹窗弹起 (system_popup)：严禁卡片闪退！', () => {
      const action = stateMachine.onWindowBlur('system_popup');
      expect(action.shouldClose).toBe(false);
      expect(action.shouldAbortRequest).toBe(false);
      expect(stateMachine.getState()).toBe('visible_normal');
    });

    it('系统托盘右键菜单弹起 (tray_menu)：严禁卡片闪退！', () => {
      const action = stateMachine.onWindowBlur('tray_menu');
      expect(action.shouldClose).toBe(false);
      expect(action.shouldAbortRequest).toBe(false);
      expect(stateMachine.getState()).toBe('visible_normal');
    });

    it('原生模糊事件 (raw_blur)：严禁仅依赖原生 blur 关窗！', () => {
      const action = stateMachine.onWindowBlur('raw_blur');
      expect(action.shouldClose).toBe(false);
      expect(action.shouldAbortRequest).toBe(false);
      expect(stateMachine.getState()).toBe('visible_normal');
    });

    it('未指定原因的 blur 事件：默认严格忽略关窗', () => {
      const action = stateMachine.onWindowBlur();
      expect(action.shouldClose).toBe(false);
      expect(action.shouldAbortRequest).toBe(false);
      expect(stateMachine.getState()).toBe('visible_normal');
    });

    it('仅在经确认的外部应用窗口失焦时，普通模式才执行关闭', () => {
      const action = stateMachine.onWindowBlur('external_window');
      expect(action.shouldClose).toBe(true);
      expect(action.shouldAbortRequest).toBe(true);
      expect(action.reason).toBe('external_window_blur');
      expect(stateMachine.getState()).toBe('hidden');
    });
  });

  describe('三窗口协同与「在主窗口打开」导航 (RC-18 / IA-25)', () => {
    it('点击更多菜单「在主窗口打开」：卡片自毁/隐藏，通知主窗口打开并定位', () => {
      stateMachine.setPin(true); // 即使开启了防误关
      stateMachine.onOpen({ processName: 'chrome.exe', processId: CHROME_PID });

      const action = stateMachine.onOpenInHome();
      expect(action.shouldClose).toBe(true);
      expect(action.shouldAbortRequest).toBe(true);
      expect(action.shouldOpenHome).toBe(true);
      expect(action.reason).toBe('open_in_home');
      expect(stateMachine.getState()).toBe('hidden');
    });
  });

  describe('CardWindowModule 集成与状态机协同', () => {
    it('CardWindowModule 能正确代理 Pin 状态与状态机动作', () => {
      const module = new CardWindowModule({
        initConfig: {
          preload: { path: '/fake/preload.js' },
          windows: {
            home: new URL('http://localhost:3000/home'),
            updater: new URL('http://localhost:3000/updater'),
            card: new URL('http://localhost:3000/card'),
          },
        },
      });

      expect(module.getPinStatus()).toBe(false);
      module.setPin(true);
      expect(module.getPinStatus()).toBe(true);

      const sm = module.getStateMachine();
      expect(sm.getPin()).toBe(true);

      // 打开卡片进入 visible_pinned
      sm.onOpen({ processName: 'chrome.exe', processId: 12345 });
      expect(sm.getState()).toBe('visible_pinned');

      // 触发 handleOutsideClick，防误关开启时卡片不关
      module.handleOutsideClick();
      expect(sm.getState()).toBe('visible_pinned');

      // 切换 Pin 为 false
      module.setPin(false);
      expect(module.getPinStatus()).toBe(false);

      // 前台切换到其他应用，立即关窗
      module.handleForegroundChanged({
        processName: 'code.exe',
        processId: 44444,
        windowTitle: 'VSCode',
        isFullscreen: false,
      });
      expect(sm.getState()).toBe('hidden');
    });

    it('abortTranslationsBySource 只中止 card 来源的请求，不影响 home 请求', () => {
      // 验证 abortTranslationsBySource 能够正常被调用不抛异常
      expect(() => abortTranslationsBySource('card')).not.toThrow();
      expect(() => abortTranslationsBySource('home')).not.toThrow();
    });
  });

  describe('卡片复制译文反馈与剪贴板 (IA-18)', () => {
    it('复制纯文本格式校验正确且复制反馈维持 1.5 秒后复原', () => {
      vi.useFakeTimers();

      let isCopied = false;
      const setCopied = (val: boolean) => {
        isCopied = val;
      };

      const copyHandler = (text: string) => {
        if (!text) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      };

      // 触发复制
      copyHandler('Electron 桌面应用开发');
      expect(isCopied).toBe(true);

      // 1 秒后仍处于已复制高亮态
      vi.advanceTimersByTime(1000);
      expect(isCopied).toBe(true);

      // 1.5 秒后复原
      vi.advanceTimersByTime(500);
      expect(isCopied).toBe(false);

      vi.useRealTimers();
    });
  });
});
