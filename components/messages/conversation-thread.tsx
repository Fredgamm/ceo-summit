"use client";

import * as React from "react";
import Link from "next/link";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";
import { ArrowLeft, Send } from "lucide-react";

import { getSocketClient } from "@/lib/socket-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/validations/message";
import { cn, formatDateFr, initials } from "@/lib/utils";

export interface ThreadMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  readAt: string | null;
  createdAt: string;
}

interface ConversationThreadProps {
  conversation: { id: string };
  otherUser: { id: string; name: string; avatarUrl: string | null };
  initialMessages: ThreadMessage[];
  hasMoreOlder: boolean;
  viewer: { id: string };
}

const RATE_LIMIT_ERROR_MSG = "Un message à la fois — patientez une seconde.";
const TYPING_EMIT_THROTTLE_MS = 2000;
const TYPING_INDICATOR_TIMEOUT_MS = 3000;

/** E7-T02 — thread temps réel : messages, frappe, indicateur "Lu", historique paginé. */
export function ConversationThread({
  conversation,
  otherUser,
  initialMessages,
  hasMoreOlder,
  viewer,
}: ConversationThreadProps) {
  const [messages, setMessages] = React.useState(initialMessages);
  const [hasMore, setHasMore] = React.useState(hasMoreOlder);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [online, setOnline] = React.useState<boolean | null>(null);
  const [typing, setTyping] = React.useState(false);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [joined, setJoined] = React.useState(false);

  const socketRef = React.useRef<Socket | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const lastTypingEmitRef = React.useRef(0);
  const typingTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    let cancelled = false;
    let socket: Socket | undefined;

    function handleIncoming(message: ThreadMessage) {
      if (message.conversationId !== conversation.id) return;
      setMessages((prev) => [...prev, message]);
      if (message.senderId !== viewer.id) socket?.emit("conversation:read", conversation.id);
    }
    function handleTyping(payload: { userId: string }) {
      if (payload.userId === viewer.id) return;
      setTyping(true);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTyping(false), TYPING_INDICATOR_TIMEOUT_MS);
    }
    function handleRead(payload: { conversationId: string; readerId: string }) {
      if (payload.conversationId !== conversation.id || payload.readerId === viewer.id) return;
      setMessages((prev) =>
        prev.map((m) => (m.readAt ? m : { ...m, readAt: new Date().toISOString() }))
      );
    }

    getSocketClient()
      .then((s) => {
        if (cancelled) return;
        socket = s;
        socketRef.current = s;
        s.on("conversation:message", handleIncoming);
        s.on("conversation:typing", handleTyping);
        s.on("conversation:read", handleRead);
        s.emit("conversation:join", conversation.id, (res: { ok: boolean }) => {
          if (cancelled) return;
          setJoined(res.ok);
          if (res.ok) s.emit("conversation:read", conversation.id);
          else toast.error("Impossible d'ouvrir cette conversation.");
        });
        s.emit("users:presence", [otherUser.id], (result: Record<string, boolean>) => {
          if (!cancelled) setOnline(result[otherUser.id] ?? false);
        });
      })
      .catch(() => toast.error("Connexion temps réel indisponible."));

    return () => {
      cancelled = true;
      socket?.off("conversation:message", handleIncoming);
      socket?.off("conversation:typing", handleTyping);
      socket?.off("conversation:read", handleRead);
      clearTimeout(typingTimeoutRef.current);
    };
  }, [conversation.id, otherUser.id, viewer.id]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  async function loadOlder() {
    if (messages.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/messagerie/${conversation.id}/messages?before=${messages[0].id}`
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error("Impossible de charger les messages précédents.");
        return;
      }
      if (json.data.length < 50) setHasMore(false);
      setMessages((prev) => [...json.data, ...prev]);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleTypingInput() {
    const now = Date.now();
    if (now - lastTypingEmitRef.current > TYPING_EMIT_THROTTLE_MS) {
      socketRef.current?.emit("conversation:typing", conversation.id);
      lastTypingEmitRef.current = now;
    }
  }

  function sendMessage() {
    const content = text.trim();
    if (!content) return;
    setSending(true);
    socketRef.current?.emit(
      "conversation:message",
      { conversationId: conversation.id, content },
      (res: { ok: boolean; error?: string }) => {
        setSending(false);
        if (res.ok) setText("");
        else
          toast.error(res.error === "rate_limited" ? RATE_LIMIT_ERROR_MSG : "Message non envoyé.");
      }
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        <Link
          href="/messagerie"
          aria-label="Retour aux conversations"
          className="-ml-1.5 rounded p-1.5 text-text-muted hover:bg-surface md:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Avatar className="h-9 w-9">
          <AvatarImage src={otherUser.avatarUrl ?? undefined} alt={otherUser.name} />
          <AvatarFallback>{initials(otherUser.name)}</AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-sm font-bold text-navy">{otherUser.name}</h2>
          <p className="text-xs text-text-muted">
            {online == null ? "…" : online ? "● En ligne" : "Hors ligne"}
            {typing && " · en train d'écrire…"}
          </p>
        </div>
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="flex-1 overflow-y-auto px-5 py-4"
      >
        {hasMore && (
          <div className="mb-3 text-center">
            <Button variant="outline" size="sm" onClick={loadOlder} disabled={loadingMore}>
              {loadingMore ? "Chargement…" : "Charger les messages précédents"}
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {messages.map((message) => {
            const mine = message.senderId === viewer.id;
            return (
              <div key={message.id} className={cn("flex", mine && "justify-end")}>
                <div className={cn("max-w-[75%]", mine && "text-right")}>
                  <div
                    className={cn(
                      "inline-block rounded-2xl px-4 py-2.5 text-sm",
                      mine
                        ? "rounded-tr-sm bg-navy text-white"
                        : "rounded-tl-sm border border-border bg-surface text-text-dark"
                    )}
                  >
                    <p className="whitespace-pre-line">{message.content}</p>
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted">
                    {formatDateFr(message.createdAt)}
                    {mine && (message.readAt ? " · ✓✓" : " · ✓")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border p-4">
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            onChange={(e) => {
              setText(e.target.value);
              handleTypingInput();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={`Écrire un message à ${otherUser.name}…`}
            rows={1}
            className="min-h-[40px] flex-1 resize-none"
            disabled={!joined}
          />
          <Button
            onClick={sendMessage}
            disabled={!joined || sending || !text.trim()}
            size="icon"
            aria-label="Envoyer le message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
