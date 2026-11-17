// Vitest setup file (todo #318): supertest connects over IPv6 loopback ([::1]),
// not 127.0.0.1.
//
// supertest starts each app with `app.listen(0)`, which binds every interface
// (`::`), then connects to 127.0.0.1:<port>. On macOS ANY process may hold
// 127.0.0.1:<port> or 0.0.0.0:<port> at the same time (another test file, a
// Docker port forward, ...), and the more specific IPv4 socket takes the
// connection: the request reaches the wrong app and a route that can only return
// 400 returns 404. Linux refuses those double binds, which is why CI never saw it.
// Reproduced on this machine 2026-11-17; an IPv6 connection to [::1] always
// reaches the `::` listener, whatever holds the IPv4 side.
import supertest from "supertest";

type TestProto = { serverAddress: (app: unknown, path: string) => string; __ipv6Loopback?: true };
const proto = (supertest as unknown as { Test: { prototype: TestProto } }).Test.prototype;

if (!proto.__ipv6Loopback) {
  const original = proto.serverAddress;
  proto.serverAddress = function (this: unknown, app: unknown, path: string) {
    return original.call(this, app, path).replace("://127.0.0.1:", "://[::1]:");
  };
  proto.__ipv6Loopback = true;
}
