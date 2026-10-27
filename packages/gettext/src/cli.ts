#!/usr/bin/env node

import * as fs from "node:fs/promises"
import * as path from "node:path"
import * as process from "node:process"
import { cli, command } from "cleye"
import { defaultSources, extractFromGlobs } from "./extract.js"
import {
  createPot,
  diffPo,
  formatKey,
  initPo,
  isUpToDate,
  mergePo,
} from "./po.js"

type SourceOptions = {
  src: string[]
  ignore: string[]
  keyword: string[]
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

async function exists(file: string) {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

async function catalog({ src, ignore, keyword }: SourceOptions) {
  const result = await extractFromGlobs(src.length > 0 ? src : defaultSources, {
    ignore,
    ...(keyword.length > 0 && { keywords: keyword }),
  })

  for (const warning of result.warnings) {
    console.warn(`warning: ${warning}`)
  }

  return result.catalog
}

async function poFiles(files: string[], dir: string) {
  if (files.length > 0) return files

  const entries = await fs.readdir(dir).catch(() => [])
  const found = entries
    .filter((file) => file.endsWith(".po"))
    .sort()
    .map((file) => path.join(dir, file))

  if (found.length === 0) {
    fail(`no .po files found in "${dir}", create one with "init <locale>"`)
  }

  return found
}

async function extract(options: SourceOptions & { output: string }) {
  const pot = createPot(await catalog(options))
  if (options.output) {
    await fs.writeFile(options.output, pot)
  } else {
    process.stdout.write(pot)
  }
}

async function init(
  locales: string[],
  options: SourceOptions & {
    poDir: string
    pluralForms: string
    force: boolean
  },
) {
  if (locales.length === 0) fail("missing locale argument")

  const messages = await catalog(options)
  await fs.mkdir(options.poDir, { recursive: true })

  for (const locale of locales) {
    const file = path.join(options.poDir, `${locale}.po`)
    if (!options.force && (await exists(file))) {
      fail(`${file} already exists, use "merge" to update it`)
    }

    const content = initPo(messages, locale, {
      ...(options.pluralForms && { pluralForms: options.pluralForms }),
    })

    await fs.writeFile(file, content)
    console.log(`created ${file}`)
  }
}

async function merge(
  files: string[],
  options: SourceOptions & { poDir: string; keepObsolete: boolean },
) {
  const messages = await catalog(options)

  for (const file of await poFiles(files, options.poDir)) {
    const content = await fs.readFile(file, "utf-8")
    const merged = mergePo(content, messages, {
      keepObsolete: options.keepObsolete,
    })

    if (merged === content) {
      console.log(`${file}: up to date`)
    } else {
      const { missing, obsolete } = diffPo(content, messages)
      await fs.writeFile(file, merged)
      console.log(`${file}: updated (+${missing.length} -${obsolete.length})`)
    }
  }
}

async function check(
  files: string[],
  options: SourceOptions & { poDir: string; untranslated: boolean },
) {
  const messages = await catalog(options)
  let ok = true
  let outdated = false

  for (const file of await poFiles(files, options.poDir)) {
    const diff = diffPo(await fs.readFile(file, "utf-8"), messages)
    const problems = [
      ...diff.missing.map((key) => `missing ${formatKey(key)}`),
      ...diff.obsolete.map((key) => `obsolete ${formatKey(key)}`),
      ...diff.pluralMismatch.map((key) => `plural mismatch ${formatKey(key)}`),
      ...(options.untranslated
        ? diff.untranslated.map((key) => `untranslated ${formatKey(key)}`)
        : []),
    ]

    if (problems.length === 0) {
      console.log(`${file}: ok`)
    } else {
      ok = false
      outdated ||= !isUpToDate(diff)
      console.error(`${file}:`)
      for (const problem of problems) {
        console.error(`  ${problem}`)
      }
    }
  }

  if (outdated) {
    console.error(`\nrun "anthil-gettext merge" to update the .po files`)
  }

  if (!ok) process.exit(1)
}

const sourceFlags = {
  src: {
    type: [String],
    alias: "s",
    placeholder: "<glob>",
    description: "Source files (default: src/**/*.{js,jsx,ts,tsx,...})",
  },
  ignore: {
    type: [String],
    alias: "i",
    placeholder: "<glob>",
    description: "Files or directories to skip",
  },
  keyword: {
    type: [String],
    alias: "k",
    placeholder: "<spec>",
    description: "Keyword spec such as t, n:1,2 or p:1c,2",
  },
} as const

const poDir = {
  type: String,
  alias: "d",
  default: "po",
  placeholder: "<dir>",
  description: "Directory of .po files",
} as const

cli(
  {
    name: "anthil-gettext",
    strictFlags: true,
    commands: [
      command(
        {
          name: "init",
          parameters: ["<locales...>"],
          flags: {
            ...sourceFlags,
            poDir,
            pluralForms: {
              type: String,
              default: "",
              placeholder: "<header>",
              description: "Plural-Forms header for unknown locales",
            },
            force: {
              type: Boolean,
              alias: "f",
              default: false,
              description: "Overwrite existing files",
            },
          },
          help: {
            description: "Create <po-dir>/<locale>.po from the source files",
          },
        },
        ({ _, flags }) => init(_.locales, flags),
      ),
      command(
        {
          name: "merge",
          parameters: ["[files...]"],
          flags: {
            ...sourceFlags,
            poDir,
            keepObsolete: {
              type: Boolean,
              default: false,
              description: "Keep removed messages as obsolete entries",
            },
          },
          help: { description: "Update .po files to match the source files" },
        },
        ({ _, flags }) => merge(_.files, flags),
      ),
      command(
        {
          name: "check",
          parameters: ["[files...]"],
          flags: {
            ...sourceFlags,
            poDir,
            untranslated: {
              type: Boolean,
              default: false,
              description: "Also fail on untranslated messages",
            },
          },
          help: { description: "Exit with 1 if a .po file is not up to date" },
        },
        ({ _, flags }) => check(_.files, flags),
      ),
      command(
        {
          name: "extract",
          flags: {
            ...sourceFlags,
            output: {
              type: String,
              alias: "o",
              default: "",
              placeholder: "<file>",
              description: "Output file (default: stdout)",
            },
          },
          help: { description: "Write a .pot template of the source files" },
        },
        ({ flags }) => extract(flags),
      ),
    ],
  },
  // no command or an unknown one
  ({ _, showHelp }) => {
    showHelp()
    fail(_.length > 0 ? `\nunknown command "${_[0]}"` : "")
  },
)
