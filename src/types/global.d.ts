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
}
