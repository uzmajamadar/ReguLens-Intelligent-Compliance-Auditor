/* eslint-disable react-hooks/purity -- all Date.now/new Date calls are in event handlers, not during render */
import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import Markdown from "react-markdown";
import {
  useListDocuments,
  useListGroqConversations,
  getListGroqConversationsQueryKey,
  useCreateGroqConversation,
  useDeleteGroqConversation,
  useListGroqMessages,
  getListGroqMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Plus, Send, Loader2, Bot, User, FileText, Trash2 } from "lucide-react";

function MessageBubble({ role, content, streaming }) {
  const isUser = role === "user";
  return (
    <div
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
      data-testid={`message-${role}`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div
        className={`max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed prose prose-sm ${
          isUser ? "bg-primary text-primary-foreground prose-invert" : "bg-muted text-foreground"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <Markdown>{content}</Markdown>
        )}
        {streaming && (
          <span className="inline-block w-1.5 h-3.5 bg-current animate-pulse ml-0.5" />
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const preselectedDocId = searchParams.get("documentId");
  const hasPreselectedDoc = preselectedDocId != null;

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedDocumentId, setSelectedDocumentId] = useState(
    preselectedDocId ?? "none"
  );
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [streamingContent, setStreamingContent] = useState(null);
  const [sending, setSending] = useState(false);
  const [convPanelOpen, setConvPanelOpen] = useState(true);

  const messagesEndRef = useRef(null);
  const msgIdCounter = useRef(0);

  const selectedDocNumericId = useMemo(() => {
    if (!hasPreselectedDoc) return null;
    const n = Number(preselectedDocId);
    return Number.isFinite(n) ? n : null;
  }, [hasPreselectedDoc, preselectedDocId]);

  const { data: docs } = useListDocuments();

  // If ?documentId is present we lock the UI (no dropdown switching).
  // Derive the effective doc directly from URL to avoid setState in effects.
  const effectiveDocumentId = hasPreselectedDoc ? preselectedDocId : selectedDocumentId;


  const { data: conversations, isLoading: convsLoading } = useListGroqConversations(
    effectiveDocumentId !== "none" ? { documentId: Number(effectiveDocumentId) } : undefined,
    {
      query: {
        queryKey: getListGroqConversationsQueryKey(
          effectiveDocumentId !== "none" ? { documentId: Number(effectiveDocumentId) } : undefined
        ),
      },
    }
  );

  const { data: messages, isLoading: msgsLoading } = useListGroqMessages(activeConversationId ?? 0, {
    query: {
      enabled: !!activeConversationId,
      queryKey: getListGroqMessagesQueryKey(activeConversationId ?? 0),
    },
  });

  const createConversation = useCreateGroqConversation();
  const deleteConversation = useDeleteGroqConversation();


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const getDocumentLabel = (documentId) => {
    const found = docs?.find((d) => d.id === documentId);
    return found?.original_filename || found?.filename || "Selected document";
  };

  const handleNewConversation = async () => {
    const docId = effectiveDocumentId !== "none" ? Number(effectiveDocumentId) : undefined;
    const docName = docId != null ? getDocumentLabel(docId) : undefined;

    try {
      const conv = await createConversation.mutateAsync({
        data: {
          title: docName ? `Chat about ${docName}` : `Compliance Chat ${new Date().toLocaleTimeString()}`,
          documentId: docId,
        },
      });

      queryClient.invalidateQueries({
        queryKey: getListGroqConversationsQueryKey(docId != null ? { documentId: docId } : undefined),
      });

      setActiveConversationId(conv.id);
    } catch {
      toast({ title: "Could not create conversation", variant: "destructive" });
    }
  };

  const handleSend = async () => {
    if (!messageText.trim() || !activeConversationId || sending) return;

    const content = messageText.trim();
    setMessageText("");
    setSending(true);
    setStreamingContent("");

    const persistMessages = (msgs) => {
      const key = "groq_messages";
      const all = JSON.parse(localStorage.getItem(key) || "{}");
      all[activeConversationId] = msgs;
      localStorage.setItem(key, JSON.stringify(all));
    };

    const getMessages = () => {
      const key = "groq_messages";
      return JSON.parse(localStorage.getItem(key) || "{}")[activeConversationId] || [];
    };

    try {
      const timestamp = Date.now();
      const newUserMsg = { id: `${timestamp}-${msgIdCounter.current++}`, role: "user", content, createdAt: new Date(timestamp).toISOString() };
      const existing = getMessages();
      persistMessages([...existing, newUserMsg]);
      const docId = effectiveDocumentId !== "none" ? Number(effectiveDocumentId) : undefined;
      const token = sessionStorage.getItem("regulens_token");
      const response = await fetch(`/api/groq/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ content, document_id: docId }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Stream failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.done) break;
              if (data.error) {
                toast({ title: "AI response error", description: data.error, variant: "destructive" });
                break;
              }
              if (data.content) {
                fullText += data.content;
                setStreamingContent(fullText);
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      }

      setStreamingContent(null);

      const newAssistantMsg = { id: `${Date.now()}-${msgIdCounter.current++}`, role: "assistant", content: fullText, createdAt: new Date().toISOString() };
      persistMessages([...getMessages(), newAssistantMsg]);
      queryClient.invalidateQueries({
        queryKey: getListGroqMessagesQueryKey(activeConversationId),
      });
    } catch {
      setStreamingContent(null);
      toast({ title: "Failed to send message", description: "Please try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleDeleteConversation = async (e, convId) => {
    e.stopPropagation();
    if (activeConversationId === convId) setActiveConversationId(null);
    deleteConversation.mutate({ id: convId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["groq-conversations"] });
      },
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AppLayout>
      <div className="flex h-full overflow-hidden">
        <div className={`${convPanelOpen ? "w-64" : "w-0"} shrink-0 border-r border-border bg-card flex flex-col overflow-hidden transition-all duration-300`}>
          <div className="p-4 border-b border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Document</p>

            {hasPreselectedDoc ? (
              <div className="text-sm text-foreground">
                <div className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="truncate">
                      {selectedDocNumericId != null ? getDocumentLabel(selectedDocNumericId) : "Selected document"}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <Select
                value={selectedDocumentId}
                onValueChange={(v) => {
                  setSelectedDocumentId(v);
                  setActiveConversationId(null);
                }}
              >
                <SelectTrigger className="w-full text-sm" data-testid="select-document">
                  <SelectValue placeholder="All documents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All documents</SelectItem>
                  {docs?.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)} data-testid={`option-document-${d.id}`}>
                      <span className="truncate max-w-40 block">{d.original_filename || d.filename || "Untitled document"}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              size="sm"
              className="w-full"
              onClick={handleNewConversation}
              disabled={createConversation.isPending}
              data-testid="button-new-conversation"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Conversation
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {convsLoading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)
              ) : !conversations?.length ? (
                <p className="text-xs text-muted-foreground text-center py-6">No conversations yet</p>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors ${
                      activeConversationId === conv.id
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => setActiveConversationId(conv.id)}
                    data-testid={`conversation-item-${conv.id}`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-xs flex-1 truncate">{conv.title}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 invisible group-hover:visible text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDeleteConversation(e, conv.id)}
                      data-testid={`delete-conversation-${conv.id}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {!activeConversationId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 p-8">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Start a conversation</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Select a document, then click "New Conversation" to chat with ReguLens AI about compliance questions.
                </p>
              </div>
              <Button size="sm" className="gap-2" onClick={handleNewConversation} disabled={createConversation.isPending}>
                <Plus className="w-3.5 h-3.5" />
                New Conversation
              </Button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="w-3.5 h-3.5" />
                {effectiveDocumentId !== "none"
                  ? `Asking about: ${getDocumentLabel(Number(effectiveDocumentId)) ?? "selected document"}`
                  : "No document selected — responses will be general"}
              </div>

              <div className="w-full max-w-lg">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Suggested Questions</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    "What are the highest-risk GDPR violations?",
                    "Summarize compliance gaps.",
                    "Suggest remediation steps.",
                    "Generate legal review notes.",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={async () => {
                        try {
                          const docId = effectiveDocumentId !== "none" ? Number(effectiveDocumentId) : undefined;
                          const docName = docId != null ? getDocumentLabel(docId) : undefined;
                          const conv = await createConversation.mutateAsync({
                            data: {
          title: docName ? `Chat about ${docName}` : `Compliance Chat ${new Date().toLocaleTimeString()}`,
                              documentId: docId,
                            },
                          });
                          queryClient.invalidateQueries({
                            queryKey: getListGroqConversationsQueryKey(docId != null ? { documentId: docId } : undefined),
                          });
                          setActiveConversationId(conv.id);
                          setMessageText(q);
                          setTimeout(() => handleSend(), 50);
                        } catch {
                          toast({ title: "Could not create conversation", variant: "destructive" });
                        }
                      }}
                      className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-left text-sm text-foreground hover:bg-accent hover:border-accent-foreground/20 transition-all"
                    >
                      <MessageSquare className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
                      <span>{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 flex items-center gap-2 bg-background/80 backdrop-blur-sm px-1 pt-1 pb-0">
                <button
                  onClick={() => setConvPanelOpen(!convPanelOpen)}
                  className="inline-flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  title="Toggle conversation panel"
                >
                  <MessageSquare className="size-4" />
                </button>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4 max-w-3xl mx-auto">
                  {msgsLoading ? (
                    <div className="flex flex-col gap-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className={`h-10 ${i % 2 === 0 ? "w-3/4" : "w-1/2 ml-auto"}`} />
                      ))}
                    </div>
                  ) : !messages?.length ? (
                    <div className="text-center text-sm text-muted-foreground py-12">
                      Ask anything about your document's compliance posture.
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
                    ))
                  )}

                  {streamingContent !== null && (
                    <MessageBubble role="assistant" content={streamingContent} streaming />
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="border-t border-border p-4 bg-card">
                <div className="max-w-3xl mx-auto flex gap-2">
                  <Textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about compliance gaps, policy clauses, or risk areas... (Enter to send)"
                    className="resize-none min-h-11 max-h-45 text-sm"
                    rows={1}
                    disabled={sending}
                    data-testid="input-message"
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!messageText.trim() || sending}
                    data-testid="button-send-message"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">Shift+Enter for new line · Enter to send</p>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}