import { useQuery, useMutation } from "@tanstack/react-query";
import { listDocuments } from "./api";

const CONVERSATIONS_KEY = "groq_conversations";
const MESSAGES_KEY = "groq_messages";

function getConversations() {
  try {
    return JSON.parse(localStorage.getItem(CONVERSATIONS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveConversations(convs) {
  localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs));
}

function getMessagesMap() {
  try {
    return JSON.parse(localStorage.getItem(MESSAGES_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveMessagesMap(msgs) {
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(msgs));
}

export function getListGroqConversationsQueryKey(filters) {
  return ["groq-conversations", filters];
}

export function getListGroqMessagesQueryKey(conversationId) {
  return ["groq-messages", conversationId];
}

export function useListDocuments() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: listDocuments,
  });
}

export function useListGroqConversations(filters, options) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListGroqConversationsQueryKey(filters),
    queryFn: () => {
      const convs = getConversations();
      if (filters?.documentId != null) {
        return convs.filter((c) => c.documentId === filters.documentId);
      }
      return convs;
    },
    ...(options?.query || {}),
  });
}

export function useCreateGroqConversation() {
  return useMutation({
    mutationFn: async ({ data }) => {
      const convs = getConversations();
      const newConv = {
        id: Date.now(),
        title: data.title,
        documentId: data.documentId ?? null,
        createdAt: new Date().toISOString(),
      };
      convs.unshift(newConv);
      saveConversations(convs);
      return newConv;
    },
  });
}

export function useDeleteGroqConversation() {
  return useMutation({
    mutationFn: async ({ id }) => {
      const convs = getConversations().filter((c) => c.id !== id);
      saveConversations(convs);
      const msgs = getMessagesMap();
      delete msgs[id];
      saveMessagesMap(msgs);
    },
  });
}

export function useListGroqMessages(conversationId, options) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListGroqMessagesQueryKey(conversationId),
    queryFn: () => {
      const msgs = getMessagesMap();
      return msgs[conversationId] || [];
    },
    ...(options?.query || {}),
  });
}
