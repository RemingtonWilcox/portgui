import http from "node:http";

const port = 60500;
const title = "PortGUI Test 4";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, sans-serif;
        background: linear-gradient(135deg, #431407, #7c2d12 55%, #1c1917);
        color: #fff4ec;
        min-height: 100vh;
        display: grid;
        place-items: center;
      }
      .card {
        width: min(680px, calc(100vw - 48px));
        border: 1px solid rgba(253, 186, 116, 0.28);
        background: rgba(41, 17, 9, 0.82);
        border-radius: 24px;
        padding: 32px;
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.35);
      }
      h1 { margin: 0 0 8px; font-size: 36px; }
      p { margin: 0; color: #ffd7bf; font-size: 18px; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Demo</h1>
      <p>${title}</p>
      <p>localhost:${port}</p>
    </main>
  </body>
</html>`;

http
  .createServer((_, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`${title} listening on http://127.0.0.1:${port}`);
  });
