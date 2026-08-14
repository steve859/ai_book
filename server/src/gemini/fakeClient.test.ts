import { describe, expect, it } from "vitest";
import { createFakeGeminiClient } from "./fakeClient.js";

describe("fake Gemini client", () => {
  it("returns deterministic results for all five steps", async () => {
    const client = createFakeGeminiClient({ delayMs: 0 });
    const style = await client.generateStyle("unused.txt");
    const characters = await client.generateCharacters({ bookPath: "unused.txt", style });
    const portrait = await client.generatePortrait({
      characterName: characters[0].name,
      prompt: characters[0].prompt,
      style,
    });
    const chapters = await client.generateChapters({
      bookPath: "unused.txt",
      style,
      characters: characters.map((character) => ({ ...character, portraitPath: null })),
    });
    const illustration = await client.generateIllustration({
      chapterTitle: chapters[0].title,
      prompt: chapters[0].prompt,
      style,
      characters: characters.map((character) => ({ name: character.name, portraitPath: null })),
    });

    expect(characters).toHaveLength(2);
    expect(chapters).toHaveLength(1);
    expect(portrait.subarray(1, 4).toString()).toBe("PNG");
    expect(illustration).toEqual(portrait);
  });

  it("can force one step to fail for retry testing", async () => {
    const client = createFakeGeminiClient({ delayMs: 0, failStep: "style" });

    await expect(client.generateStyle("unused.txt")).rejects.toThrow(
      "Mock Gemini failure for style",
    );
  });
});
