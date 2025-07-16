# 繽放客戶端 Cloudflare QRCode 快速登入教學

本教學將指引你如何修改繽放客戶端，並結合 Cloudflare Workers，實現手機無需掃描 QRCode 也能快速登入繽放。

---

## 目錄
1. [前置準備](#前置準備)
2. [下載與修改繽放客戶端](#下載與修改繽放客戶端)
3. [Cloudflare Workers 部署](#cloudflare-workers-部署)
4. [Cloudflare KV 儲存空間設定](#cloudflare-kv-儲存空間設定)
5. [Worker 程式碼說明](#worker-程式碼說明)
6. [部署與使用方式](#部署與使用方式)
7. [注意事項](#注意事項)

---

## 前置準備

你需要準備：
- 一個 [Cloudflare](https://cloudflare.com/) 帳號
- 安裝 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
- 安裝 [Node.js](https://nodejs.org/)（建議 18 版以上）
- [Visual Studio](https://visualstudio.microsoft.com/) 及 C# 開發環境

---

## 下載與修改繽放客戶端

1. 前往 [https://github.com/pungin/Beanfun](https://github.com/pungin/Beanfun) 下載原始碼。
2. 使用 Visual Studio 開啟專案，編輯 `MainWindow.xaml.cs`。
3. 修改 `qrWorker_RunWorkerCompleted` 方法，並新增 `PostQRCodeUrl` 方法。

### 範例程式碼：
```csharp
private void qrWorker_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
{
    btn_Region.IsEnabled = true;
    if (updateQRCodeImage())
    {
        qrCheckLogin.IsEnabled = true;
        try
        {
            // 取得 QRCode 圖片
            var bitmapImage = this.bfClient.getQRCodeImage(qrcodeClass);
            if (bitmapImage != null)
            {
                // 轉成 System.Drawing.Bitmap
                System.Drawing.Bitmap bitmap;
                using (MemoryStream ms = new MemoryStream())
                {
                    BitmapEncoder encoder = new BmpBitmapEncoder();
                    encoder.Frames.Add(BitmapFrame.Create(bitmapImage));
                    encoder.Save(ms);
                    bitmap = new System.Drawing.Bitmap(ms);
                }
                // 解碼 QRCode
                var reader = new ZXing.BarcodeReader();
                var result = reader.Decode(bitmap);
                string fullUrl = result?.Text ?? "";
                // 擷取 beanfunapp:// 開頭
                if (fullUrl.Contains("url="))
                {
                    string appUrl = System.Web.HttpUtility.ParseQueryString(new Uri(fullUrl).Query).Get("url");
                    if (!string.IsNullOrEmpty(appUrl))
                    {
                        PostQRCodeUrl(appUrl);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("解碼 QRCode 或傳送失敗：" + ex.Message);
        }
    }
}

private void PostQRCodeUrl(string appUrl)
{
    try
    {
        var request = (HttpWebRequest)WebRequest.Create("https://url-scheme-worker.your-cloudflare-user.workers.dev/create");
        request.ContentType = "application/json";
        request.Method = "POST";
        string jsonData = $"{{\"url\":\"{appUrl}\"}}";
        using (var streamWriter = new StreamWriter(request.GetRequestStream()))
        {
            streamWriter.Write(jsonData);
        }
        var response = (HttpWebResponse)request.GetResponse();
        using (var streamReader = new StreamReader(response.GetResponseStream()))
        {
            string result = streamReader.ReadToEnd();
            Console.WriteLine("Worker 回應：" + result);
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine("送出 QRCode 到 Worker 失敗：" + ex.Message);
    }
}
```

---

## Cloudflare Workers 部署

1. 登入 Cloudflare 帳號：
```bash
wrangler login
```
2. 初始化專案：
```bash
npm create cloudflare@latest
```
- 選擇目錄（如：`./url-scheme-worker`）
- 選擇 `Hello World example` → `Worker only` → `JavaScript`
- 是否需要 git：選 `yes`
- 是否立即部署：選 `no`（稍後再部署）

3. 進入專案目錄：
```bash
cd url-scheme-worker
```

---

## Cloudflare KV 儲存空間設定

1. 建立 KV 命名空間：
```bash
wrangler kv namespace create "URLS"
wrangler kv namespace create "URLS_LAST"
```
2. 取得兩組 `id`，合併後貼到 `wrangler.jsonc`：
```jsonc
"kv_namespaces": [
  { "binding": "URLS", "id": "XXX" },
  { "binding": "URLS_LAST", "id": "XXX" }
]
```

---

## Worker 程式碼說明

1. 編輯 `src/index.js`，貼上以下內容：
```javascript
export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const id = "cao";
    const ttlSeconds = 60;
    // ... 省略 ...
    // 請參考原始檔案完整程式碼
  }
}
```
> 詳細完整程式碼請參考本專案 `cf/index.js`。

---

## 部署與使用方式

1. 部署 Worker：
```bash
wrangler deploy
```
2. 取得部署網址，例如：
```
https://url-scheme-worker.your-cloudflare-user.workers.dev
```
3. 發送 URL Scheme 測試：
```bash
curl -X POST https://url-scheme-worker.your-cloudflare-user.workers.dev/create \
  -H "Content-Type: application/json" \
  -d '{"url":"instagram://user?username=openai"}'
```
- 會回應類似：
```
{"url":"https://url-scheme-worker.your-cloudflare-user.workers.dev/launch/cao"}
```
4. 手機可將此網址設為書籤，或用 iOS 捷徑放在桌面，達成免掃 QRCode 快速登入。

---

## 注意事項
- Cloudflare Worker 免費方案有流量與效能限制，請依需求調整。
- TTL（有效時間）預設 60 秒，可依需求調整。
- 若遇到跳轉失敗，可嘗試再次點擊備份網址。
- 請勿公開分享你的 Worker 網址，以免被濫用。

---

如有問題，歡迎至 [原專案](https://github.com/pungin/Beanfun) 討論區發問或回報。 
