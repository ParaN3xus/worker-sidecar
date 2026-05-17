
#let base-url = "https://typst-worker.paran3x.us"

#let url-encode(value) = {
  value
    .replace("%", "%25")
    .replace("\n", "%0A")
    .replace("\r", "%0D")
    .replace(" ", "%20")
    .replace("!", "%21")
    .replace("\"", "%22")
    .replace("#", "%23")
    .replace("$", "%24")
    .replace("&", "%26")
    .replace("'", "%27")
    .replace("(", "%28")
    .replace(")", "%29")
    .replace("+", "%2B")
    .replace(",", "%2C")
    .replace("/", "%2F")
    .replace(":", "%3A")
    .replace(";", "%3B")
    .replace("<", "%3C")
    .replace("=", "%3D")
    .replace(">", "%3E")
    .replace("?", "%3F")
    .replace("@", "%40")
    .replace("[", "%5B")
    .replace("\\", "%5C")
    .replace("]", "%5D")
    .replace("{", "%7B")
    .replace("|", "%7C")
    .replace("}", "%7D")
}



#let raw-bkg = black.transparentize(95%)
#show raw.where(block: true): block.with(fill: raw-bkg, inset: 1em, width: 100%)
#show raw.where(block: false): box.with(fill: raw-bkg, outset: (y: 0.25em), inset: (x: 0.25em))

#show link: set text(blue)
#show link: underline

#set document(title: [Typst Worker Demo], author: "paran3xus")

#title()

This Worker renders Typst source code to `svg`, `pdf`, or `png`. Send a `GET` request when the snippet can fit comfortably in a URL, or send a `POST` request with JSON for larger input.

When `GET /` is called without a valid render query, the Worker renders this document as a PDF.

#outline()

= Endpoints

- `GET /`
- `GET /svg`
- `GET /pdf`
- `GET /png`
- `POST /`
- `POST /svg`
- `POST /pdf`
- `POST /png`

= API contract

== GET query parameters

```http
GET https://typst-worker.paran3x.us/?code=...&format=svg|pdf|png&mode=markup|math|code
```
```http
GET https://typst-worker.paran3x.us/svg|pdf|png?code=...&mode=markup|math|code
```

`code` is required. `format` is required on `/`, but omitted on `/svg`, `/pdf`,
and `/png` because the path selects the output format. `mode` defaults to
`markup`.

== GET response

Successful `GET` requests return the rendered artifact directly.

```http
200 OK
content-type: image/svg+xml | application/pdf | image/png
```

For `pdf` and `png`, the response body is binary data. For `svg`, the response body is SVG text. Failed `GET` requests return plain text diagnostics.

== POST body schema

```ts
{
  format?: "svg" | "pdf" | "png",
  mode: "markup" | "math" | "code",
  code: string,
}
```

`mode` and `code` are required. `format` is required on `/`, but the `/svg`, `/pdf`, and `/png` paths override it with the path format.

== POST response

`POST` requests always return JSON.

```ts
{
  warnings: { message?: string, severity?: string }[],
  errors: { message?: string, severity?: string }[],
  body: string | null,
  content_type: "image/svg+xml" | "application/pdf" | "image/png" | null,
}
```

For `svg`, `body` is SVG text. For `pdf` and `png`, `body` is base64-encoded binary data. If rendering fails, `errors` contains diagnostics and `body` is `null`.

`markup` sends the string directly to Typst. `math` wraps the string in a math block. `code` wraps the string in a Typst code expression.


= Examples

#let render-url(code, path: "/", format: none, mode: "markup") = {
  let format-query = if format == none { "" } else { "&format=" + format }
  let mode-query = if mode == "markup" { "" } else { "&mode=" + mode }
  base-url + path + "?code=" + url-encode(code) + format-query + mode-query
}

#let json-escape(value) = {
  value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r")
}

#let post-json(code, format: none, mode: "markup") = {
  let format-line = if format == none { "" } else { "  \"format\": \"" + format + "\",\n" }
  let open = "{\n" + format-line
  let mode-line = "  \"mode\": \"" + mode + "\",\n"
  let code-line = "  \"code\": \"" + json-escape(code) + "\"\n"
  open + mode-line + code-line + "}"
}

#let post-curl(code, path: "/", format: none, mode: "markup") = {
  let line-continue = " " + "\\" + "\n"
  let command = "curl -X POST '" + base-url + path + "'" + line-continue
  let header = "  -H 'content-type: application/json'" + line-continue
  let data = "  --data '\n" + post-json(code, format: format, mode: mode) + "'"
  raw(block: true, lang: "bash", command + header + data)
}


== GET examples

#let open-example(url) = link(url)[Open the example]

#let get-markup-url = render-url("= Hello from Typst in Cloudflare Workers", format: "svg")
#let get-math-url = render-url("integral_0^1 x^2 dif x = 1/3", path: "/pdf", mode: "math")
#let get-code-url = render-url(
  "set page(width: auto, height: auto); set text(20pt); sys.version",
  path: "/png",
  mode: "code",
)

- SVG Hello World: #open-example(get-markup-url)
  #raw(get-markup-url, block: true)
- PDF with math: #open-example(get-math-url)
  #raw(get-math-url, block: true)
- Show typst version: #open-example(get-code-url)
  #raw(get-code-url, block: true)

== POST examples

- Render SVG
  #post-curl("= Hello from Typst in Cloudflare Workers", path: "/svg")
- Render PDF
  #post-curl("integral_0^1 x^2 dif x = 1/3", path: "/pdf", mode: "math")
- Render PNG
  #post-curl("set page(width: auto, height: auto); set text(20pt); sys.version", path: "/png", mode: "code")
- Choose the format in JSON
  #post-curl("= API response\nRendered as PDF.", format: "pdf")
