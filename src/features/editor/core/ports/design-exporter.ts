import type { Design } from '@/entities/design';

export interface ExportOptions {
  width: 1080;
  height: 1350;
}

export interface DesignExporter {
  exportPng(design: Design, options: ExportOptions): Promise<Blob>;
}
