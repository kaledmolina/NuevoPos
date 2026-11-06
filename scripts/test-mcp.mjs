import { spawn } from "child_process"

const proc = spawn("node", ["scripts/mcp-server.mjs"], {
  stdio: ["pipe", "pipe", "inherit"],
})

let output = ""
proc.stdout.on("data", (data) => {
  output += data.toString()
})

const send = (msg) => {
  proc.stdin.write(JSON.stringify(msg) + "\n")
}

// 1. Initialize
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })

// 2. List tools
send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })

// 3. Call pos_get_business_summary
send({
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: { name: "pos_get_business_summary", arguments: {} },
})

// 4. Call pos_set_client_credit
send({
  jsonrpc: "2.0",
  id: 4,
  method: "tools/call",
  params: {
    name: "pos_set_client_credit",
    arguments: { query: "André Manuel Molina", creditLimit: 750000, active: true },
  },
})

// 5. Call pos_get_client_profit_summary
send({
  jsonrpc: "2.0",
  id: 5,
  method: "tools/call",
  params: {
    name: "pos_get_client_profit_summary",
    arguments: { query: "André Manuel Molina" },
  },
})

setTimeout(() => {
  console.log("=== OUTPUT RECEIVED ===")
  const lines = output.trim().split("\n")
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line)
      console.log(`[ID ${parsed.id}] ${parsed.result?.serverInfo?.name || (parsed.result?.tools ? `Tools: ${parsed.result.tools.length}` : (parsed.result?.content ? parsed.result.content[0].text.slice(0, 100) + "..." : JSON.stringify(parsed)))}`)
    } catch {
      console.log("Raw line:", line)
    }
  }
  proc.kill()
  process.exit(0)
}, 2500)
