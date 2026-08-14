import fs from "node:fs";
import path from "node:path";

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

interface GeminiClientOptions {
  apiKey?: string;
  textModel?: string;
  imageModel?: string;
  fetchImpl?: typeof fetch;
}

interface GeminiFile {
  name: string;
  uri: string;
  mimeType: string;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GenerateContentResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
  promptFeedback?: { blockReason?: string };
}

const API_BASE = "https://generativelanguage.googleapis.com";
const IMAGE_RULES = [
  "There must be no text in the image.",
  "Create one full illustration with no border, title, description, or panels.",
  "Keep the image family-friendly with uplifting colors.",
].join(" ");

const promptItemSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    prompt: { type: "string" },
  },
  required: ["name", "prompt"],
};

function apiError(operation: string, status: number, body: string) {
  const detail = body.length > 500 ? `${body.slice(0, 500)}...` : body;
  return new Error(`Gemini ${operation} failed (${status}): ${detail || "empty response"}`);
}

function responseParts(response: GenerateContentResponse): GeminiPart[] {
  return response.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
}

function textFromResponse(response: GenerateContentResponse): string {
  const text = responseParts(response)
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    const reason = response.promptFeedback?.blockReason;
    throw new Error(reason ? `Gemini blocked the prompt: ${reason}` : "Gemini returned no text.");
  }

  return text;
}

function imageFromResponse(response: GenerateContentResponse): Buffer {
  const image = responseParts(response).find((part) => part.inlineData?.data)?.inlineData;
  if (!image) {
    const reason = response.promptFeedback?.blockReason;
    throw new Error(
      reason ? `Gemini blocked image generation: ${reason}` : "Gemini returned no image.",
    );
  }

  return Buffer.from(image.data, "base64");
}

function parsePromptItems(text: string, limit: number) {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON.");
  }

  if (!Array.isArray(value)) {
    throw new Error("Gemini JSON response must be an array.");
  }

  const items = value.slice(0, limit).map((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).name !== "string" ||
      typeof (item as Record<string, unknown>).prompt !== "string"
    ) {
      throw new Error("Gemini returned an invalid prompt item.");
    }

    return {
      name: (item as { name: string }).name.trim(),
      prompt: (item as { prompt: string }).prompt.trim(),
    };
  });

  if (items.length === 0 || items.some((item) => !item.name || !item.prompt)) {
    throw new Error("Gemini returned no usable prompt items.");
  }

  return items;
}

