import { useQuery, useMutation } from "@tanstack/react-query";
import { listDocuments } from "./api";

const BASE = "/api";

function authHeaders() {
  const t = sessionStorage.getItem("regulens_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
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
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.documentId != null) params.set("document_id", String(filters.documentId));
      const qs = params.toString();
      const res = await fetch(`${BASE}/groq/conversations${qs ? `?${qs}` : ""}`, {
        headers: { ...authHeaders() },
      });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
    ...(options?.query || {}),
  });
}

export function useCreateGroqConversation() {
  return useMutation({
    mutationFn: async ({ data }) => {
      const res = await fetch(`${BASE}/groq/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ title: data.title, document_id: data.documentId ?? null }),
      });
      if (!res.ok) throw new Error("Failed to create conversation");
      return res.json();
    },
  });
}

export function useDeleteGroqConversation() {
  return useMutation({
    mutationFn: async ({ id }) => {
      const res = await fetch(`${BASE}/groq/conversations/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      if (!res.ok) throw new Error("Failed to delete conversation");
    },
  });
}

export function useListGroqMessages(conversationId, options) {
  return useQuery({
    queryKey: options?.query?.queryKey ?? getListGroqMessagesQueryKey(conversationId),
    queryFn: async () => {
      const res = await fetch(`${BASE}/groq/conversations/${conversationId}/messages`, {
        headers: { ...authHeaders() },
      });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    ...(options?.query || {}),
  });
}
