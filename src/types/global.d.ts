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

  type Dnd5eSkill = import('./systems.js').Dnd5eSkill;
  type Dnd5eTool = import('./systems.js').Dnd5eTool;
  type Dnd5eActivity = import('./systems.js').Dnd5eActivity;
  type Dnd5eTraitData = import('./systems.js').Dnd5eTraitData;
  type Dnd5eSensesData = import('./systems.js').Dnd5eSensesData;
  type Actor5e = import('./systems.js').Actor5e;
  type Item5e = import('./systems.js').Item5e;
  type Pf1Skill = import('./systems.js').Pf1Skill;
  type Pf1TraitData = import('./systems.js').Pf1TraitData;
  type ActorPF = import('./systems.js').ActorPF;
  type ItemPF = import('./systems.js').ItemPF;
  type Pf2eStatistic = import('./systems.js').Pf2eStatistic;
  type ActorPF2e = import('./systems.js').ActorPF2e;
  type ItemPF2e = import('./systems.js').ItemPF2e;
}
