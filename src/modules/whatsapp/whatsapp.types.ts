export interface MetaMessagePayload {
  messaging_product: string;
  to: string;
  type: 'text' | 'document' | 'image' | 'audio';
  text?: { body: string; preview_url?: boolean };
  document?: { link?: string; id?: string; filename?: string };
  image?: { link?: string; id?: string };
}

export interface IncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string };
  document?: { id: string; filename: string; mime_type: string };
}