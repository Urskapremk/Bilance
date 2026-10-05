import { spawn } from "node:child_process"
import net from "node:net"
import process from "node:process"

const port = 43123
let next = null
let stopping = false

function startNext() {
  if (stopping) return
  // Explicit IPv4 bind. The preview dials 127.0.0.1; an IPv6-only socket
  // answers inside this VM but the port forwarder outside resets the browser.
  next = spawn(
    "npx",
    ["next", "dev", "--hostname", "0.0.0.0", "--port", String(port)],
    { stdio: "inherit", env: { ...process.env, PORT: String(port) } },
  )
  next.on("exit", (code) => {
    if (stopping) return
    console.error(`next exited (${code ?? "signal"}), restarting`)
    setTimeout(startNext, 400)
  })
}

// IPv6-only companion so localhost (::1) reaches the same server.
const ipv6 = net.createServer((socket) => {
  const upstream = net.connect(port, "127.0.0.1")
  const fail = () => {
    upstream.destroy()
    if (!socket.writableEnded) {
      socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
    }
  }
  upstream.once("error", fail)
  upstream.once("connect", () => {
    upstream.removeListener("error", fail)
    socket.pipe(upstream)
    upstream.pipe(socket)
    socket.on("error", () => upstream.destroy())
    upstream.on("error", () => socket.destroy())
  })
  socket.on("error", () => upstream.destroy())
})

ipv6.on("error", (error) => {
  console.error("IPv6 preview listener failed:", error.message)
})

ipv6.listen({ port, host: "::", ipv6Only: true }, () => {
  console.log(`Preview http://127.0.0.1:${port}`)
  console.log(`Preview http://localhost:${port}`)
})

startNext()

function stop() {
  stopping = true
  ipv6.close()
  next?.kill("SIGTERM")
  process.exit(0)
}

process.on("SIGINT", stop)
process.on("SIGTERM", stop)
