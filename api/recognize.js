import { GoogleGenAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageData, mimeType } = req.body;

    const imagePart = {
      inlineData: {
        data: imageData,
        mimeType: mimeType
      },
    };

    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const result = await genAI.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "请你识别图片中的文字内容并输出，如果有格式不规整可以根据内容排版，並刪除換行符號，但保留段落分隔，或者单词错误中文词汇错误可以纠正，不要有任何开场白、解释、描述、总结或结束语。"
            },
            imagePart
          ]
        }
      ],
      generationConfig: {
        temperature: 0,  // 与开发环境保持一致
        topP: 1,
        topK: 1,
        maxOutputTokens: 8192,
        thinkingBudget: 0,  // 关闭思考模式
      }
    });

    // 设置响应头以支持流式传输
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // 流式传输结果
    for await (const chunk of result) {
      const chunkText = chunk.text || '';
      res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
    }

    res.end();
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
} 
