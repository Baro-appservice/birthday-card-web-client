import type { DesignElement } from './element';

export const DESIGN_VERSION = 2;
export const DESIGN_WIDTH = 1080;
export const DESIGN_HEIGHT = 1350;

export interface DesignPage {
  id: string;
  background: string;
  elements: DesignElement[];
}

export interface Design {
  version: typeof DESIGN_VERSION;
  width: typeof DESIGN_WIDTH;
  height: typeof DESIGN_HEIGHT;
  pages: DesignPage[];
}
