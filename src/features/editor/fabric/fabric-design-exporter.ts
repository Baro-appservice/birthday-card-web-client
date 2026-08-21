import type { Design } from '@/entities/design';
import type { AssetGateway, DesignExporter, ExportOptions } from '@/features/editor/core/ports';
import { StaticCanvas } from 'fabric';

import { pageToFabricObjects } from './fabric-element-mapper';

const PNG_OPTIONS = { format: 'png' as const, multiplier: 1, enableRetinaScaling: false };

export class FabricDesignExporter implements DesignExporter {
  constructor(private readonly assetGateway: Pick<AssetGateway, 'resolveUrl'>) {}

  async exportPng(design: Design, options: ExportOptions): Promise<Blob> {
    if (options.width !== 1080 || options.height !== 1350) {
      throw new Error('PNG 내보내기는 1080x1350 크기만 지원합니다.');
    }
    const page = design.pages[0];
    if (!page) throw new Error('내보낼 페이지가 없습니다.');

    const element = document.createElement('canvas');
    const canvas = new StaticCanvas(element, { width: options.width, height: options.height });
    try {
      const objects = await pageToFabricObjects(page, this.assetGateway, { imageFailureMode: 'throw' });
      canvas.backgroundColor = page.background;
      canvas.add(...objects);
      canvas.requestRenderAll();
      const blob = await canvas.toBlob(PNG_OPTIONS);
      if (!blob) throw new Error('PNG Blob을 생성하지 못했습니다.');
      return blob;
    } finally {
      await canvas.dispose();
    }
  }
}
