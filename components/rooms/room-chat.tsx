"use client";

import * as React from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft, FileText, Lock, Paperclip, Send } from "lucide-react";

import { getSocketClient, onSocketReconnect } from "@/lib/socket-client";
import { reportRoomMessage } from "@/app/actions/rooms";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CHAT_MESSAGE_MAX_LENGTH } from "@/lib/validations/message";
import { cn, initials } from "@/lib/utils";

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
  room: { id: string; name: string; sector: string };
  initialMessages: RoomMessageData[];
  hasMoreOlder: boolean;
  viewer: { id: string };
}

const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * 14 oct. 2026 — lecture mobile : séparateur par jour, heure sur chaque
 * message, messages consécutifs d'un même auteur regroupés (avatar et nom
 * une seule fois). Fuseau de la plateforme, comme lib/utils.ts::formatDateFr.
 */
const TIME_ZONE = "Indian/Antananarivo";
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });
const timeFormat = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const dayFormat = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

function dayLabel(date: Date): string {
  const key = dayKeyFormat.format(date);
  const today = new Date();
  if (key === dayKeyFormat.format(today)) return "Aujourd'hui";
  if (key === dayKeyFormat.format(new Date(today.getTime() - 86_400_000))) return "Hier";
  const label = dayFormat.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
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
  const typingTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  React.useEffect(() => {
    let cancelled = false;
    let socket: Socket | undefined;
    let stopRejoining: (() => void) | undefined;

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
        const join = () =>
          s.emit("room:join", room.id, (res: { ok: boolean }) => {
            if (cancelled) return;
            setJoined(res.ok);
            if (!res.ok) toast.error("Impossible de rejoindre cette salle.");
          });
        join();
        stopRejoining = onSocketReconnect(s, join);
      })
      .catch(() => toast.error("Connexion temps réel indisponible."));

    return () => {
      cancelled = true;
      stopRejoining?.();
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

  // Zone de saisie qui grandit avec le texte (jusqu'à ~5 lignes).
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [text]);

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
    // 14 oct. 2026 — mobile : pleine largeur et pleine hauteur entre l'en-tête
    // (52 px) et la barre du bas (54 px + zone de sécurité) ; les marges
    // négatives annulent le padding d'AppShell pour que la page ne défile pas
    // (seule la conversation défile). Lien retour et secteur dans l'en-tête.
    <div className="-mx-4 -mb-24 -mt-3 flex h-[calc(100dvh-106px-env(safe-area-inset-bottom,0px))] flex-col bg-white md:m-0 md:h-[calc(100vh-56px)] md:rounded-lg md:border md:border-border">
      <div className="flex items-center gap-2 border-b border-border px-2 py-2.5 md:px-4">
        <Link
          href="/salles"
          aria-label="Retour aux salles"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-navy hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-bold leading-tight text-navy">{room.name}</h1>
          <p className="truncate text-xs text-text-muted">
            {typing ? (
              <span className="text-navy-mid">Un membre est en train d&apos;écrire…</span>
            ) : (
              <>
                {room.sector}
                {onlineCount != null && (
                  <>
                    {" · "}
                    <span className="text-emerald-700">{onlineCount} en ligne</span>
                  </>
                )}
              </>
            )}
          </p>
        </div>
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="flex-1 overflow-y-auto px-3 py-3 md:px-5"
      >
        <p className="mx-auto mb-3 flex max-w-xs items-center justify-center gap-1.5 text-center text-[11px] text-text-muted">
          <Lock className="h-3 w-3 shrink-0" aria-hidden />
          Échanges confidentiels entre membres.
        </p>

        {hasMore && (
          <div className="mb-3 text-center">
            <Button variant="outline" size="sm" onClick={loadOlder} disabled={loadingMore}>
              {loadingMore ? "Chargement…" : "Messages précédents"}
            </Button>
          </div>
        )}

        {messages.length === 0 && (
          <p className="mt-10 text-center text-sm text-text-muted">
            Aucun message pour l&apos;instant. Lancez la discussion !
          </p>
        )}

        <ol className="flex flex-col">
          {messages.map((message, index) => {
            const mine = message.authorId === viewer.id;
            const at = new Date(message.createdAt);
            const previous = messages[index - 1];
            const previousAt = previous ? new Date(previous.createdAt) : null;
            const newDay =
              !previousAt || dayKeyFormat.format(previousAt) !== dayKeyFormat.format(at);
            const grouped =
              !newDay &&
              previous?.authorId === message.authorId &&
              previousAt != null &&
              at.getTime() - previousAt.getTime() < GROUP_WINDOW_MS;

            return (
              <li key={message.id} className={cn(grouped ? "mt-1" : "mt-4 first:mt-0")}>
                {newDay && (
                  <div className="my-3 flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" aria-hidden />
                    <span
                      className="rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-medium text-text-muted"
                      suppressHydrationWarning
                    >
                      {dayLabel(at)}
                    </span>
                    <span className="h-px flex-1 bg-border" aria-hidden />
                  </div>
                )}
                <div className={cn("group flex items-end gap-2", mine && "flex-row-reverse")}>
                  {mine ? null : grouped ? (
                    <span className="w-8 shrink-0" aria-hidden />
                  ) : (
                    <Avatar className="h-8 w-8 shrink-0 self-start">
                      <AvatarImage src={message.author.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback className="text-[11px]">
                        {initials(message.author.name)}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn("flex max-w-[80%] flex-col", mine ? "items-end" : "items-start")}
                  >
                    {!mine && !grouped && (
                      <p className="mb-1 px-1 text-xs font-semibold text-navy">
                        {message.author.name}
                      </p>
                    )}
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2 text-[15px] leading-snug",
                        mine
                          ? "bg-navy text-white"
                          : "border border-border bg-surface text-text-dark",
                        !grouped && (mine ? "rounded-tr-md" : "rounded-tl-md")
                      )}
                    >
                      {message.deletedAt ? (
                        <span className="italic text-text-muted">Message supprimé</span>
                      ) : (
                        <>
                          {message.content && (
                            <p className="whitespace-pre-line break-words">{message.content}</p>
                          )}
                          {message.attachmentUrl && (
                            <a
                              href={message.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                "flex items-center gap-1.5 font-medium underline-offset-4 hover:underline",
                                message.content && "mt-1.5",
                                mine ? "text-white" : "text-navy-mid"
                              )}
                            >
                              <FileText className="h-4 w-4 shrink-0" aria-hidden />
                              Pièce jointe
                            </a>
                          )}
                        </>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 px-1 text-[11px] text-text-muted">
                      <time dateTime={at.toISOString()} suppressHydrationWarning>
                        {timeFormat.format(at)}
                      </time>
                      {!mine && !message.deletedAt && (
                        <button
                          type="button"
                          onClick={() => handleReport(message.id)}
                          className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy md:opacity-0 md:transition-opacity md:focus-visible:opacity-100 md:group-hover:opacity-100"
                        >
                          Signaler
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="border-t border-border bg-white px-2 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)] md:px-4 md:py-3">
        <div className="flex items-end gap-1.5">
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
            aria-label="Joindre un fichier (image ou PDF, 5 Mo max)"
            className="shrink-0 rounded-full"
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <Textarea
            ref={textareaRef}
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
            placeholder="Votre message…"
            aria-label={`Écrire un message dans ${room.name}`}
            rows={1}
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl py-2.5 text-[15px] leading-snug"
            disabled={!joined}
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!joined || sending || !text.trim()}
            size="icon"
            aria-label="Envoyer le message"
            className="shrink-0 rounded-full"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
