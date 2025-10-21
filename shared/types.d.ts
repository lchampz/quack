export type MessageType = 'offer' | 'answer' | 'candidate' | 'join';
export type SystemMessageType = 'user-joined' | 'user-left';
export interface IMessageSignal {
    type: MessageType;
    senderId: string;
    targetId?: string;
    payload: any;
}
export interface ISystemMessage {
    type: SystemMessageType;
    senderId: string;
}
export type IncomingMessage = IMessageSignal | ISystemMessage;
export interface RoomMeta {
    roomId: string;
    userId: string;
}
export interface WebSocketEvent {
    type: 'open' | 'message' | 'close' | 'error';
    data?: any;
    error?: Error;
}
export interface WebRTCConfig {
    iceServers: RTCIceServer[];
}
export interface MediaConfig {
    audio: {
        echoCancellation: boolean;
        noiseSuppression: boolean;
        autoGainControl: boolean;
    };
}
export interface ConnectionState {
    isConnecting: boolean;
    isConnected: boolean;
    isMuted: boolean;
    isServerStarting: boolean;
}
//# sourceMappingURL=types.d.ts.map