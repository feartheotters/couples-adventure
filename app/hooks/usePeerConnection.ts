"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { PeerMessage } from "../lib/types";

const PEER_PREFIX = "ca-";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No O/0/I/1

function generateCode(len = 6): string {
  let code = "";
  for (let i = 0; i < len; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export function usePeerConnection(onMessage: (msg: PeerMessage) => void) {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const cleanup = useCallback(() => {
    connRef.current?.close();
    peerRef.current?.destroy();
    connRef.current = null;
    peerRef.current = null;
    setIsConnected(false);
    setRoomCode(null);
  }, []);

  useEffect(() => {
    return () => {
      connRef.current?.close();
      peerRef.current?.destroy();
    };
  }, []);

  function setupConnection(conn: any) {
    connRef.current = conn;
    conn.on("open", () => setIsConnected(true));
    conn.on("data", (data: any) => {
      try {
        const msg: PeerMessage =
          typeof data === "string" ? JSON.parse(data) : data;
        onMessageRef.current(msg);
      } catch {
        // ignore malformed
      }
    });
    conn.on("close", () => {
      setIsConnected(false);
      setError("Connection lost. Refresh to reconnect.");
    });
    conn.on("error", (err: any) => {
      setError(err?.message || "Connection error");
    });
  }

  async function createRoom(): Promise<string> {
    setError(null);
    const code = generateCode();
    const peerId = PEER_PREFIX + code;

    const { default: Peer } = await import("peerjs");
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerId, { debug: 0 });
      peerRef.current = peer;

      peer.on("open", () => {
        setRoomCode(code);
        resolve(code);
      });

      peer.on("connection", (conn: any) => {
        setupConnection(conn);
      });

      peer.on("error", (err: any) => {
        const msg = err?.message || "Failed to create room";
        setError(msg);
        reject(new Error(msg));
      });
    });
  }

  async function joinRoom(code: string): Promise<void> {
    setError(null);
    const peerId = PEER_PREFIX + code.toUpperCase();

    const { default: Peer } = await import("peerjs");
    return new Promise((resolve, reject) => {
      const peer = new Peer(undefined as any, { debug: 0 });
      peerRef.current = peer;

      peer.on("open", () => {
        const conn = peer.connect(peerId, { reliable: true });
        setupConnection(conn);

        conn.on("open", () => {
          setRoomCode(code.toUpperCase());
          resolve();
        });
      });

      peer.on("error", (err: any) => {
        const msg =
          err?.type === "peer-unavailable"
            ? "Room not found. Check the code and try again."
            : err?.message || "Failed to join room";
        setError(msg);
        reject(new Error(msg));
      });
    });
  }

  function send(msg: PeerMessage) {
    if (connRef.current?.open) {
      connRef.current.send(JSON.stringify(msg));
    }
  }

  return {
    roomCode,
    isConnected,
    error,
    createRoom,
    joinRoom,
    send,
    cleanup,
  };
}