function imageMimeType(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

export function createGeminiClient(options: GeminiClientOptions = {}): GeminiClient {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  const textModel = options.textModel ?? process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";
  const imageModel =
    options.imageModel ?? process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
  const fetchImpl = options.fetchImpl ?? fetch;
  const uploadedBooks = new Map<string, Promise<GeminiFile>>();

  function requireApiKey() {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    return apiKey;
  }

  async function parseJsonResponse<T>(response: Response, operation: string): Promise<T> {
    const body = await response.text();
    if (!response.ok) {
      throw apiError(operation, response.status, body);
    }

    try {
      return JSON.parse(body) as T;
    } catch {
      throw new Error(`Gemini ${operation} returned invalid JSON.`);
    }
  }

  async function uploadBook(bookPath: string): Promise<GeminiFile> {
    const key = requireApiKey();
    const bytes = await fs.promises.readFile(bookPath);
    const startResponse = await fetchImpl(`${API_BASE}/upload/v1beta/files`, {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "x-goog-upload-protocol": "resumable",
        "x-goog-upload-command": "start",
        "x-goog-upload-header-content-length": String(bytes.length),
        "x-goog-upload-header-content-type": "text/plain",
        "content-type": "application/json",
      },
      body: JSON.stringify({ file: { displayName: path.basename(bookPath) } }),
    });

    if (!startResponse.ok) {
      throw apiError("file upload start", startResponse.status, await startResponse.text());
    }

    const uploadUrl = startResponse.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      throw new Error("Gemini file upload did not return an upload URL.");
    }

    const uploadResponse = await fetchImpl(uploadUrl, {
      method: "POST",
      headers: {
        "content-length": String(bytes.length),
        "x-goog-upload-offset": "0",
        "x-goog-upload-command": "upload, finalize",
      },
      body: bytes,
    });
    const result = await parseJsonResponse<{ file?: Partial<GeminiFile> }>(
      uploadResponse,
      "file upload",
    );
    const file = result.file;
    if (!file?.name || !file.uri) {
      throw new Error("Gemini file upload returned no file reference.");
    }

    return { name: file.name, uri: file.uri, mimeType: file.mimeType ?? "text/plain" };
  }

  function getBook(bookPath: string) {
    const absolutePath = path.resolve(bookPath);
    const existing = uploadedBooks.get(absolutePath);
    if (existing) return existing;

    const upload = uploadBook(absolutePath).catch((error: unknown) => {
      uploadedBooks.delete(absolutePath);
      throw error;
    });
    uploadedBooks.set(absolutePath, upload);
    return upload;
  }

  async function generate(
    model: string,
    parts: Array<Record<string, unknown>>,
    generationConfig?: Record<string, unknown>,
  ) {
    const key = requireApiKey();
    const response = await fetchImpl(
      `${API_BASE}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": key,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          ...(generationConfig ? { generationConfig } : {}),
        }),
      },
    );

    return parseJsonResponse<GenerateContentResponse>(response, "generateContent");
  }

  async function generateFromBook(
    bookPath: string,
    prompt: string,
    generationConfig?: Record<string, unknown>,
  ) {
    const book = await getBook(bookPath);
    return generate(
      textModel,
      [
        { text: prompt },
        { fileData: { mimeType: book.mimeType, fileUri: book.uri } },
      ],
      generationConfig,
    );
  }

  function structuredConfig(maxItems: number) {
    return {
      responseMimeType: "application/json",
      responseSchema: {
        type: "array",
        minItems: 1,
        maxItems,
        items: promptItemSchema,
      },
    };
  }

  return {
    async generateStyle(bookPath, customStyle) {
      if (customStyle?.trim()) {
        await getBook(bookPath);
        return customStyle.trim();
      }

      const response = await generateFromBook(
        bookPath,
        "Define an art style that fits this story but has a distinctive twist. Return only a concise reusable art-style prompt for future illustration prompts.",
      );
      return textFromResponse(response);
    },

    async generateCharacters(input) {
      const response = await generateFromBook(
        input.bookPath,
        `The illustration style is: ${input.style}\n\nDescribe up to two main adult characters from the book. For each character, prepare a detailed prompt of at least 50 words for an image model. Use evidence from the book and do not include children.`,
        structuredConfig(2),
      );
      return parsePromptItems(textFromResponse(response), 2);
    },

    async generatePortrait(input) {
      const response = await generate(imageModel, [
        {
          text: `${IMAGE_RULES}\nStyle: ${input.style}\nCreate a character portrait illustration for ${input.characterName}. ${input.prompt}`,
        },
      ]);
      return imageFromResponse(response);
    },

    async generateChapters(input) {
      const characterContext = input.characters
        .map((character) => `${character.name}: ${character.prompt}`)
        .join("\n");
      const response = await generateFromBook(
        input.bookPath,
        `The illustration style is: ${input.style}\nKnown adult characters:\n${characterContext}\n\nChoose one representative chapter or scene from the book. Return its title and one highly descriptive prompt for a single illustration, not a multi-panel page. Reuse the character descriptions when they appear.`,
        structuredConfig(1),
      );
      const [chapter] = parsePromptItems(textFromResponse(response), 1);
      return [{ title: chapter.name, prompt: chapter.prompt }];
    },

    async generateIllustration(input) {
      const referenceParts = input.characters.flatMap((character) => {
        if (!character.portraitPath) return [];
        const filePath = path.resolve(process.env.DATA_DIR ?? "data", character.portraitPath);
        const data = fs.readFileSync(filePath).toString("base64");
        return [
          { text: `Reference portrait for ${character.name}:` },
          { inlineData: { mimeType: imageMimeType(filePath), data } },
        ];
      });
      const response = await generate(imageModel, [
        {
          text: `${IMAGE_RULES}\nStyle: ${input.style}\nCreate one chapter illustration for "${input.chapterTitle}": ${input.prompt}\nUse the supplied portraits as character references.`,
        },
        ...referenceParts,
      ]);
      return imageFromResponse(response);
    },
  };
}
