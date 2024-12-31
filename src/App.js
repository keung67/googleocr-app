import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './App.css';
import TextTransition, { presets } from 'react-text-transition';
import { TypeAnimation } from 'react-type-animation';

// 初始化 Gemini API
const genAI = new GoogleGenerativeAI(process.env.REACT_APP_GEMINI_API_KEY);

// 添加配置
const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
};

function App() {
  const [images, setImages] = useState([]);
  const [results, setResults] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const resultRef = useRef(null);
  const dropZoneRef = useRef(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [isNewResult, setIsNewResult] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animatedText, setAnimatedText] = useState('');
  const [isTextReady, setIsTextReady] = useState(false);
  const [animationText, setAnimationText] = useState('');
  const [showAnimation, setShowAnimation] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // 添加粘贴事件监听
  useEffect(() => {
    const handlePaste = async (e) => {
      e.preventDefault();
      const items = Array.from(e.clipboardData.items);
      
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            setIsLoading(true);
            try {
              // 更新图片预览
              const imageUrl = URL.createObjectURL(file);
              const newIndex = images.length;
              
              setImages(prev => [...prev, imageUrl]);
              setResults(prev => [...prev, '']);
              setCurrentIndex(newIndex);
              
              // 处理文件
              await handleFile(file, newIndex);
            } catch (error) {
              console.error('Error processing pasted image:', error);
            } finally {
              setIsLoading(false);
            }
          }
        }
      }
    };

    // 添加粘贴事件监听器
    document.addEventListener('paste', handlePaste);

    // 清理函数
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [images.length]); // 依赖项包含 images.length

  // 将文件转换为Base64
  const fileToGenerativePart = async (file) => {
    const reader = new FileReader();
    return new Promise((resolve) => {
      reader.onloadend = () => {
        resolve({
          inlineData: {
            data: reader.result.split(',')[1],
            mimeType: file.type
          },
        });
      };
      reader.readAsDataURL(file);
    });
  };

  // 修改文件处理逻辑
  const handleFile = async (file, index) => {
    if (file && file.type.startsWith('image/')) {
      try {
        setIsStreaming(true);
        setStreamingText('');
        setResults(prev => {
          const newResults = [...prev];
          newResults[index] = '';
          return newResults;
        });

        // 将文件转换为 base64
        const fileReader = new FileReader();
        const imageData = await new Promise((resolve) => {
          fileReader.onloadend = () => {
            resolve(fileReader.result.split(',')[1]);
          };
          fileReader.readAsDataURL(file);
        });

        // 发送图片数据
        const response = await fetch('/api/recognize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageData,
            mimeType: file.type
          }),
        });

        const streamReader = response.body.getReader();
        let fullText = '';

        while (true) {
          const { done, value } = await streamReader.read();
          if (done) break;

          // 解码文本块
          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                fullText += data.text;
                setStreamingText(fullText);
                setResults(prevResults => {
                  const newResults = [...prevResults];
                  newResults[index] = fullText;
                  return newResults;
                });
              } catch (e) {
                console.error('Error parsing chunk:', e);
              }
            }
          }
        }

        setIsStreaming(false);

      } catch (error) {
        console.error('Error details:', error);
        setResults(prevResults => {
          const newResults = [...prevResults];
          newResults[index] = `识别出错,请重试 (${error.message})`;
          return newResults;
        });
        setIsStreaming(false);
      }
    }
  };

  // 添加并发控制函数
  const concurrentProcess = async (items, processor, maxConcurrent = 5) => {
    const results = [];
    for (let i = 0; i < items.length; i += maxConcurrent) {
      const chunk = items.slice(i, i + maxConcurrent);
      const chunkPromises = chunk.map((item, index) => processor(item, i + index));
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }
    return results;
  };

  // 修改文件上传处理
  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    setIsLoading(true);
    
    try {
      const startIndex = images.length;  // 获取当前图片数量作为起始索引
      
      // 先一次性更新所有图片预览
      const imageUrls = files.map(file => URL.createObjectURL(file));
      setImages(prev => [...prev, ...imageUrls]);
      
      // 初始化结果数组
      setResults(prev => [...prev, ...new Array(files.length).fill('')]);
      
      // 立即切换到第一张新图片
      setCurrentIndex(startIndex);
      
      // 使用并发控制处理文件
      await concurrentProcess(
        files,
        (file, index) => handleFile(file, startIndex + index)
      );
    } catch (error) {
      console.error('Error processing files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 修改图片切换函数
  const handlePrevImage = () => {
    setShowAnimation(false);
    setCurrentIndex(prev => Math.max(0, prev - 1));
    setTimeout(() => {
      setAnimationText(results[currentIndex - 1]);
      setShowAnimation(true);
    }, 100);
  };

  const handleNextImage = () => {
    setShowAnimation(false);
    setCurrentIndex(prev => Math.min(images.length - 1, prev + 1));
    setTimeout(() => {
      setAnimationText(results[currentIndex + 1]);
      setShowAnimation(true);
    }, 100);
  };

  // 处理拖拽事件
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setIsLoading(true);

    try {
      const items = Array.from(e.dataTransfer.items);
      const filePromises = items.map(async (item) => {
        if (item.kind === 'string') {
          const url = await new Promise(resolve => item.getAsString(resolve));
          if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            const response = await fetch(url);
            const blob = await response.blob();
            return new File([blob], 'image.jpg', { type: blob.type });
          }
        } else if (item.kind === 'file') {
          return item.getAsFile();
        }
        return null;
      });

      const files = (await Promise.all(filePromises)).filter(file => file !== null);
      const startIndex = images.length;  // 获取当前图片数量作为起始索引
      
      // 先一次性更新所有图片预览
      const imageUrls = files.map(file => URL.createObjectURL(file));
      setImages(prev => [...prev, ...imageUrls]);
      
      // 初始化结果数组
      setResults(prev => [...prev, ...new Array(files.length).fill('')]);
      
      // 立即切换到第一张新图片
      setCurrentIndex(startIndex);
      
      // 使用并发控制处理文件
      await concurrentProcess(
        files,
        (file, index) => handleFile(file, startIndex + index)
      );
    } catch (error) {
      console.error('Error processing dropped files:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 修改处理图片 URL 的函数
  const handleUrlSubmit = async (e) => {
    e.preventDefault();
    if (!imageUrl) return;
    setIsLoading(true);
    
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], 'image.jpg', { type: blob.type });
      
      // 更新图片预览
      const imageUrlObject = URL.createObjectURL(file);
      const newIndex = images.length;
      
      setImages(prev => [...prev, imageUrlObject]);
      setResults(prev => [...prev, '']);
      setCurrentIndex(newIndex);
      
      // 处理文件
      await handleFile(file, newIndex);
      
      setShowUrlInput(false);
      setImageUrl('');
    } catch (error) {
      console.error('Error loading image:', error);
      alert('无法加载图片，请检查链接是否正确');
    } finally {
      setIsLoading(false);
    }
  };

  // 添加处理图片点击的函数
  const handleImageClick = () => {
    setShowModal(true);
  };

  // 添加关闭模态框的函数
  const handleCloseModal = () => {
    setShowModal(false);
  };

  return (
    <div className="app">
      <header>
        <h1>图片文字识别</h1>
        <p>上传或拖拽图片，即刻识别文字内容</p>
      </header>

      <main className={images.length > 0 ? 'has-content' : ''}>
        <div className={`upload-section ${images.length > 0 ? 'with-image' : ''}`}>
          <div 
            ref={dropZoneRef}
            className={`upload-zone ${isDragging ? 'dragging' : ''}`}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="upload-container">
              <label className="upload-button" htmlFor="file-input">
                {images.length > 0 ? '重新上传' : '上传图片'}
              </label>
              <input
                id="file-input"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                multiple
                hidden
              />
              <button 
                className="url-button" 
                onClick={() => setShowUrlInput(!showUrlInput)}
              >
                {showUrlInput ? '取消' : '使用链接'}
              </button>
            </div>
            
            {showUrlInput && (
              <form onSubmit={handleUrlSubmit} className="url-form">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="请输入图片链接"
                  className="url-input"
                />
                <button type="submit" className="url-submit">
                  确认
                </button>
              </form>
            )}
            
            {!images.length > 0 && !showUrlInput && (
              <p className="upload-hint">或将图片拖放到此处</p>
            )}
          </div>
          
          {images.length > 0 && (
            <div className="images-preview">
              <div className="image-navigation">
                <button 
                  onClick={handlePrevImage} 
                  disabled={currentIndex === 0}
                  className="nav-button"
                >
                  ←
                </button>
                <span className="image-counter">
                  {currentIndex + 1} / {images.length}
                </span>
                <button 
                  onClick={handleNextImage}
                  disabled={currentIndex === images.length - 1}
                  className="nav-button"
                >
                  →
                </button>
              </div>
              <div className={`image-preview ${isLoading ? 'loading' : ''}`}>
                <img 
                  src={images[currentIndex]} 
                  alt="预览" 
                  onClick={handleImageClick}
                  style={{ cursor: 'pointer' }}
                />
                {isLoading && <div className="loading-overlay" />}
              </div>
            </div>
          )}
        </div>

        {(results.length > 0 || isLoading) && (
          <div className="result-section">
            <div className="result-container" ref={resultRef}>
              {isLoading && <div className="loading">识别中...</div>}
              {results[currentIndex] && (
                <div className="result-text">
                  <div className="result-header">
                    第 {currentIndex + 1} 张图片的识别结果
                  </div>
                  <div className="gradient-text">
                    {isStreaming ? (
                      <div className="streaming-text">
                        {streamingText.split('\n').map((line, index) => (
                          <p 
                            key={index} 
                            className="animated-line"
                            style={{ '--index': index }}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <ReactMarkdown 
                        className="markdown-text ready"
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({node, children}) => (
                            <p className="animated-line">
                              {children}
                            </p>
                          ),
                          li: ({node, children}) => (
                            <li className="animated-line">
                              {children}
                            </li>
                          ),
                          td: ({node, children}) => (
                            <td className="animated-line">
                              {children}
                            </td>
                          ),
                          th: ({node, children}) => (
                            <th className="animated-line">
                              {children}
                            </th>
                          )
                        }}
                      >
                        {results[currentIndex]}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <img src={images[currentIndex]} alt="放大预览" />
            <button className="modal-close" onClick={handleCloseModal}>×</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
