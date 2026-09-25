"use client";

import * as React from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";
import { Paperclip, Send } from "lucide-react";

import { getSocketClient } from "@/lib/socket-client";
import { reportRoomMessage } from "@/app/actions/rooms";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/validations/message";
import { cn, formatDateFr, initials } from "@/lib/utils";

export interface RoomMessageData {
  id: string;
  roomId: string;
  authorId: string;
  content: string;
  attachmentUrl: string | null;
  deletedAt: Date | string | null;
  createdAt: Date | string;
  author: { id: string; name: string; avatarUrl: string | null };
}

interface RoomChatProps {
  room: { id: string; name: string };
  initialMessages: RoomMessageData[];
  hasMoreOlder: boolean;
  viewer: { id: string };
}

const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const TYPING_EMIT_THROTTLE_MS = 2000;
const TYPING_INDICATOR_TIMEOUT_MS = 3000;

/** E4-T03 — chat temps réel : join/messages/typing/présence via Socket.io, historique paginé. */
export function RoomChat({ room, initialMessages, hasMoreOlder, viewer }: RoomChatProps) {
  const [messages, setMessages] = React.useState(initialMessages);
  const [hasMore, setHasMore] = React.useState(hasMoreOlder);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [onlineCount, setOnlineCount] = React.useState<number | null>(null);
  const [typing, setTyping] = React.useState(false);
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [joined, setJoined] = React.useState(false);

  const socketRef = React.useRef<Socket | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const lastTypingEmitRef = React.useRef(0);
  const typingTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>();

  React.useEffect(() => {
    let cancelled = false;
    let socket: Socket | undefined;

    function handleIncoming(message: RoomMessageData) {
      if (message.roomId !== room.id) return;
      setMessages((prev) => [...prev, message]);
    }
    function handlePresence(payload: { roomId: string; count: number }) {
      if (payload.roomId === room.id) setOnlineCount(payload.count);
    }
    function handleTyping(payload: { userId: string }) {
      if (payload.userId === viewer.id) return;
      setTyping(true);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTyping(false), TYPING_INDICATOR_TIMEOUT_MS);
    }

    getSocketClient()
      .then((s) => {
        if (cancelled) return;
        socket = s;
        socketRef.current = s;
        s.on("room:message", handleIncoming);
        s.on("room:presence", handlePresence);
        s.on("room:typing", handleTyping);
        s.emit("room:join", room.id, (res: { ok: boolean }) => {
          if (cancelled) return;
          setJoined(res.ok);
          if (!res.ok) toast.error("Impossible de rejoindre cette salle.");
        });
      })
      .catch(() => toast.error("Connexion temps réel indisponible."));

    return () => {
      cancelled = true;
      socket?.emit("room:leave", room.id);
      socket?.off("room:message", handleIncoming);
      socket?.off("room:presence", handlePresence);
      socket?.off("room:typing", handleTyping);
      clearTimeout(typingTimeoutRef.current);
    };
  }, [room.id, viewer.id]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  async function loadOlder() {
    if (messages.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/rooms/${room.id}/messages?before=${messages[0].id}`);
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
      socketRef.current?.emit("room:typing", room.id);
      lastTypingEmitRef.current = now;
    }
  }

  function sendMessage(attachmentKey?: string) {
    const content = text.trim();
    if (!content && !attachmentKey) return;
    setSending(true);
    socketRef.current?.emit(
      "room:message",
      { roomId: room.id, content, attachmentKey },
      (res: { ok: boolean; error?: string }) => {
        setSending(false);
        if (res.ok) {
          setText("");
        } else if (res.error === "rate_limited") {
          toast.error("Un message à la fois — patientez une seconde.");
        } else {
          toast.error("Message non envoyé.");
        }
      }
    );
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > ATTACHMENT_MAX_BYTES) {
      toast.error("Fichier trop volumineux (5 Mo max).");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("roomId", room.id);

    setSending(true);
    try {
      const res = await fetch("/api/rooms/attachment", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Échec de l'envoi du fichier.");
        return;
      }
      sendMessage(json.data.key);
    } finally {
      setSending(false);
    }
  }

  async function handleReport(messageId: string) {
    const result = await reportRoomMessage(messageId);
    if (result.success) toast.success("Message signalé — l'équipe va l'examiner.");
    else toast.error(result.error);
  }

  return (
    <div className="flex h-[calc(100dvh-140px)] flex-col rounded-lg border border-border bg-white md:h-[calc(100vh-140px)]">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-sm font-bold text-navy">{room.name}</h2>
          <p className="text-xs text-text-muted">
            {onlineCount != null ? `${onlineCount} en ligne` : "Connexion…"}
            {typing && " · un membre est en train d'écrire…"}
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
            const mine = message.authorId === viewer.id;
            return (
              <div
                key={message.id}
                className={cn("group flex gap-2.5", mine && "flex-row-reverse")}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage
                    src={message.author.avatarUrl ?? undefined}
                    alt={message.author.name}
                  />
                  <AvatarFallback>{initials(message.author.name)}</AvatarFallback>
                </Avatar>
                <div className={cn("max-w-[75%]", mine && "text-right")}>
                  <p className="mb-1 text-xs font-semibold text-navy">
                    {mine ? "Moi" : message.author.name}
                  </p>
                  <div
                    className={cn(
                      "inline-block rounded-2xl px-4 py-2.5 text-sm",
                      mine
                        ? "rounded-tr-sm bg-navy text-white"
                        : "rounded-tl-sm border border-border bg-surface text-text-dark"
                    )}
                  >
                    {message.deletedAt ? (
                      <span className="italic text-text-muted">[Message supprimé]</span>
                    ) : (
                      <>
                        {message.content && (
                          <p className="whitespace-pre-line">{message.content}</p>
                        )}
                        {message.attachmentUrl && (
                          <a
                            href={message.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              "mt-1 block underline",
                              mine ? "text-white" : "text-navy-mid"
                            )}
                          >
                            📎 Pièce jointe
                          </a>
                        )}
                      </>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-text-muted">
                    <span>{formatDateFr(message.createdAt)}</span>
                    {!mine && !message.deletedAt && (
                      <button
                        type="button"
                        onClick={() => handleReport(message.id)}
                        className="opacity-0 transition-opacity hover:underline focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy group-hover:opacity-100 group-focus-within:opacity-100"
                      >
                        Signaler
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-white p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:pb-4">
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={!joined || sending}
            title="Joindre un fichier"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
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
            placeholder={`Écrire un message dans ${room.name}…`}
            rows={1}
            className="min-h-[40px] flex-1 resize-none"
            disabled={!joined}
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!joined || sending || !text.trim()}
            size="icon"
            aria-label="Envoyer le message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-2 text-center text-[11px] text-text-muted">
          Les échanges sont confidentiels et accessibles aux membres de CEO Summit uniquement.
        </p>
      </div>
    </div>
  );
}
