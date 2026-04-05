import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

interface Player {
  name: string;
  characterName: string;
  characterDesc: string;
}

interface NarrativeEntry {
  text: string;
  actingPlayer: number;
  action: string;
}

interface GenerateRequest {
  apiKey: string;
  player1: Player;
  player2: Player;
  scenario: string;
  currentTurn: number;
  narrativeHistory: NarrativeEntry[];
  action: string;
  isStart: boolean;
}

const SYSTEM_PROMPT = `You are the narrator for an intimate, adults-only adventure game designed for romantic couples playing together.

You narrate an evolving romantic and sexual scenario between two characters, each controlled by one of the two players. Your narration should be vivid, immersive, and literary — like a well-written romance novel.

RULES:
- Generate 2-4 paragraphs of rich, descriptive narrative based on the acting player's chosen action
- Write in third person, past tense
- Build tension and intimacy progressively and naturally over the course of the game
- The tone must always be consensual, respectful, and emotionally connected
- Include sensory details: touch, sound, scent, sight, warmth
- Characters should have genuine chemistry — not just physical, but emotional
- After your narrative, provide exactly 4 action options for the NEXT player's character
- Options should offer variety: some tender/romantic, some bold/passionate, some playful
- The game naturally concludes when both characters have reached orgasm — set gameOver to true at that point
- Do NOT rush to the conclusion — let the tension build over many turns
- Each option should be 1-2 sentences describing a specific action the character takes

You MUST respond with valid JSON in exactly this format, with no other text before or after:
{
  "narrative": "Your narrative paragraphs here. Use \\n\\n to separate paragraphs.",
  "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
  "gameOver": false
}`;

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const {
      apiKey,
      player1,
      player2,
      scenario,
      currentTurn,
      narrativeHistory,
      action,
      isStart,
    } = body;

    const resolvedKey = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!resolvedKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      );
    }

    const client = new Anthropic({ apiKey: resolvedKey });

    let userMessage = "";

    if (isStart) {
      userMessage = `START A NEW GAME.

Player 1: "${player1.name}" controls the character "${player1.characterName}" — ${player1.characterDesc}
Player 2: "${player2.name}" controls the character "${player2.characterName}" — ${player2.characterDesc}

Setting/Scenario: ${scenario}

Generate the opening scene that sets the mood and scenario. End by providing 4 options for ${player1.characterName} (controlled by ${player1.name}) to begin.`;
    } else {
      const historyText = narrativeHistory
        .map((entry) => {
          const playerInfo =
            entry.actingPlayer === 1 ? player1 : player2;
          return `[${playerInfo.characterName} chose: "${entry.action}"]\n${entry.text}`;
        })
        .join("\n\n---\n\n");

      const nextPlayer = currentTurn === 1 ? player1 : player2;
      const actingPlayer = currentTurn === 1 ? player2 : player1;

      userMessage = `GAME STATE:
Player 1's character: "${player1.characterName}" — ${player1.characterDesc}
Player 2's character: "${player2.characterName}" — ${player2.characterDesc}

STORY SO FAR:
${historyText}

NOW: ${actingPlayer.characterName} chose the action: "${action}"

Continue the narrative based on this action. Then provide 4 options for ${nextPlayer.characterName} (the other player's character) to respond.

Remember: only set gameOver to true when BOTH characters have reached orgasm in the story.`;
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      return NextResponse.json(
        { error: "Unexpected response type" },
        { status: 500 }
      );
    }

    // Parse JSON from response, handling potential markdown wrapping
    let jsonText = content.text.trim();
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    const parsed = JSON.parse(jsonText);

    return NextResponse.json({
      narrative: parsed.narrative,
      options: parsed.options,
      gameOver: parsed.gameOver || false,
    });
  } catch (error: unknown) {
    console.error("Generation error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate narrative";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
