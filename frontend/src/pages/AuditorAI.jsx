import { useState, useRef, useEffect, useMemo, useCallback } from "react";
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
import { cn } from "@/lib/utils";
import {
  Plus, Send, Loader2, MessageSquare, Trash2, Copy, RefreshCw,
  Download, FileText, X, PanelRightOpen, PanelRightClose,
  PanelLeftOpen, PanelLeftClose, Sparkles, CheckCircle2,
  AlertTriangle, Info, ExternalLink, Search, BookOpen,
  User, Clock, ChevronDown, Pin, Zap, History,
  Bot, ChevronRight, Quote,
} from "lucide-react";

const suggestedPrompts = [
  "Explain why Privacy Policy failed GDPR.",
  "Generate a HIPAA-compliant clause.",
  "Summarize today's compliance findings.",
  "Compare Version 2 and Version 3.",
  "Create an audit report.",
  "Generate remediation for failed controls.",
];

const quickTemplates = [
  { icon: Sparkles, label: "Explain GDPR violation" },
  { icon: FileText, label: "Summarize scan" },
  { icon: FileText, label: "Compare document versions" },
  { icon: Zap, label: "Generate remediation" },
  { icon: BookOpen, label: "Prepare audit report" },
];

const exampleResponse = {
  title: "Missing GDPR Consent Clause",
  reasoning: "The document does not clearly explain how users can withdraw consent. Article 7 of GDPR requires that consent be demonstrable and withdrawable at any time.",
  evidence: [
    { page: 4, text: "We collect user information including name, email, and browsing behavior to improve our services." },
    { page: 7, text: "User data is stored securely and may be shared with third-party partners." },
  ],
  recommendation: "Include language explaining that users can withdraw consent at any time by contacting the Data Protection Officer or using the preference center.",
  confidence: 94,
  references: [
    { regulation: "GDPR", article: "Article 7", title: "Conditions for Consent" },
    { regulation: "GDPR", article: "Article 17", title: "Right to Erasure ('Right to be Forgotten')" },
  ],
};

function RegulationCitation({ cite }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
      <div className="flex items-start gap-2.5">
        <BookOpen className="size-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-blue-900">{cite.regulation}</p>
          <p className="text-xs font-medium text-blue-700 mt-0.5">{cite.article}: {cite.title}</p>
          <p className="text-[11px] text-blue-600/70 mt-1 leading-relaxed">
            {cite.summary || "This article establishes requirements for..."}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-6 text-[11px] text-blue-600 shrink-0 gap-1">
          <ExternalLink className="size-3" /> View
        </Button>
      </div>
    </div>
  );
}

