import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useRoomSlug } from "@/hooks/useRoomSlug";
import { useWebSocket } from "@/hooks/useWebSocket";

export function App() {
  const existingSlug = useRoomSlug();
  const [slugInput, setSlugInput] = useState<string>(existingSlug ?? "");
  const userId = `user-${Math.random().toString(36).substr(2, 9)}`;

  const activeRoom = existingSlug ?? "";
  const { startCall, toggleMute, isConnecting, isConnected, isMuted, isServerStarting, hasStartedCall, localAudioRef, remoteAudioRef } = useWebSocket(activeRoom, userId);

  const handleGo = () => {
    if (!slugInput) return;
    window.location.assign(`/` + encodeURIComponent(slugInput));
  };

  return (
    <div className="container mx-auto p-6 md:p-10 w-full">
      {!existingSlug ? (
        <Card className="max-w-md mx-auto w-full backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <CardHeader className="gap-3">
            <CardTitle className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <span className="text-2xl">🦆</span> Quack
            </CardTitle>
            <CardDescription className="leading-relaxed">Crie/entre em uma sala de áudio digitando um nome</CardDescription>
            <div className="flex gap-2 pt-1">
              <Input className="flex-1 w-full" placeholder="minhaSalaDeAudio" value={slugInput} onChange={(e) => setSlugInput(e.target.value)} />
              <Button onClick={handleGo}>Entrar</Button>
            </div>
          </CardHeader>
        </Card>
      ) : (
        <Card className="max-w-2xl mx-auto backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <CardHeader className="gap-4">
            <div className="flex items-baseline justify-between">
              <CardTitle className="text-2xl font-bold flex items-center gap-2">
                <span className="text-xl">🦆</span> Sala: {existingSlug}
              </CardTitle>
              <CardDescription className="truncate">Você: {userId}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={startCall} disabled={isConnecting || isConnected || isServerStarting || hasStartedCall}>
                {isServerStarting ? 'Aguardando servidor...' : isConnecting ? 'Conectando…' : isConnected ? '✅ Conectado' : hasStartedCall ? '🔄 Iniciando...' : 'Iniciar áudio'}
              </Button>
              <Button variant="secondary" onClick={() => toggleMute(!isMuted)} disabled={!isConnected}>
                {isMuted ? 'Unmute' : 'Mute'}
              </Button>
              <Button variant="secondary" onClick={() => window.location.assign(`/`)}>Sair</Button>
              <span className="text-sm text-muted-foreground">
                {isServerStarting ? 'Inicializando servidor...' : isConnected ? (isMuted ? 'Áudio mutado' : '✅ Transmitindo áudio') : hasStartedCall ? '🔄 Estabelecendo conexão...' : 'Aguardando conexão'}
              </span>
            </div>
            <audio ref={localAudioRef} className="hidden" />
            <audio ref={remoteAudioRef} className="hidden" />
            <div className="grid grid-cols-1 gap-2 pt-2 text-sm text-muted-foreground">
              <span>Dica: use fones de ouvido para evitar microfonia.</span>
            </div>
          </CardHeader>
        </Card>
      )}
      <footer className="fixed bottom-3 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
        Feito por <a className="underline hover:opacity-80" href="https://github.com/lchampz" target="_blank" rel="noreferrer">lchampz</a>
      </footer>
    </div>
  );
}

export default App;
