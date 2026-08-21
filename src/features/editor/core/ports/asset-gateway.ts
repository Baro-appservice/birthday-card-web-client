export interface AssetReference {
  id: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface AssetGateway {
  upload(file: File): Promise<AssetReference>;
  resolveUrl(assetId: string): Promise<string>;
  remove(assetId: string): Promise<void>;
  garbageCollect(protectedAssetIds: ReadonlySet<string>): Promise<void>;
}
