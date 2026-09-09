#!/usr/bin/env node

import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as process from "node:process"
import po2json from "./po2json.js"

const [, , input, output] = process.argv

if (input) {
  const content = await fs.readFile(path.resolve(input), "utf-8")
  const result = JSON.stringify(po2json(content))

  if (output) {
    fs.writeFile(path.resolve(output), result)
  } else {
    process.stdout.write(result)
  }
} else {
  console.error("missing input argument")
  process.exit(1)
}
