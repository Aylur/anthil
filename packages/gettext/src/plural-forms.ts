const one = "nplurals=1; plural=0;"
const notOne = "nplurals=2; plural=(n != 1);"
const gtOne = "nplurals=2; plural=(n > 1);"
const slavic =
  "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);"
const czech = "nplurals=3; plural=(n==1 ? 0 : n>=2 && n<=4 ? 1 : 2);"

// based on the GNU gettext plural table
const table: Record<string, string> = {
  ...Object.fromEntries(
    ["ja", "ko", "vi", "zh", "th", "id", "ms", "lo", "km", "my", "jv"].map(
      (lang) => [lang, one],
    ),
  ),
  ...Object.fromEntries(
    [
      "af",
      "az",
      "bg",
      "bn",
      "ca",
      "da",
      "de",
      "el",
      "en",
      "eo",
      "es",
      "et",
      "eu",
      "fi",
      "fo",
      "fy",
      "gl",
      "gu",
      "he",
      "hi",
      "hu",
      "hy",
      "it",
      "ka",
      "kk",
      "ky",
      "lb",
      "ml",
      "mn",
      "mr",
      "nb",
      "ne",
      "nl",
      "nn",
      "no",
      "pa",
      "pt",
      "sq",
      "sv",
      "sw",
      "ta",
      "te",
      "tr",
      "ur",
      "uz",
    ].map((lang) => [lang, notOne]),
  ),
  ...Object.fromEntries(
    ["fr", "pt_BR", "oc", "fil", "tl", "ln", "fa", "am", "ti"].map((lang) => [
      lang,
      gtOne,
    ]),
  ),
  ...Object.fromEntries(
    ["ru", "uk", "be", "sr", "hr", "bs"].map((lang) => [lang, slavic]),
  ),
  cs: czech,
  sk: czech,
  pl: "nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);",
  lt: "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && (n%100<10 || n%100>=20) ? 1 : 2);",
  lv: "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n != 0 ? 1 : 2);",
  ro: "nplurals=3; plural=(n==1 ? 0 : (n==0 || (n%100 > 0 && n%100 < 20)) ? 1 : 2);",
  ga: "nplurals=5; plural=(n==1 ? 0 : n==2 ? 1 : n>=3 && n<=6 ? 2 : n>=7 && n<=10 ? 3 : 4);",
  sl: "nplurals=4; plural=(n%100==1 ? 0 : n%100==2 ? 1 : n%100==3 || n%100==4 ? 2 : 3);",
  mk: "nplurals=2; plural=(n==1 || n%10==1 ? 0 : 1);",
  is: "nplurals=2; plural=(n%10!=1 || n%100==11);",
  cy: "nplurals=4; plural=(n==1 ? 0 : n==2 ? 1 : n != 8 && n != 11 ? 2 : 3);",
  mt: "nplurals=4; plural=(n==1 ? 0 : n==0 || (n%100>1 && n%100<11) ? 1 : n%100>10 && n%100<20 ? 2 : 3);",
  ar: "nplurals=6; plural=(n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : n%100>=11 ? 4 : 5);",
}

/**
 * Looks up the `Plural-Forms` header for a locale such as `hu`, `pt_BR` or `pt-BR`.
 */
export function pluralFormsFor(locale: string): string | null {
  const [lang = "", region] = locale.split(/[-_.@]/)
  const base = lang.toLowerCase()
  return (
    (region && table[`${base}_${region.toUpperCase()}`]) || table[base] || null
  )
}

/**
 * Reads `nplurals` from a `Plural-Forms` header, defaults to 2.
 */
export function nplurals(pluralForms: string | null): number {
  const match = /nplurals\s*=\s*(\d+)/.exec(pluralForms ?? "")
  return match ? Number(match[1]) : 2
}

if (import.meta.vitest) {
  const { describe, expect, test } = import.meta.vitest

  describe("plural forms", () => {
    test("lookup", () => {
      expect(pluralFormsFor("hu")).toBe("nplurals=2; plural=(n != 1);")
      expect(pluralFormsFor("pt_BR")).toBe("nplurals=2; plural=(n > 1);")
      expect(pluralFormsFor("pt-br")).toBe("nplurals=2; plural=(n > 1);")
      expect(pluralFormsFor("de_AT")).toBe(pluralFormsFor("de"))
      expect(pluralFormsFor("xx")).toBeNull()
      expect(nplurals(pluralFormsFor("ar"))).toBe(6)
      expect(nplurals(null)).toBe(2)
    })
  })
}
