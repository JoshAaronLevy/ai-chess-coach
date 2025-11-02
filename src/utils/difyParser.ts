import { z } from 'zod';

/**
 * Zod schema for validating the move structure
 */
const MoveSchema = z.object({
  uci: z.string(),
  san: z.string(),
});

/**
 * Zod schema for validating alternative moves
 */
const AlternativeSchema = z.object({
  uci: z.string(),
  san: z.string(),
  why: z.string(),
});

/**
 * Zod schema for difficulty-based moves
 */
const DifficultyMoveSchema = z.object({
  uci: z.string().optional().nullable(),
  san: z.string().optional().nullable(),
  why: z.string().optional(),
});

/**
 * Zod schema for next moves by difficulty
 */
const NextMovesSchema = z.object({
  beginner: DifficultyMoveSchema.optional(),
  intermediate: DifficultyMoveSchema.optional(),
  advanced: DifficultyMoveSchema.optional(),
  reasoning: z.string().optional(),
});

/**
 * Zod schema for validating the parsed answer content from Dify
 */
const DifyAnswerContentSchema = z.object({
  position_id: z.string().optional(),
  side_to_move: z.string().optional(),
  fen: z.string().optional(),
  last_move: MoveSchema.optional(),
  last_move_grade: z.string().optional(),
  last_move_explanation: z.string().optional(),
  best_move: MoveSchema.optional(),
  next_moves: NextMovesSchema.optional(),
  alternatives: z.array(AlternativeSchema).optional(),
  reasoning: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

/**
 * Zod schema for validating the raw Dify response
 */
const DifyResponseSchema = z.object({
  event: z.string().optional(),
  answer: z.union([z.string(), z.object({}).passthrough()]),
  metadata: z.object({}).passthrough().optional(),
  created_at: z.number().optional(),
});

/**
 * TypeScript interface for the expected output structure
 */
export interface TutorInsights {
  lastMove: {
    grade: string | null;
    explanation: string | null;
  };
  bestMove: {
    uci: string;
    san: string;
  } | null;
  next_moves?: {
    beginner?: { uci?: string | null; san?: string | null; why?: string };
    intermediate?: { uci?: string | null; san?: string | null; why?: string };
    advanced?: { uci?: string | null; san?: string | null; why?: string };
    reasoning?: string;
  };
  alternatives: Array<{
    uci: string;
    san: string;
    why: string;
  }>;
  reasoning: string | null;
  confidence: number | null;
}

/**
 * Attempts to extract and parse JSON from a string that may contain extra text
 * or escaped characters around the JSON content.
 * 
 * @param input - String that may contain JSON
 * @returns Parsed JSON object or null if parsing fails
 */
function extractJsonFromString(input: string): unknown {
  // First, try parsing the string directly
  try {
    return JSON.parse(input);
  } catch {
    // If direct parsing fails, try to find JSON within the string
    
    // Look for content between first { and last }
    const firstBrace = input.indexOf('{');
    const lastBrace = input.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = input.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(jsonCandidate);
      } catch {
        // If that fails, try cleaning up escaped newlines and other common issues
        const cleaned = jsonCandidate
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r');
        
        try {
          return JSON.parse(cleaned);
        } catch {
          // Final attempt: remove all escape characters
          const superCleaned = jsonCandidate.replace(/\\/g, '');
          try {
            return JSON.parse(superCleaned);
          } catch {
            return null;
          }
        }
      }
    }
    
    return null;
  }
}

/**
 * Parses a raw Dify response and extracts tutor insights for chess coaching.
 * 
 * This function handles various edge cases including:
 * - JSON strings with escaped newlines
 * - Already parsed JSON objects
 * - Extra text around JSON content
 * - Malformed JSON
 * - Missing or null fields
 * 
 * @param rawResponse - The raw response object from Dify API
 * @returns Parsed tutor insights or null if parsing fails
 * 
 * @example
 * ```typescript
 * const rawResponse = {
 *   event: "message",
 *   answer: "{\n  \"last_move_grade\": \"A\",\n  \"best_move\": { \"uci\": \"d2d4\", \"san\": \"d4\" }\n}",
 *   created_at: 1759245808
 * };
 * 
 * const insights = parseDifyAnswer(rawResponse);
 * if (insights) {
 *   console.log('Move grade:', insights.lastMove.grade);
 *   console.log('Best move:', insights.bestMove);
 * }
 * ```
 */
export function parseDifyAnswer(rawResponse: unknown): TutorInsights | null {
  try {
    // Validate the basic structure of the raw response
    const validatedResponse = DifyResponseSchema.parse(rawResponse);
    
    let answerContent: unknown;
    
    // Handle the answer field - it could be a string or already parsed object
    if (typeof validatedResponse.answer === 'string') {
      answerContent = extractJsonFromString(validatedResponse.answer);
      if (answerContent === null) {
        console.warn('[DifyParser] Failed to extract JSON from answer string');
        return null;
      }
    } else {
      answerContent = validatedResponse.answer;
    }
    
    // Validate the parsed answer content against our schema
    const validatedContent = DifyAnswerContentSchema.parse(answerContent);
    
    // Transform the data to match the expected output structure
    const tutorInsights: TutorInsights = {
      lastMove: {
        grade: validatedContent.last_move_grade || null,
        explanation: validatedContent.last_move_explanation || null,
      },
      bestMove: validatedContent.best_move ? {
        uci: validatedContent.best_move.uci,
        san: validatedContent.best_move.san,
      } : null,
      next_moves: validatedContent.next_moves,
      alternatives: validatedContent.alternatives || [],
      reasoning: validatedContent.reasoning || null,
      confidence: validatedContent.confidence || null,
    };
    
    return tutorInsights;
    
  } catch (error) {
    // Log a single concise warning on parsing failure
    if (error instanceof z.ZodError) {
      console.warn('[DifyParser] Validation failed:', error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '));
    } else {
      console.warn('[DifyParser] Parsing failed:', error instanceof Error ? error.message : 'Unknown error');
    }
    return null;
  }
}

/**
 * Alias for parseDifyAnswer - alternative naming as requested in requirements
 */
export const extractTutorInsights = parseDifyAnswer;