export abstract class VisionProvider {
  abstract evaluateImage(
    imageBase64: string,
    prompt: string,
    options?: unknown
  ): Promise<string>;
}
