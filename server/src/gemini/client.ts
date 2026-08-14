export interface GeminiClient {
  generateStyle(bookPath: string, customStyle?: string): Promise<string>;
  generateCharacters(input: {
    bookPath: string;
    style: string;
  }): Promise<Array<{ name: string; prompt: string }>>;
  generatePortrait(input: {
    characterName: string;
    prompt: string;
    style: string;
  }): Promise<Buffer>;
  generateChapters(input: {
    bookPath: string;
    style: string;
    characters: Array<{ name: string; prompt: string; portraitPath: string | null }>;
  }): Promise<Array<{ title: string; prompt: string }>>;
  generateIllustration(input: {
    chapterTitle: string;
    prompt: string;
    style: string;
    characters: Array<{ name: string; portraitPath: string | null }>;
  }): Promise<Buffer>;
}

export function createGeminiClient(): GeminiClient {
  return {
    async generateStyle() {
      throw new Error("Gemini client scaffolded but not implemented yet.");
    },
    async generateCharacters() {
      throw new Error("Gemini client scaffolded but not implemented yet.");
    },
    async generatePortrait() {
      throw new Error("Gemini client scaffolded but not implemented yet.");
    },
    async generateChapters() {
      throw new Error("Gemini client scaffolded but not implemented yet.");
    },
    async generateIllustration() {
      throw new Error("Gemini client scaffolded but not implemented yet.");
    },
  };
}
