export abstract class ExternalVectorGeneratorProvider {
  abstract generateVectorAsset(
    prompt: string,
    styleSystem: any,
    assetType: string,
    outputSize: { width: number; height: number }
  ): Promise<string>;
}
