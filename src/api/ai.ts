import { apiClient } from "./client";

interface AiImageResult {
  base64?: string;
  mime?: string;
  url?: string;
  image_url?: string;
  imageUrl?: string;
  media_url?: string;
  mediaUrl?: string;
}

function toImageUri(image: AiImageResult) {
  const remoteUrl = image.url || image.image_url || image.imageUrl || image.media_url || image.mediaUrl;
  if (remoteUrl) return remoteUrl;
  if (image.base64) return `data:${image.mime || "image/png"};base64,${image.base64}`;
  return "";
}

export interface ImagePromptInput {
  idea: string;
  headline?: string;
  subline?: string;
  cta?: string;
}

// The server turns a short idea (plus optional on-image text) into a full, well-structured prompt.
export async function buildImagePrompt(input: ImagePromptInput) {
  const { data } = await apiClient.post<{ prompt: string; generation_enabled?: boolean }>(
    "/whatsapp/broadcast/templates/image-prompt",
    input
  );
  return { prompt: data.prompt || "", generationEnabled: !!data.generation_enabled };
}

export async function generateAiImages(prompt: string, count = 2) {
  const { data } = await apiClient.post<{ images?: AiImageResult[]; image?: AiImageResult }>(
    "/whatsapp/broadcast/templates/ai-image",
    { prompt, count },
    { timeout: 60000 }
  );
  const images = data.images?.length ? data.images : data.image ? [data.image] : [];
  const uris = images.map(toImageUri).filter(Boolean);
  if (!uris.length) throw new Error("The AI image API did not return an image.");
  return uris;
}
