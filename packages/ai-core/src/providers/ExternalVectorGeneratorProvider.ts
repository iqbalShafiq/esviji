export abstract class ExternalVectorGeneratorProvider {
  abstract generateVectorAsset(
    prompt: string,
    styleSystem: unknown,
    assetType: string,
    outputSize: { width: number; height: number }
  ): Promise<string>;
}
