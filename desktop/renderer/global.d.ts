import type { AppState } from "./model";

type DesktopCommand =
  | { type: "start-focus" }
  | { type: "open-routine"; routineId: string };

interface InkflowDesktopApi {
  loadState: () => Promise<AppState>;
  saveState: (state: AppState) => Promise<AppState>;
  getSystemSettings: () => Promise<{ autoStart: boolean; notificationsSupported: boolean; packaged: boolean; version: string }>;
  setAutoLaunch: (enabled: boolean) => Promise<boolean>;
  testNotification: () => Promise<boolean>;
  hideWindow: () => void;
  quitApp: () => void;
  onStateChanged: (callback: (state: AppState) => void) => () => void;
  onCommand: (callback: (command: DesktopCommand) => void) => () => void;
}

declare global {
  interface Window {
    inkflowDesktop: InkflowDesktopApi;
  }
}

export {};
