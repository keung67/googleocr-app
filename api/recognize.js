import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageData, mimeType } = req.body;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
      },
    });

    const imagePart = {
      inlineData: {
        data: imageData,
        mimeType: mimeType
      },
    };

    const result = await model.generateContentStream([
      "請你辨識圖片中的文字內容並輸出，如果有格式不規整可以依照內容排版。將多餘不必要的換行刪除，接在同行並合併在同一段，但保留不同段落的分隔。若多欄排版，按順序先由左欄由上而下，再接右欄由上而下，因跨欄分隔未完成的斷句，不要換行的將句子連接完整並合併在同一段。不輸出Markdown格式和符號。必須準確判斷標點符號是否為中文全型。若單字錯誤中文詞彙錯誤可以糾正，不要有任何開場白、解釋、描述、總結或結束語。",
      imagePart
    ]);

    // 设置响应头以支持流式传输
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // 流式传输结果
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
    }

    res.end();
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
} 
