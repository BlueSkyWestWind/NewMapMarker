/**
 * `cloudflare:sockets` 최소 타입 선언.
 *
 * `@cloudflare/workers-types`를 통째로 넣으면 기존 DOM 타입과 충돌하므로,
 * 실제로 쓰는 `connect`만 선언한다.
 * 참고: https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
 */
declare module "cloudflare:sockets" {
  export interface SocketAddress {
    hostname: string;
    port: number;
  }

  export interface SocketOptions {
    /** "on"이면 TLS로 연결한다 */
    secureTransport?: "off" | "on" | "starttls";
    allowHalfOpen?: boolean;
  }

  export interface Socket {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
    readonly closed: Promise<void>;
    close(): Promise<void>;
    startTls(): Socket;
  }

  export function connect(
    address: SocketAddress | string,
    options?: SocketOptions,
  ): Socket;
}
