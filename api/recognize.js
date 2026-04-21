import { GoogleGenerativeAI } from "@google/generative-ai";

// 從環境變數讀取多組模型，以逗號分隔，並去除空白
const GEMINI_MODELS = (process.env.GEMINI_MODEL || "gemini-2.5-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { imageData, mimeType } = req.body;

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const imagePart = {
    inlineData: {
      data: imageData,
      mimeType: mimeType,
    },
  };

  const prompt =
    "請你辨識圖片中的文字內容並輸出，如果有格式不規整可以依照內容排版。將多餘不必要的換行刪除，接在同行並合併在同一段，但保留不同段落的分隔。若多欄排版，按順序先由左欄由上而下，再接右欄由上而下，因跨欄分隔未完成的斷句，不要換行的將句子連接完整並合併在同一段。不輸出Markdown格式和符號。必須準確判斷標點符號是否為中文全型。若單字錯誤中文詞彙錯誤可以糾正，不要有任何開場白、解釋、描述、總結或結束語。";

  let lastError = null;

  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const modelName = GEMINI_MODELS[i];

    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 1,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 8192,
        },
      });

      const result = await model.generateContentStream([prompt, imagePart]);

      // 在寫入 headers 之前，先嘗試取得第一個 chunk
      // 若模型發生 503/429 等錯誤，會在此拋出，可安全切換到下一個模型
      const iterator = result.stream[Symbol.asyncIterator]();
      const firstChunkResult = await iterator.next();

      // 成功取得第一個 chunk，確認模型可用，開始串流回應
      console.log(`[recognize] Using model: ${modelName}${i > 0 ? ` (fallback #${i})` : ""}`);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // 送出第一個 chunk
      if (!firstChunkResult.done) {
        const chunkText = firstChunkResult.value.text();
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }

      // 繼續串流剩餘 chunks
      for await (const chunk of { [Symbol.asyncIterator]: () => iterator }) {
        const chunkText = chunk.text();
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }

      res.end();
      return; // 成功完成，結束 handler

    } catch (error) {
      lastError = error;
      const isRetryable = isRetryableError(error);

      console.error(
        `[recognize] Model "${modelName}" failed` +
        (isRetryable ? " (retryable)" : " (non-retryable)") +
        `: ${error.message}`
      );

      if (!isRetryable || i === GEMINI_MODELS.length - 1) {
        // 不可重試的錯誤，或已是最後一個模型
        break;
      }

      console.log(`[recognize] Falling back to next model: ${GEMINI_MODELS[i + 1]}`);
    }
  }

  // 所有模型均失敗
  console.error("[recognize] All models exhausted. Last error:", lastError);
  res.status(503).json({
    error: "All models are currently unavailable. Please try again later.",
    detail: lastError?.message,
  });
}

/**
 * 判斷錯誤是否應觸發輪詢下一個模型
 * 429 / 503 / fetch 失敗等算力不足情境均視為可重試
 */
function isRetryableError(error) {
  const message = error?.message || "";

  // GoogleGenerativeAIFetchError 帶有 HTTP 狀態碼
  const retryableStatusPattern = /\[(429|500|502|503|504)[^\]]*\]/;
  if (retryableStatusPattern.test(message)) return true;

  // 網路層錯誤
  if (
    message.includes("fetch") ||
    message.includes("ECONNRESET") ||
    message.includes("ETIMEDOUT") ||
    message.includes("Service Unavailable") ||
    message.includes("high demand") ||
    message.includes("overloaded")
  ) {
    return true;
  }

  return false;
}
