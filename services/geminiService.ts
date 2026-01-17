
/// <reference types="vite/client" />
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult, ShotType } from "../types";

export const analyzeImages = async (
  characterImages: string[], 
  sceneImages: string[], 
  userDescription?: string, 
  shotCount: number = 9
): Promise<AnalysisResult> => {
 const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  
  const charParts = characterImages.map(data => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: data.split(',')[1]
    }
  }));

  const sceneParts = sceneImages.map(data => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: data.split(',')[1]
    }
  }));

  const userContext = userDescription 
    ? `The user wants to achieve this specific plot/atmosphere: "${userDescription}".`
    : "";

  const prompt = `You are a world-class cinematic director and cinematographer. 
  ${charParts.length > 0 ? 'I have provided CHARACTER reference images. Use them to define character appearance, clothing, and persona.' : ''}
  ${sceneParts.length > 0 ? 'I have provided SCENE/ENVIRONMENT reference images. Use them to define the setting, architecture, and mood.' : ''}
  ${charParts.length === 0 && sceneParts.length === 0 ? 'I have provided only a text description. Use your creative expertise to build the world from scratch.' : ''}
  
  ${userContext}

  TASK:
  1. Extract key visual elements (Scene, Characters, Lighting, Clothing, Atmosphere) based on the provided references and requested plot.
  2. Propose a coherent ${shotCount}-shot storyboard sequence.
  3. Ensure the sequence follows professional cinematic logic (e.g., Establishing -> Character intro -> Action -> Close-up reaction).
  
  The "type" MUST be one of these exact strings: ${Object.values(ShotType).join(', ')}.
  
  Return a JSON object with:
  - scene, characters, lighting, clothing, atmosphere: Detailed strings synthesizing the provided references.
  - cinematicLogic: A brief explanation of the proposed ${shotCount}-shot narrative flow.
  - suggestedShots: An array of EXACTLY ${shotCount} objects, each with { "type": string, "description": string }.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { 
      parts: [
        ...charParts, 
        ...sceneParts, 
        { text: prompt }
      ] 
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scene: { type: Type.STRING },
          characters: { type: Type.STRING },
          lighting: { type: Type.STRING },
          clothing: { type: Type.STRING },
          atmosphere: { type: Type.STRING },
          cinematicLogic: { type: Type.STRING },
          suggestedShots: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["type", "description"]
            }
          }
        },
        required: ["scene", "characters", "lighting", "clothing", "atmosphere", "cinematicLogic", "suggestedShots"]
      }
    }
  });

  const textResult = response.text || "{}";
  return JSON.parse(textResult) as AnalysisResult;
};

export const translatePrompt = async (text: string, targetLang: 'zh' | 'en'): Promise<string> => {
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });  
  const systemInstruction = targetLang === 'zh' 
    ? "你是一个专业的摄影和AI绘画专家。将提示词翻译为中文。确保使用专业术语：'Shot'翻译为'分镜'，'Close-up'为'特写'，'Medium Shot'为'中景'等。保持结构清晰。" 
    : "Translate the following AI art generation prompt to English. Keep technical terms like '8K', '16:9' accurate.";

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: text,
    config: {
      systemInstruction: systemInstruction
    }
  });

  return (response.text || "").trim();
};
