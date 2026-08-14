export interface GeminiClient {
  generateStyle(bookPath: string, customStyle?: string): Promise<string>;
}

export function createGeminiClient(): GeminiClient {
  return {
    async generateStyle() {
      throw new Error("Gemini client scaffolded but not implemented yet.");
    }
  };
}
