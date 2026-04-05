export interface Player {
  name: string;
  characterName: string;
  characterDesc: string;
}

export interface NarrativeEntry {
  text: string;
  actingPlayer: number;
  action: string;
}

export type Phase = "lobby" | "setup" | "playing" | "finished";
export type GameMode = "local" | "host" | "guest";

export interface SyncState {
  phase: Phase;
  player1: Player;
  player2: Player;
  scenario: string;
  currentTurn: 1 | 2;
  narrativeHistory: NarrativeEntry[];
  currentNarrative: string;
  options: string[];
  isLoading: boolean;
}

export type PeerMessage =
  | { type: "playerInfo"; player: Player }
  | { type: "action"; action: string }
  | { type: "stateSync"; state: SyncState }
  | { type: "startGame" };

export const EMPTY_PLAYER: Player = {
  name: "",
  characterName: "",
  characterDesc: "",
};
