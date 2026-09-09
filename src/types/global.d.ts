declare global {
  var Sequencer: any;
  var socketlib: any;

  interface SettingConfig {
    [key: `${string}.${string}`]: any;
  }

  namespace Hooks {
    interface HookConfig {
      [key: string]: (...args: any[]) => any;
    }
  }
}

declare module 'fvtt-types/configuration' {
  interface SettingConfig {
    [key: `${string}.${string}`]: any;
  }

  namespace Hooks {
    interface HookConfig {
      [key: string]: (...args: any[]) => any;
    }
  }
}
