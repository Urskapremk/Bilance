import { spawn } from "node:child_process"
import process from "node:process"

const port = 43123
let next = null
let stopping = false

function startNext() {
  if (stopping) return
  // One dual-stack socket. Node accepts 127.0.0.1 and ::1 on "::"
  // when ipv6Only is off, so the preview hits Next with no proxy in between.
  next = spawn(
    "npx",
    ["next", "dev", "--hostname", "::", "--port", String(port)],
    { stdio: "inherit", env: { ...process.env, PORT: String(port) } },
  )
  next.on("exit", (code) => {
    if (stopping) return
    console.error(`next exited (${code ?? "signal"}), restarting`)
    setTimeout(startNext, 400)
  })
}

startNext()

function stop() {
  stopping = true
  next?.kill("SIGTERM")
  process.exit(0)
}

process.on("SIGINT", stop)
process.on("SIGTERM", stop)
