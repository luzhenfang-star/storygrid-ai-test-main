
export enum ShotType {
  CLOSE_UP = 'Close-up',
  EXTREME_CLOSE_UP = 'Extreme Close-up',
  MEDIUM_SHOT = 'Medium Shot',
  LONG_SHOT = 'Long Shot',
  FULL_SHOT = 'Full Shot',
  BIRDS_EYE = "Bird's Eye View",
  WORMS_EYE = "Worm's Eye View",
  SIDE_PROFILE = 'Side Profile',
  BACK_VIEW = 'Back View',
  OVER_SHOULDER = 'Over the Shoulder',
  DUTCH_ANGLE = 'Dutch Angle',
  MACRO = 'Macro Detail'
}

export const ShotTypeZh: Record<string, string> = {
  [ShotType.CLOSE_UP]: '特写',
  [ShotType.EXTREME_CLOSE_UP]: '大特写',
  [ShotType.MEDIUM_SHOT]: '中景',
  [ShotType.LONG_SHOT]: '远景',
  [ShotType.FULL_SHOT]: '全景',
  [ShotType.BIRDS_EYE]: '鸟瞰/俯拍',
  [ShotType.WORMS_EYE]: '仰拍',
  [ShotType.SIDE_PROFILE]: '侧向镜头',
  [ShotType.BACK_VIEW]: '背影',
  [ShotType.OVER_SHOULDER]: '过肩镜头',
  [ShotType.DUTCH_ANGLE]: '荷兰角/倾斜',
  [ShotType.MACRO]: '微距细节'
};

export interface SuggestedShot {
  type: ShotType;
  description: string;
}

export interface ShotConfig {
  id: number;
  type: ShotType;
  description: string;
}

export interface AnalysisResult {
  scene: string;
  characters: string;
  lighting: string;
  clothing: string;
  atmosphere: string;
  cinematicLogic: string;
  suggestedShots: SuggestedShot[];
}

export type Language = 'zh' | 'en';

export type GridConfig = {
  label: string;
  rows: number;
  cols: number;
  total: number;
};

export const GRID_OPTIONS: GridConfig[] = [
  { label: '2x2 (4镜)', rows: 2, cols: 2, total: 4 },
  { label: '3x3 (9镜)', rows: 3, cols: 3, total: 9 },
  { label: '4x4 (16镜)', rows: 4, cols: 4, total: 16 }
];

export type AspectRatioConfig = {
  label: string;
  value: string;
};

export const ASPECT_RATIO_OPTIONS: AspectRatioConfig[] = [
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:2', value: '3:2' },
  { label: '16:9', value: '16:9' },
  { label: '21:9', value: '21:9' },
  { label: '9:16', value: '9:16' }
];
