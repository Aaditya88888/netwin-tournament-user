import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize the Gemini AI with the API key from environment variables
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

export interface ScreenshotAnalysisResult {
  success: boolean;
  kills: number;
  position: number;
  isAuthentic: boolean;
  confidence: number;
  reasoning?: string;
  error?: string;
}

/**
 * Service to analyze tournament screenshots using Gemini AI
 */
export class GeminiService {
  /**
   * Analyzes a screenshot to extract kills and rank, and check for tampering
   */
  static async analyzeScreenshot(base64Image: string): Promise<ScreenshotAnalysisResult> {
    try {
      if (!API_KEY) {
        throw new Error("Gemini API Key is not configured");
      }

      // The Gemini 1.5 Pro model is recommended for image analysis
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // Convert base64 to the format expected by Google Generative AI
      const imageData = base64Image.split(",")[1] || base64Image;
      const part = {
        inlineData: {
          data: imageData,
          mimeType: "image/jpeg",
        },
      };

      const prompt = `
        You are an expert game tournament adjudicator. Analyze this gaming tournament result screenshot (likely from BGMI, Free Fire, or PUBG).
        
        Tasks:
        1. Check if the image is an authentic, unedited screenshot from a game result screen. Look for signs of digital tampering, mismatched fonts, or fake overlays.
        2. Extract the "Total Kills" achieved by the player.
        3. Extract the "Final Position" or "Rank" achieved by the player.
        
        Return the result strictly as a JSON object with the following structure:
        {
          "kills": number,
          "position": number,
          "isAuthentic": boolean,
          "confidence": number, (a decimal between 0 and 1)
          "reasoning": "Brief explanation of your findings"
        }
        
        Only return the JSON object, nothing else.
      `;

      const result = await model.generateContent([prompt, part]);
      const response = await result.response;
      const text = response.text();
      
      // Extract JSON from the response text
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0]);
          return {
            success: true,
            kills: analysis.kills || 0,
            position: analysis.position || 0,
            isAuthentic: analysis.isAuthentic ?? true,
            confidence: analysis.confidence || 0.5,
            reasoning: analysis.reasoning
          };
        }
        throw new Error("Failed to parse JSON from AI response");
      } catch (parseError) {
        console.error("AI Response Parsing Error:", text);
        return {
          success: false,
          kills: 0,
          position: 0,
          isAuthentic: false,
          confidence: 0,
          error: "Failed to interpret AI response"
        };
      }
    } catch (error) {
      console.error("Gemini AI Analysis Error:", error);
      return {
        success: false,
        kills: 0,
        position: 0,
        isAuthentic: false,
        confidence: 0,
        error: (error as Error).message
      };
    }
  }
}
