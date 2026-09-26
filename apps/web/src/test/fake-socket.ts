// A WebSocket whose server side the test plays. Pass `sockets.create` as `createSocket`.
export class FakeSocket extends EventTarget {
  sent: unknown[] = [];
  closedWith: number | null = null;
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close(code?: number) {
    this.closedWith = code ?? null;
  }
  opened() {
    this.dispatchEvent(new Event("open"));
  }
  receive(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
  dropped(code = 1006) {
    this.dispatchEvent(new CloseEvent("close", { code }));
  }
}

// Every socket made so far, newest last.
export function fakeSockets() {
  const all: FakeSocket[] = [];
  return {
    all,
    create: (): WebSocket => {
      const socket = new FakeSocket();
      all.push(socket);
      return socket as unknown as WebSocket;
    },
    latest: (): FakeSocket => {
      const socket = all.at(-1);
      if (!socket) {
        throw new Error("No socket yet");
      }
      return socket;
    },
  };
}