function EvidenceBlock({ evidence }) {
  return (
    <div className="space-y-2">
      {evidence.map((item, i) => (
        <div key={i} className="rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <FileText className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-[11px] font-medium text-muted-foreground">
              {item.document || "Document"} · Page {item.page}
            </span>
          </div>
          <div className="relative pl-3 border-l-2 border-primary/30">
            <p className="text-xs text-foreground/70 italic leading-relaxed">&ldquo;{item.text}&rdquo;</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AIResponseCard({ message, onAction }) {
  return (
    <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
      <div className="p-5 space-y-4">
        {message.title && (
          <div className="flex items-start gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="size-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{message.title}</h3>
              {message.confidence != null && (
                <span className={cn(
                  "inline-flex items-center gap-1 text-[11px] font-medium mt-0.5",
                  message.confidence >= 80 ? "text-success" : message.confidence >= 60 ? "text-warning" : "text-destructive"
                )}>
                  <CheckCircle2 className="size-3" />
                  {message.confidence}% confidence
                </span>
              )}
            </div>
          </div>
        )}

        {message.reasoning && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Reasoning</p>
            <p className="text-sm text-foreground/80 leading-relaxed">{message.reasoning}</p>
          </div>
        )}

        {message.evidence && message.evidence.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Evidence</p>
            <EvidenceBlock evidence={message.evidence} />
          </div>
        )}

        {message.recommendation && (
          <div className="rounded-lg bg-success/5 border border-success/20 p-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-success uppercase tracking-wider mb-0.5">Recommendation</p>
                <p className="text-sm text-foreground/80">{message.recommendation}</p>
              </div>
            </div>
          </div>
        )}

        {message.references && message.references.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Regulation References</p>
            <div className="space-y-1.5">
              {message.references.map((ref, i) => (
                <RegulationCitation key={i} ref={ref} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 px-5 py-2.5 border-t border-border bg-muted/20">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
          <Copy className="size-3.5" /> Copy
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
          <RefreshCw className="size-3.5" /> Regenerate
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
          <Download className="size-3.5" /> Export
        </Button>
        <span className="text-[10px] text-muted-foreground/40 mx-1">|</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
          <Plus className="size-3.5" /> Create Task
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
          <User className="size-3.5" /> Assign
        </Button>
      </div>
    </div>
  );
}

function MarkdownCard({ content, streaming }) {
  return (
    <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Bot className="size-3.5 text-primary" />
          </div>
          <span className="text-xs font-medium text-foreground">AI Compliance Copilot</span>
          {streaming && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground ml-auto">
              <span className="flex gap-0.5">
                <span className="size-1 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="size-1 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="size-1 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
              Streaming
            </span>
          )}
        </div>
        <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-p:text-foreground/80 prose-p:leading-relaxed prose-code:text-xs prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
          <Markdown>{content}</Markdown>
        </div>
      </div>
      <div className="flex items-center gap-1 px-5 py-2.5 border-t border-border bg-muted/20">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
          <Copy className="size-3.5" /> Copy
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
          <RefreshCw className="size-3.5" /> Regenerate
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
          <Download className="size-3.5" /> Export
        </Button>
      </div>
    </div>
  );
}

function WelcomeCard({ onSelectPrompt }) {
  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <div className="flex size-14 items-center justify-center rounded-xl bg-primary/10 mx-auto mb-4">
          <Sparkles className="size-7 text-primary" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Hello <span role="img" aria-label="wave">👋</span></h1>
        <p className="text-sm text-muted-foreground mt-1">How can I help with your compliance today?</p>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Suggested Prompts</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onSelectPrompt(prompt)}
              className="flex items-start gap-3 rounded-lg border border-border bg-white p-3 text-left text-sm text-foreground/80 hover:border-primary/30 hover:bg-primary/[0.02] hover:shadow-sm transition-all cursor-pointer"
            >
              <Sparkles className="size-4 shrink-0 mt-0.5 text-primary/60" />
              <span className="leading-snug">{prompt}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {[
            { icon: Sparkles, label: "Executive Summary" },
            { icon: FileText, label: "Audit Report" },
            { icon: Search, label: "Explain Finding" },
            { icon: Zap, label: "Remediation" },
            { icon: FileText, label: "Summarize Document" },
            { icon: FileText, label: "Compare Versions" },
            { icon: BookOpen, label: "Ask About Regulation" },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => onSelectPrompt(action.label)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2",
                "text-xs font-medium text-foreground/70 hover:border-primary/30 hover:text-primary transition-all cursor-pointer"
              )}
            >
              <action.icon className="size-3.5" />
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LeftSidebar({
  conversations,
  convsLoading,
  activeConvId,
  onSelectConv,
  onDeleteConv,
  onNewChat,
  createConversation,
  open,
  onToggle,
}) {
  return (
    <>
      {open && (
        <div className="w-64 shrink-0 bg-[#0F172A] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 h-12 border-b border-white/5">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="size-4 text-blue-400 shrink-0" />
              <span className="text-xs font-semibold text-white/90 truncate">AI Copilot</span>
            </div>
            <button onClick={onToggle} className="text-white/40 hover:text-white/80 transition-colors">
              <PanelLeftClose className="size-4" />
            </button>
          </div>

          <div className="p-3 border-b border-white/5">
            <Button
              size="sm"
              className="w-full h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-500 text-white shadow-sm"
              onClick={onNewChat}
              disabled={createConversation?.isPending}
            >
              <Plus className="size-3.5" />
              New Chat
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-4">
              <div>
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2 px-1">Recent Chats</p>
                {convsLoading ? (
                  <div className="space-y-1.5">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full bg-white/5" />
                    ))}
                  </div>
                ) : conversations?.length > 0 ? (
                  <div className="space-y-0.5">
                    {conversations.map((conv) => (
                      <div
                        key={conv.id}
                        onClick={() => onSelectConv(conv.id)}
                        className={cn(
                          "group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors",
                          activeConvId === conv.id
                            ? "bg-blue-600/20 text-white"
                            : "text-white/60 hover:bg-white/5 hover:text-white/80"
                        )}
                      >
                        <MessageSquare className="size-3.5 shrink-0" />
                        <span className="text-xs flex-1 truncate">{conv.title}</span>
                        <button
                          onClick={(e) => onDeleteConv(e, conv.id)}
                          className="size-5 flex items-center justify-center rounded text-white/20 hover:text-red-400 hover:bg-white/5 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-white/30 text-center py-4">No conversations yet</p>
                )}
              </div>

              <div>
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2 px-1">Quick Templates</p>
                <div className="space-y-0.5">
                  {quickTemplates.map((t) => (
                    <button
                      key={t.label}
                      className="flex w-full items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <t.icon className="size-3.5 shrink-0" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider mb-2 px-1">Pinned</p>
                <p className="text-xs text-white/30 text-center py-3">Pin important conversations to access them quickly.</p>
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
      {!open && (
        <button
          onClick={onToggle}
          className="shrink-0 w-8 flex items-center justify-center bg-[#0F172A] hover:bg-[#1a2332] text-white/40 hover:text-white/80 transition-colors"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      )}
    </>
  );
}

function ContextPanel({ open, onToggle }) {
  return (
    <>
      {open && (
        <div className="w-72 shrink-0 border-l border-border bg-white flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 h-12 border-b border-border">
            <span className="text-xs font-semibold text-foreground">Context</span>
            <button onClick={onToggle} className="text-muted-foreground hover:text-foreground transition-colors">
              <PanelRightClose className="size-4" />
            </button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Current Document</p>
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-primary shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">PrivacyPolicy_v3.pdf</span>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Current Framework</p>
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon />
                  <span className="text-sm font-medium text-foreground">GDPR</span>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Compliance Score</p>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-success">92</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-success" style={{ width: "92%" }} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Based on last scan</p>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Current Review</p>
                <p className="text-sm font-medium text-foreground">Missing Consent Clause</p>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] font-medium mt-1">
                  Pending Review
                </span>
              </div>

              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quick Context</p>
                {[
                  { icon: User, label: "Active reviewer", value: "Sarah Chen" },
                  { icon: User, label: "Assigned manager", value: "Unassigned" },
                  { icon: FileText, label: "Document version", value: "v3" },
                  { icon: Clock, label: "Last scan", value: "2 hours ago" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <item.icon className="size-3" />
                      {item.label}
                    </span>
                    <span className="font-medium text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        </div>
      )}
      {!open && (
        <button
          onClick={onToggle}
          className="shrink-0 w-7 flex items-center justify-center border-l border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
        >
          <PanelRightOpen className="size-4" />
        </button>
      )}
    </>
  );
}

function ShieldCheckIcon() {
  return (
    <svg className="size-4 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default function ComplianceCopilot() {
  const [searchParams] = useSearchParams();
  const preselectedDocId = searchParams.get("documentId");
  const hasPreselectedDoc = preselectedDocId != null;

  const queryClient = useQueryClient();

  const [selectedDocumentId, setSelectedDocumentId] = useState(preselectedDocId ?? "none");
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [streamingContent, setStreamingContent] = useState(null);
  const [sending, setSending] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [showDemo, setShowDemo] = useState(true);

  const messagesEndRef = useRef(null);
  const msgIdCounter = useRef(0);

  const selectedDocNumericId = useMemo(() => {
    if (!hasPreselectedDoc) return null;
    const n = Number(preselectedDocId);
    return Number.isFinite(n) ? n : null;
  }, [hasPreselectedDoc, preselectedDocId]);

  const { data: docs } = useListDocuments();
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

  const handleSelectConversation = (convId) => {
    setActiveConversationId(convId);
    if (showDemo) setShowDemo(false);
  };

  const getDocumentLabel = useCallback((documentId) => {
    const found = docs?.find((d) => d.id === documentId);
    return found?.original_filename || found?.filename || "Selected document";
  }, [docs]);

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
      // toast handled by API client
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
      const newUserMsg = {
        id: `${timestamp}-${msgIdCounter.current++}`,
        role: "user",
        content,
        createdAt: new Date(timestamp).toISOString(),
      };
      const existing = getMessages();
      persistMessages([...existing, newUserMsg]);
      const docId = effectiveDocumentId !== "none" ? Number(effectiveDocumentId) : undefined;
      const token = sessionStorage.getItem("regulens_token");
      const response = await fetch(`/api/groq/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content, document_id: docId }),
      });

      if (!response.ok || !response.body) throw new Error("Stream failed");

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
              if (data.error) break;
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
      const newAssistantMsg = {
        id: `${Date.now()}-${msgIdCounter.current++}`,
        role: "assistant",
        content: fullText,
        createdAt: new Date().toISOString(),
      };
      persistMessages([...getMessages(), newAssistantMsg]);
      queryClient.invalidateQueries({
        queryKey: getListGroqMessagesQueryKey(activeConversationId),
      });
    } catch {
      setStreamingContent(null);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteConversation = (e, convId) => {
    e.stopPropagation();
    if (activeConversationId === convId) setActiveConversationId(null);
    deleteConversation.mutate(
      { id: convId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["groq-conversations"] });
        },
      }
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectPrompt = async (prompt) => {
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
      setMessageText(prompt);
      setTimeout(() => handleSend(), 50);
    } catch {
      // toast handled by API client
    }
  };

  const hasActiveConv = !!activeConversationId;

  return (
    <AppLayout>
      <div className="flex h-full -mx-6 -mb-6 max-w-none overflow-hidden bg-[#F8FAFC]">
        <LeftSidebar
          conversations={conversations}
          convsLoading={convsLoading}
          activeConvId={activeConversationId}
          onSelectConv={setActiveConversationId}
          onDeleteConv={handleDeleteConversation}
          onNewChat={handleNewConversation}
          createConversation={createConversation}
          open={leftSidebarOpen}
          onToggle={() => setLeftSidebarOpen(!leftSidebarOpen)}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center justify-between px-6 h-14 border-b border-border bg-white shrink-0">
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold text-foreground">AI Compliance Copilot</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                Ask questions about your documents, regulations, compliance findings, and remediation.
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5" onClick={handleNewConversation} disabled={createConversation?.isPending}>
                <Plus className="size-3.5" /> New Chat
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5">
                <History className="size-3.5" /> History
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5">
                <Download className="size-3.5" /> Export
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-2">
                <svg className="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Button>
            </div>
          </header>

          <ScrollArea className="flex-1">
            <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
              {!hasActiveConv && showDemo ? (
                <>
                  <WelcomeCard onSelectPrompt={handleSelectPrompt} />

                  <div className="pt-2">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Example Response</p>
                    <AIResponseCard message={exampleResponse} />
                  </div>
                </>
              ) : hasActiveConv ? (
                <>
                  {msgsLoading ? (
                    <div className="space-y-4">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="rounded-xl border border-border bg-white p-5 space-y-3">
                          <Skeleton className="h-4 w-48" />
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-3/4" />
                          <Skeleton className="h-20 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : messages?.length > 0 ? (
                    messages.map((msg) =>
                      msg.role === "user" ? (
                        <div key={msg.id} className="flex justify-end">
                          <div className="max-w-[70%] rounded-xl bg-primary/5 border border-primary/10 px-4 py-3">
                            <div className="flex items-center gap-2 mb-1">
                              <User className="size-3.5 text-primary shrink-0" />
                              <span className="text-[11px] font-medium text-primary">You</span>
                            </div>
                            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{msg.content}</p>
                          </div>
                        </div>
                      ) : (
                        <MarkdownCard key={msg.id} content={msg.content} />
                      )
                    )
                  ) : (
                    <div className="text-center py-12">
                      <MessageSquare className="size-8 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">Start the conversation</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Type a message below to ask about compliance.</p>
                    </div>
                  )}

                  {streamingContent !== null && (
                    <MarkdownCard content={streamingContent} streaming />
                  )}

                  <div ref={messagesEndRef} />
                </>
              ) : null}
            </div>
          </ScrollArea>

          <div className="shrink-0 border-t border-border bg-white px-6 py-4">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-end gap-2 rounded-xl border border-border bg-[#F8FAFC] px-4 py-3 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                <div className="flex-1 min-w-0">
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything about your compliance..."
                    className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 resize-none outline-none min-h-[24px] max-h-32"
                    rows={1}
                    disabled={!hasActiveConv || sending}
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Attach document"
                    disabled={!hasActiveConv}
                  >
                    <FileText className="size-4" />
                  </button>
                  <button
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Mention document"
                    disabled={!hasActiveConv}
                  >
                    <Quote className="size-4" />
                  </button>
                  <Button
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleSend}
                    disabled={!messageText.trim() || !hasActiveConv || sending}
                  >
                    {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/50 text-center mt-2">
                Shift+Enter for new line · Enter to send
              </p>
            </div>
          </div>
        </div>

        <ContextPanel
          open={rightPanelOpen}
          onToggle={() => setRightPanelOpen(!rightPanelOpen)}
        />
      </div>
    </AppLayout>
  );
}
