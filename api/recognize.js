import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageData, mimeType } = req.body;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-pro-exp-02-05",
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
      "請你辨識圖片中的文字內容並輸出，如果有格式不規整可以根據內容排版，或者單字錯誤中文詞彙錯誤可以糾正，不要有任何開場白、解釋、描述、總結或結束語。若是中文，將標點符號以全形（全角）表示。",
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
