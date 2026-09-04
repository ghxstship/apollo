import "server-only";

/* JSON-RPC 2.0, the wire the Model Context Protocol speaks. Only what the
   endpoint needs: the request shape, the two response shapes, and the error
   codes the spec reserves. No library — the protocol is small and the club
   adds no dependency for a thing this size. */

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcError = { code: number; message: string; data?: unknown };

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: JsonRpcError };

/* The reserved codes. -32000 to -32099 are the server's own; the endpoint
   uses one, for a key that may not do what it asked. */
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;
export const FORBIDDEN = -32001;

export function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function fail(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

/* A message is a request when it carries an id, a notification when it does
   not. A notification gets no reply — the spec says so, and a reply to one
   would be a message the client never asked for. */
export function isRequest(m: unknown): m is JsonRpcRequest {
  return (
    !!m &&
    typeof m === "object" &&
    !Array.isArray(m) &&
    (m as { jsonrpc?: unknown }).jsonrpc === "2.0" &&
    typeof (m as { method?: unknown }).method === "string"
  );
}

export function hasId(m: JsonRpcRequest): boolean {
  return m.id !== undefined && m.id !== null;
}

export function params(m: JsonRpcRequest): Record<string, unknown> {
  const p = m.params;
  return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
}
