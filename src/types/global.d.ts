export {};

declare global {
  interface SettingConfig {
    "bakana-better-crosshairs.registeredTemplates": Record<string, any>;
    "bakana-better-crosshairs.enableCrosshairBroadcasting": boolean;
    "bakana-better-crosshairs.showOtherPlayersCrosshairs": boolean;
    "bakana-better-crosshairs.logVerbosity": string;
  }
  interface ModuleConfig {
    [key: string]: any;
  }
  interface FlagConfig {
    [key: string]: any;
  }
  var Sequencer: any;
  var Sequence: any;
  var Tagger: any;
  var socketlib: any;

  type Actor5e = import('./systems.js').Actor5e;
  type Item5e = import('./systems.js').Item5e;
  type ActorPF = import('./systems.js').ActorPF;
  type ItemPF = import('./systems.js').ItemPF;
  type ActorPF2e = import('./systems.js').ActorPF2e;
  type ItemPF2e = import('./systems.js').ItemPF2e;
}
