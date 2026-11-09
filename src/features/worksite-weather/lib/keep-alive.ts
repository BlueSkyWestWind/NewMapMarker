import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Cloudflare Workers 컨텍스트가 있을 때만 응답이 끝난 뒤에도 작업이 끝나도록 살려 둔다.
 * 로컬(Node)·테스트처럼 컨텍스트가 없는 곳에서는 아무 일도 하지 않는다.
 */
export function keepAlive(task: Promise<unknown>): void {
  try {
    getCloudflareContext().ctx.waitUntil(task);
  } catch {
    // Workers 밖에서는 컨텍스트가 없다. 정상이다.
  }
}
