import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGeminiClient } from "./client.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
});

function bookFile() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-book-gemini-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "book.txt");
  fs.writeFileSync(filePath, "A short test book.", "utf8");
  return filePath;
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("Gemini REST client", () => {
  it("requires an API key before making a request", async () => {
    const client = createGeminiClient({ apiKey: "", fetchImpl: vi.fn() });

    await expect(client.generateStyle(bookFile())).rejects.toThrow(
      "GEMINI_API_KEY is not configured",
    );
  });

  it("uploads a book once and reuses its file URI for structured generation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { "x-goog-upload-url": "https://upload.example/book" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          file: {
            name: "files/book-1",
            uri: "https://files.example/book-1",
            mimeType: "text/plain",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify([
                      { name: "Mole", prompt: "A detailed adult character prompt." },
                    ]),
                  },
                ],
              },
            },
          ],
        }),
      );
    const client = createGeminiClient({
      apiKey: "test-key",
      fetchImpl: fetchMock as typeof fetch,
    });
    const filePath = bookFile();

    await expect(client.generateStyle(filePath, "Watercolor")).resolves.toBe("Watercolor");
    await expect(
      client.generateCharacters({ bookPath: filePath, style: "Watercolor" }),
    ).resolves.toEqual([
      { name: "Mole", prompt: "A detailed adult character prompt." },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const generationBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body)) as {
      contents: Array<{ parts: Array<{ fileData?: { fileUri: string } }> }>;
      generationConfig: { responseMimeType: string };
    };
    expect(generationBody.contents[0].parts[1].fileData?.fileUri).toBe(
      "https://files.example/book-1",
    );
    expect(generationBody.generationConfig.responseMimeType).toBe("application/json");
  });

  it("decodes an image returned by the image model", async () => {
    const image = Buffer.from("generated-image");
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { mimeType: "image/png", data: image.toString("base64") } }],
            },
          },
        ],
      }),
    );
    const client = createGeminiClient({
      apiKey: "test-key",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(
      client.generatePortrait({
        characterName: "Mole",
        prompt: "An adult character",
        style: "Watercolor",
      }),
    ).resolves.toEqual(image);
  });
});
