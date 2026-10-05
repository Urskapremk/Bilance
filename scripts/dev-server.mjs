import { spawn } from "node:child_process"
import net from "node:net"
import process from "node:process"

const port = 43123
const next = spawn(
  "npx",
  ["next", "dev", "--hostname", "0.0.0.0", "--port", String(port)],
  { stdio: "inherit" },
)

const ipv6 = net.createServer((socket) => {
  const upstream = net.connect(port, "127.0.0.1")
  const close = () => {
    socket.destroy()
    upstream.destroy()
  }
  socket.on("error", close)
  upstream.on("error", close)
  socket.pipe(upstream)
  upstream.pipe(socket)
})

ipv6.on("error", (error) => {
  console.error("IPv6 preview listener failed:", error.message)
})

ipv6.listen({ port, host: "::", ipv6Only: true }, () => {
  console.log(`Preview http://127.0.0.1:${port}`)
  console.log(`Preview http://localhost:${port}`)
})

function stop() {
  ipv6.close()
  next.kill("SIGTERM")
}

process.on("SIGINT", stop)
process.on("SIGTERM", stop)
next.on("exit", (code) => {
  ipv6.close()
  process.exit(code ?? 0)
})
