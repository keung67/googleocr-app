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

  // 修改粘贴事件处理函数
  useEffect(() => {
    const handlePaste = async (e) => {
      e.preventDefault();
      const items = Array.from(e.clipboardData.items);
      
      for (const item of items) {
        // 处理图片
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            setIsLoading(true);
            try {
              const imageUrl = URL.createObjectURL(file);
              const newIndex = images.length;
              
              setImages(prev => [...prev, imageUrl]);
              setResults(prev => [...prev, '']);
              setCurrentIndex(newIndex);
              
              await handleFile(file, newIndex);
            } catch (error) {
              console.error('Error processing pasted image:', error);
            } finally {
              setIsLoading(false);
            }
          }
        }
        // 处理文本（可能是链接）
        else if (item.type === 'text/plain') {
          item.getAsString(async (text) => {
            // 如果文本包含 http 或 https，就认为是链接
            if (text.match(/https?:\/\//i)) {
              setImageUrl(text);
              setShowUrlInput(true);
            }
          });
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [images.length]);

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
      let imageBlob;
      
      // 处理 base64 图片
      if (imageUrl.startsWith('data:image/')) {
        const base64Data = imageUrl.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteArrays = [];
        
        for (let i = 0; i < byteCharacters.length; i++) {
          byteArrays.push(byteCharacters.charCodeAt(i));
        }
        
        imageBlob = new Blob([new Uint8Array(byteArrays)], { type: 'image/png' });
      } else {
        // 使用多个代理服务，如果一个失败就尝试下一个
        const proxyServices = [
          (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
          (url) => `https://cors-anywhere.herokuapp.com/${url}`,
          (url) => `https://proxy.cors.sh/${url}`,
          (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
        ];

        let error;
        for (const getProxyUrl of proxyServices) {
          try {
            const proxyUrl = getProxyUrl(imageUrl);
            const response = await fetch(proxyUrl, {
              headers: {
                'x-requested-with': 'XMLHttpRequest',
                'origin': window.location.origin
              }
            });
            
            if (!response.ok) throw new Error('Proxy fetch failed');
            imageBlob = await response.blob();
            // 如果成功获取图片，跳出循环
            break;
          } catch (e) {
            error = e;
            // 如果当前代理失败，继续尝试下一个
            continue;
          }
        }

        // 如果所有代理都失败了，尝试直接获取
        if (!imageBlob) {
          try {
            const response = await fetch(imageUrl, {
              mode: 'no-cors'
            });
            imageBlob = await response.blob();
          } catch (e) {
            // 如果直接获取也失败，抛出最后的错误
            throw error || e;
          }
        }
      }
      
      // 确保获取到的是图片
      if (!imageBlob.type.startsWith('image/')) {
        // 如果 MIME 类型不是图片，尝试强制设置为图片
        imageBlob = new Blob([imageBlob], { type: 'image/jpeg' });
      }
      
      const file = new File([imageBlob], 'image.jpg', { type: imageBlob.type });
      const imageUrlObject = URL.createObjectURL(file);
      
      // 验证图片是否可用
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrlObject;
      });
      
      const newIndex = images.length;
      setImages(prev => [...prev, imageUrlObject]);
      setResults(prev => [...prev, '']);
      setCurrentIndex(newIndex);
      
      await handleFile(file, newIndex);
      
      setShowUrlInput(false);
      setImageUrl('');
    } catch (error) {
      console.error('Error loading image:', error);
      
      // 提供更详细的错误信息
      let errorMessage = '无法加载图片，';
      if (error.message.includes('CORS')) {
        errorMessage += '该图片可能有访问限制。';
      } else if (error.message.includes('network')) {
        errorMessage += '网络连接出现问题。';
      } else {
        errorMessage += '请检查链接是否正确。';
      }
      errorMessage += '\n您可以尝试：\n1. 右键图片另存为后上传\n2. 使用截图工具后粘贴\n3. 复制图片本身而不是链接';
      
      alert(errorMessage);
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

  // 在 App 组件中添加复制函数
  const handleCopyText = () => {
    if (results[currentIndex]) {
      navigator.clipboard.writeText(results[currentIndex])
        .then(() => {
          // 可以添加一个临时的成功提示
          const button = document.querySelector('.copy-button');
          const originalText = button.textContent;
          button.textContent = '已复制';
          button.classList.add('copied');
          
          setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
          }, 2000);
        })
        .catch(err => {
          console.error('复制失败:', err);
        });
    }
  };

  return (
    <div className="app">
      <header>
        <a 
          href="https://github.com/cokice/googleocr-app" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="github-link"
        >
          <svg height="32" aria-hidden="true" viewBox="0 0 16 16" version="1.1" width="32">
            <path fillRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
          </svg>
        </a>
        <h1>高精度OCR识别</h1>
        <p>智能识别多国语言及手写字体，上传或拖拽图片即刻识别文字内容</p>
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
                    <span>第 {currentIndex + 1} 张图片的识别结果</span>
                    {results[currentIndex] && (
                      <button 
                        className="copy-button"
                        onClick={handleCopyText}
                      >
                        复制内容
                      </button>
                    )}
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
