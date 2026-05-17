#let base-url = "https://typst-worker.paran3x.us"

#let raw-bkg = black.transparentize(95%)
#show raw.where(block: true): block.with(fill: raw-bkg, inset: 0.8em, width: 100%)
#show raw.where(block: false): box.with(fill: raw-bkg, outset: (y: 0.2em), inset: (x: 0.2em))
#show link: set text(blue)
#show link: underline

#set document(title: [Typst Worker Demo], author: "paran3xus")
#set page(margin: 1.4cm, height: auto)

= Typst Worker Demo

This Worker renders small Typst snippets to `svg`, `pdf`, or `png`. Use `GET` for short snippets and `POST` with JSON for larger input. Invalid `GET /` requests return this document as a PDF.

== Endpoints

- `GET /`, `GET /svg`, `GET /pdf`, `GET /png`
- `POST /`, `POST /svg`, `POST /pdf`, `POST /png`

== API contract

=== GET query parameters

```
GET https://typst-worker.paran3x.us/?code=...&format=svg|pdf|png&mode=markup|math|code
GET https://typst-worker.paran3x.us/svg|pdf|png?code=...&mode=markup|math|code
```

`code` is required. `format` is required only on `/`. `mode` defaults to `markup`.

=== GET response

```
200 OK
content-type: image/svg+xml | application/pdf | image/png
```

GET returns the rendered artifact directly. Failed GET requests return plain text diagnostics.

=== POST body schema

```
{
  format?: "svg" | "pdf" | "png",
  mode: "markup" | "math" | "code",
  code: string,
}
```

`format` is required only on `/`; `/svg`, `/pdf`, and `/png` select it from the
path.

=== POST response

```
{
  warnings: { message?: string, severity?: string }[],
  errors: { message?: string, severity?: string }[],
  body: string | null,
  content_type: "image/svg+xml" | "application/pdf" | "image/png" | null,
}
```

For `pdf` and `png`, `body` is base64-encoded binary data. For `svg`, it is SVG text.

== Examples

#let hello = "= Hello from Typst in Cloudflare Workers"
#let math = "x^2 + y^2 = z^2"
#let version = "set page(width: auto, height: auto); text(24pt, repr(sys.version))"

=== GET

#let url-encode(value) = {
  value
    .replace("%", "%25")
    .replace("\n", "%0A")
    .replace(" ", "%20")
    .replace("#", "%23")
    .replace("&", "%26")
    .replace("+", "%2B")
    .replace("=", "%3D")
    .replace("?", "%3F")
}

#let render-url(code, path: "/", format: none, mode: "markup") = {
  let format-query = if format == none { "" } else { "&format=" + format }
  let mode-query = if mode == "markup" { "" } else { "&mode=" + mode }
  base-url + path + "?code=" + url-encode(code) + format-query + mode-query
}

#let open-example(url) = link(url)[Open the example]


#let svg-url = render-url(hello, format: "svg")
#let pdf-url = render-url(math, path: "/pdf", mode: "math")
#let png-url = render-url(version, path: "/png", mode: "code")

- SVG: #open-example(svg-url)
  #raw(svg-url, block: true)
- PDF: #open-example(pdf-url)
  #raw(pdf-url, block: true)
- PNG: #open-example(png-url)
  #raw(png-url, block: true)

=== POST


#let json-escape(value) = {
  value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
}

#let post-json(code, format: none, mode: "markup") = {
  let format-line = if format == none { "" } else { "  \"format\": \"" + format + "\",\n" }
  "{\n" + format-line + "  \"mode\": \"" + mode + "\",\n" + "  \"code\": \"" + json-escape(code) + "\"\n}"
}

#let post-curl(code, path: "/", format: none, mode: "markup") = {
  let slash = " " + "\\" + "\n"
  raw(
    block: true,
    "curl -X POST '"
      + base-url
      + path
      + "'"
      + slash
      + "  -H 'content-type: application/json'"
      + slash
      + "  --data '\n"
      + post-json(code, format: format, mode: mode)
      + "'",
  )
}

- SVG
  #post-curl(hello, path: "/svg")
- Format in JSON
  #post-curl("= API response", format: "pdf")
