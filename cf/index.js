export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const id = "cao";
    const ttlSeconds = 60;

    console.log("⚡ Worker triggered", request.method, pathname);

    // POST /create
    if (request.method === "POST" && pathname === "/create") {
      const body = await request.json();
      const url = body.url;

      if (!url || typeof url !== "string") {
        return new Response("Invalid URL", { status: 400 });
      }

      const timestamp = Date.now();

      // 寫入新網址
      const newValue = JSON.stringify({ url, timestamp });
      await env.URLS.put(id, newValue, { expirationTtl: ttlSeconds });

      // 檢查是否已有現存的 URL
      const existingValue = await env.URLS.get(id);
      console.log("existingValue", existingValue);
      if (existingValue) {
        try {
          let existingUrl;
          try {
            const parsed = JSON.parse(existingValue);
            existingUrl = parsed.url || existingValue;
          } catch {
            existingUrl = existingValue;
          }

          const backup = JSON.stringify({ url: existingUrl, timestamp });
          await env.URLS_LAST.put(id, backup, { expirationTtl: ttlSeconds });
          const test = await env.URLS_LAST.get(id);
          console.log("✅ URLS_LAST after put:", test);
        } catch (e) {
          console.error("備份失敗", e);
        }
      }

      return Response.json({
        url: `https://${new URL(request.url).host}/launch/${id}`
      });
    }

    // ✅ 新增 GET /link，直接回傳 JSON
    if (request.method === "GET" && pathname === "/link") {
      const value = await env.URLS.get(id);
      if (value) {
        try {
          const parsed = JSON.parse(value);
          return Response.json({ status: "ok", url: parsed.url });
        } catch (e) {
          return Response.json({ status: "error", url: "none" });
        }
      } else {
        return Response.json({ status: "error", url: "expired" });
      }
    }

    // GET /launch/cao
    const match = pathname.match(/^\/launch\/([a-zA-Z0-9]+)$/);
    if (match) {
      const value = await env.URLS.get(id);

      if (value) {
        await env.URLS.delete(id); // 一次性

        try {
          const { url } = JSON.parse(value);

          return new Response(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"><title>Redirecting...</title></head>
            <body>
              <p>正在跳轉到：<a href="${url}">${url}</a></p>
              <script>
                window.location.href = "${url}";
              </script>
            </body>
            </html>
          `, {
            headers: {
              "Content-Type": "text/html",
              "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline';"
            }
          });
        } catch (e) {
          return new Response("資料格式錯誤", { status: 500 });
        }
      } else {
        // 嘗試從 URLS_LAST 取得
        const lastValue = await env.URLS_LAST.get(id);
        let html = "<p>❌ 無法跳轉，可能是已過期或尚未建立。</p>";

        if (lastValue) {
          try {
            const { url, timestamp } = JSON.parse(lastValue);
            const now = Date.now();
            const remaining = Math.max(0, Math.floor((timestamp + ttlSeconds * 1000 - now) / 1000));
            const firstDisplay = "約 " + remaining + " 秒"

            html += `
              <p>⏳ 剩餘有效時間：<span id="countdown">${firstDisplay}</span></p>
              <button id="jump">再次跳轉上一個網址</button>
              <script>
                const btn = document.getElementById("jump");
                btn.addEventListener("click", () => {
                  window.location.href = "${url}";
                });
                let seconds = ${remaining};
                const el = document.getElementById("countdown");
                const timer = setInterval(() => {
                  if (--seconds > 0) {
                    el.textContent = "約 " + seconds + " 秒";
                  } else {
                    el.textContent = "已過期";
                    clearInterval(timer);
                    btn.disabled = true;
                  }
                }, 1000);
              </script>
            `;
          } catch (e) {
            html += "<p>⚠️ 備份資料格式錯誤，無法顯示按鈕。</p>";
          }
        }

        return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>跳轉失敗</title>
          <style>
            button {
              padding: 8px 16px;
              font-size: 16px;
              cursor: pointer;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>${html}</body>
        </html>
        `, {
          headers: {
            "Content-Type": "text/html",
            "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline';"
          }
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  }
}
