export interface MetaMessagePayload {
  messaging_product: string;
  to: string;
  type: 'text' | 'document' | 'image' | 'audio' | 'video';
  text?: { body: string; preview_url?: boolean };
 document?: { 
    link?: string; 
    id?: string; 
    filename?: string;
    caption?: string; 
  };
 image?: { 
    link?: string; 
    id?: string; 
    caption?: string;
  };
  // 👇 AQUI ESTAVA FALTANDO O ÁUDIO
  audio?: { 
    link?: string; 
    id?: string; 
  };
  // Se for usar vídeo no futuro:
  video?: {
    link?: string;
    id?: string;
    caption?: string;
  };
}

export interface IncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'audio' | 'voice' | 'ptt' | 'video';

  text?: { body: string };

  image?: { id: string; mime_type: string };

  document?: { id: string; filename: string; mime_type: string };

  audio?: { id: string; mime_type: string };

  video?: { id: string; mime_type: string };
}