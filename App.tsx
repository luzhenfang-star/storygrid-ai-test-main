
import React, { useState, useCallback, useRef } from 'react';
import { Icons, SHOT_TYPES } from './constants';
import { ShotConfig, ShotType, ShotTypeZh, AnalysisResult, Language, GridConfig, GRID_OPTIONS, AspectRatioConfig, ASPECT_RATIO_OPTIONS } from './types';
import { analyzeImages, translatePrompt } from './services/geminiService';

interface SplitResult {
  originalName: string;
  parts: string[]; // base64 strings
}

export default function App() {
  // Storyboard State
  const [charImages, setCharImages] = useState<string[]>([]);
  const [sceneImages, setSceneImages] = useState<string[]>([]);
  const [userDescription, setUserDescription] = useState<string>('');
  const [gridSize, setGridSize] = useState<GridConfig>(GRID_OPTIONS[1]); // Default 3x3
  const [aspectRatio, setAspectRatio] = useState<AspectRatioConfig>(ASPECT_RATIO_OPTIONS[3]); // Default 16:9
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [shots, setShots] = useState<ShotConfig[]>([]);
  const [totalSummaryZh, setTotalSummaryZh] = useState<string>('');
  const [totalSummaryEn, setTotalSummaryEn] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [displayLanguage, setDisplayLanguage] = useState<Language>('zh');

  // Splitter State
  const [splitResults, setSplitResults] = useState<SplitResult[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [splitGridSize, setSplitGridSize] = useState<GridConfig>(GRID_OPTIONS[1]);

  const charInputRef = useRef<HTMLInputElement>(null);
  const sceneInputRef = useRef<HTMLInputElement>(null);
  const splitterInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'char' | 'scene') => {
    const files = Array.from(e.target.files || []) as File[];
    files.forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (type === 'char') {
          setCharImages(prev => [...prev, result].slice(-5));
        } else {
          setSceneImages(prev => [...prev, result].slice(-5));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const startAnalysis = async () => {
    if (charImages.length === 0 && sceneImages.length === 0 && !userDescription.trim()) {
      alert("请输入情节描述或上传参考图");
      return;
    }
    
    setIsAnalyzing(true);
    try {
      const result = await analyzeImages(charImages, sceneImages, userDescription, gridSize.total);
      setAnalysis(result);
      
      if (result.suggestedShots) {
        const updatedShots = result.suggestedShots.map((suggestion, index) => ({
          id: index + 1,
          type: suggestion.type,
          description: suggestion.description
        }));
        setShots(updatedShots);
      }
    } catch (err) {
      console.error("解析失败:", err);
      alert("生成分镜建议失败，请重试。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateFinalPrompt = async () => {
    if (!analysis) return;
    setIsGenerating(true);
    
    try {
      const shotTextsEn = shots.map(s => `Shot 0${s.id} [${s.type}]: ${s.description}`).join('\n');
      const promptEn = `[${gridSize.rows}x${gridSize.cols} Storyboard Narrative]
[GLOBAL SCENE DESCRIPTION]
- Context & Logic: ${analysis.cinematicLogic}
- Environment: ${analysis.scene}
- Characters: ${analysis.characters}
- Lighting: ${analysis.lighting}
- Clothing: ${analysis.clothing}
- Atmosphere: ${analysis.atmosphere}

[TECHNICAL SPECS] Cinematic 8k, photorealistic, ${aspectRatio.value} aspect ratio, consistent visual language.

[SHOT-BY-SHOT SEQUENCE]:
${shotTextsEn}`;

      const summaryZhBase = shots.map(s => `分镜 0${s.id}（${ShotTypeZh[s.type] || s.type}）：${s.description}`).join('\n');
      const promptForZhTranslation = `请将以下电影感分镜汇总翻译成专业中文。
要求结构：
第一部分是【全局画面描述】，包含叙事逻辑、场景、人物、灯光、服装和氛围。
第二部分是【分镜详细序列】。

英文原始内容：
叙事逻辑: ${analysis.cinematicLogic}
场景: ${analysis.scene}
人物: ${analysis.characters}
灯光: ${analysis.lighting}
服装: ${analysis.clothing}
氛围: ${analysis.atmosphere}
画幅比: ${aspectRatio.label}

分镜序列内容：
${summaryZhBase}`;

      const translatedContent = await translatePrompt(promptForZhTranslation, 'zh');
      
      const finalZh = `【${gridSize.rows}x${gridSize.cols} 电影级全景分镜汇总提示词】
[生成要求] 8K超高清，照片写实，电影构图，${aspectRatio.label}画幅，全画幅人物/场景一致性。

${translatedContent}`;
      
      setTotalSummaryEn(promptEn);
      setTotalSummaryZh(finalZh);
      
      setTimeout(() => {
        document.getElementById('result-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      
    } catch (err) {
      console.error("生成失败:", err);
      alert("提示词生成失败，请重试。");
    } finally {
      setIsGenerating(false);
    }
  };

  const updateShot = (id: number, field: keyof ShotConfig, value: any) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("提示词已复制到剪贴板！");
  };

  // --- 高级图片拆解核心逻辑 ---
  const handleSplitterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;
    
    setIsSplitting(true);
    const results: SplitResult[] = [];

    for (const file of files) {
      try {
        const img = await loadImage(file);
        const parts = await splitAndRefineImage(img, splitGridSize.rows, splitGridSize.cols);
        results.push({ originalName: file.name, parts });
      } catch (err) {
        console.error(`Error splitting ${file.name}:`, err);
      }
    }

    setSplitResults(prev => [...results, ...prev]);
    setIsSplitting(false);
    e.target.value = '';
  };

  const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  /**
   * 智能拆分与边缘重构
   */
  const splitAndRefineImage = async (img: HTMLImageElement, rows: number, cols: number): Promise<string[]> => {
    const parts: string[] = [];
    const partWidth = img.width / cols;
    const partHeight = img.height / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // 创建一个临时画布进行原始切割
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = partWidth;
        tempCanvas.height = partHeight;
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        if (!tempCtx) continue;

        tempCtx.drawImage(
          img, 
          c * partWidth, r * partHeight, partWidth, partHeight, 
          0, 0, partWidth, partHeight
        );

        // 使用像素级扫描算法剔除无效边框
        const optimizedPart = smartCropBorders(tempCanvas);
        parts.push(optimizedPart);
      }
    }
    return parts;
  };

  /**
   * 智能像素扫描裁剪：向外扩展探测法
   * 自动探测真实的画面起始位置，消除 AI 拼图中的各种颜色边框
   */
  const smartCropBorders = (canvas: HTMLCanvasElement): string => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return canvas.toDataURL('image/png');

    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // 判定是否为边框像素（深色、纯白、透明或极低饱和度的杂色线）
    const isNoisePixel = (r: number, g: number, b: number, a: number) => {
      if (a < 40) return true; // 透明
      const brightness = (r + g + b) / 3;
      // 这里的阈值经过调优，可以覆盖绝大多数 AI 生成拼图的黑色分割线与白色边框
      return (brightness < 22 || brightness > 238);
    };

    // 探测有效的画面矩形范围
    let minX = 0, minY = 0, maxX = w - 1, maxY = h - 1;

    // 从上边缘向内扫描，找到内容起始行 (Content Density > 3%)
    for (let y = 0; y < h / 4; y++) {
      let contentCount = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (!isNoisePixel(data[i], data[i+1], data[i+2], data[i+3])) contentCount++;
      }
      if (contentCount > w * 0.03) { minY = y; break; }
    }

    // 从下边缘向内扫描
    for (let y = h - 1; y > h * 0.75; y--) {
      let contentCount = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (!isNoisePixel(data[i], data[i+1], data[i+2], data[i+3])) contentCount++;
      }
      if (contentCount > w * 0.03) { maxY = y; break; }
    }

    // 从左边缘向内扫描
    for (let x = 0; x < w / 4; x++) {
      let contentCount = 0;
      for (let y = minY; y <= maxY; y++) {
        const i = (y * w + x) * 4;
        if (!isNoisePixel(data[i], data[i+1], data[i+2], data[i+3])) contentCount++;
      }
      if (contentCount > (maxY - minY) * 0.03) { minX = x; break; }
    }

    // 从右边缘向内扫描
    for (let x = w - 1; x > w * 0.75; x--) {
      let contentCount = 0;
      for (let y = minY; y <= maxY; y++) {
        const i = (y * w + x) * 4;
        if (!isNoisePixel(data[i], data[i+1], data[i+2], data[i+3])) contentCount++;
      }
      if (contentCount > (maxY - minY) * 0.03) { maxX = x; break; }
    }

    // 为确保完全消除边框线，向内额外收缩 1-2 像素（Safety Buffer）
    const cropX = Math.min(minX + 1, w - 1);
    const cropY = Math.min(minY + 1, h - 1);
    const cropW = Math.max(maxX - minX - 1, 1);
    const cropH = Math.max(maxY - minY - 1, 1);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = cropW;
    outCanvas.height = cropH;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return canvas.toDataURL('image/png');

    // 使用高平滑度重新绘制，并稍微羽化边缘防止硬切瑕疵
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    return outCanvas.toDataURL('image/png', 0.98);
  };

  const downloadAllSplit = (result: SplitResult) => {
    result.parts.forEach((data, index) => {
      const link = document.createElement('a');
      link.href = data;
      link.download = `${result.originalName.split('.')[0]}_shot_${index + 1}.png`;
      link.click();
    });
  };

  const downloadEverySingleOne = () => {
    splitResults.forEach(res => downloadAllSplit(res));
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-12 bg-slate-950 text-slate-100 selection:bg-indigo-500/30 font-sans">
      {/* 顶部页眉 */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800 pb-8">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 text-white">
              <Icons.Sparkles />
            </div>
            <h1 className="text-4xl font-black bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent tracking-tighter">
              StoryGrid AI
            </h1>
          </div>
          <p className="text-slate-400 font-medium ml-1 text-sm md:text-base">专业级电影分镜创作与分发系统</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-emerald-400 font-bold bg-emerald-400/10 px-3 py-1.5 rounded-full border border-emerald-400/20 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
            智能边缘重构算法已就绪
          </span>
        </div>
      </header>

      {/* 主工作区 */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* 左侧面板 */}
        <section className="lg:col-span-4 space-y-6">
          <div className="glass p-6 rounded-2xl bg-slate-900/40 border border-slate-800 shadow-inner space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span className="w-1.5 h-4 bg-indigo-500 rounded-full"></span>
              场景参数设置
            </h2>

            {/* 人物参考图 */}
            <div className="space-y-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                人物参考 (Character)
                <span className="text-[9px] lowercase font-normal opacity-50">多图参考</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {charImages.map((img, idx) => (
                  <div key={idx} className="aspect-square relative group overflow-hidden rounded-xl border border-slate-800">
                    <img src={img} className="w-full h-full object-cover" />
                    <button onClick={() => setCharImages(prev => prev.filter((_, i) => i !== idx))} className="absolute top-1 right-1 bg-black/60 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  </div>
                ))}
                {charImages.length < 5 && (
                  <button 
                    onClick={() => charInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-slate-800 rounded-xl flex items-center justify-center text-slate-600 hover:border-slate-700 transition-all bg-slate-950/30"
                  >
                    <Icons.Upload />
                  </button>
                )}
              </div>
              <input type="file" multiple hidden ref={charInputRef} onChange={(e) => handleImageUpload(e, 'char')} accept="image/*" />
            </div>

            {/* 场景参考图 */}
            <div className="space-y-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                场景参考 (Environment)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {sceneImages.map((img, idx) => (
                  <div key={idx} className="aspect-square relative group overflow-hidden rounded-xl border border-slate-800">
                    <img src={img} className="w-full h-full object-cover" />
                    <button onClick={() => setSceneImages(prev => prev.filter((_, i) => i !== idx))} className="absolute top-1 right-1 bg-black/60 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                  </div>
                ))}
                {sceneImages.length < 5 && (
                  <button 
                    onClick={() => sceneInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-slate-800 rounded-xl flex items-center justify-center text-slate-600 hover:border-slate-700 transition-all bg-slate-950/30"
                  >
                    <Icons.Upload />
                  </button>
                )}
              </div>
              <input type="file" multiple hidden ref={sceneInputRef} onChange={(e) => handleImageUpload(e, 'scene')} accept="image/*" />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                故事情节 / 视觉风格
              </label>
              <textarea
                value={userDescription}
                onChange={(e) => setUserDescription(e.target.value)}
                placeholder="例如：赛博朋克风格的秘密交易，环境昏暗，只有蓝红霓虹灯光..."
                className="w-full h-24 bg-slate-950/50 border border-slate-800 rounded-xl p-3 text-xs focus:ring-1 focus:ring-indigo-500 outline-none resize-none text-slate-300 transition-all placeholder:text-slate-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">分镜数量</label>
                <select 
                  value={gridSize.total} 
                  onChange={(e) => setGridSize(GRID_OPTIONS.find(o => o.total === parseInt(e.target.value)) || GRID_OPTIONS[1])}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-300 outline-none focus:border-indigo-500"
                >
                  {GRID_OPTIONS.map(opt => <option key={opt.total} value={opt.total}>{opt.label}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">画面画幅</label>
                <select 
                  value={aspectRatio.value} 
                  onChange={(e) => setAspectRatio(ASPECT_RATIO_OPTIONS.find(o => o.value === e.target.value) || ASPECT_RATIO_OPTIONS[3])}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-300 outline-none focus:border-indigo-500"
                >
                  {ASPECT_RATIO_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>

            <button
              onClick={startAnalysis}
              disabled={isAnalyzing}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 text-white rounded-xl flex items-center justify-center gap-2 transition-all font-bold shadow-lg shadow-indigo-500/10"
            >
              {isAnalyzing ? "正在构思画面..." : "一键生成分镜序列"}
            </button>
          </div>

          {analysis && (
            <div className="glass p-6 rounded-2xl space-y-4 animate-in fade-in slide-in-from-left duration-500 bg-slate-900/40 border border-slate-800">
              <h2 className="text-xs font-bold flex items-center gap-2 text-indigo-400">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
                导演剪辑逻辑
              </h2>
              <div className="p-3 bg-indigo-500/5 rounded-lg border border-indigo-500/20">
                <p className="text-xs leading-relaxed text-slate-300 italic">"{analysis.cinematicLogic}"</p>
              </div>
            </div>
          )}
        </section>

        {/* 右侧面板：分镜编辑 */}
        <section className="lg:col-span-8 space-y-6">
          <div className="glass p-6 rounded-2xl bg-slate-900/40 border border-slate-800 min-h-[600px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
              <div className="space-y-1">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  Storyboard Panels
                  <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20">{gridSize.label}</span>
                </h2>
                <p className="text-[11px] text-slate-500 font-medium tracking-wide">您可以点击分镜类型快速切换景别，或手动精修描述内容</p>
              </div>
              <button 
                onClick={generateFinalPrompt}
                disabled={!analysis || isGenerating}
                className="px-8 py-3 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50 transition-all shadow-xl shadow-indigo-500/20"
              >
                {isGenerating ? "生成中..." : "生成提示词全案"}
              </button>
            </div>
            
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${gridSize.cols === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
              {shots.map((shot) => (
                <div key={shot.id} className="p-4 bg-slate-900/60 rounded-xl border border-slate-800 space-y-3 hover:border-indigo-500/40 transition-all shadow-inner group relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">Panel 0{shot.id}</span>
                    <select
                      value={shot.type}
                      onChange={(e) => updateShot(shot.id, 'type', e.target.value)}
                      className="bg-slate-950 text-[9px] border border-slate-800 rounded px-1 py-0.5 outline-none text-slate-200 group-hover:border-indigo-500/30"
                    >
                      {SHOT_TYPES.map(t => <option key={t} value={t}>{ShotTypeZh[t] || t}</option>)}
                    </select>
                  </div>
                  <textarea
                    value={shot.description}
                    onChange={(e) => updateShot(shot.id, 'description', e.target.value)}
                    className="w-full h-28 bg-slate-950/50 border border-slate-800 rounded-lg p-2 text-[10px] outline-none resize-none scrollbar-hide focus:border-indigo-500/50 transition-colors"
                  />
                </div>
              ))}
            </div>
            
            {!analysis && shots.length === 0 && (
              <div className="h-[400px] flex flex-col items-center justify-center text-slate-700 text-sm italic border-2 border-dashed border-slate-800/40 rounded-2xl bg-slate-950/10">
                <Icons.Sparkles />
                <p className="mt-4">在左侧填入创意，由 AI 为您构建分镜全案</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* 结果显示区 */}
      <section id="result-section" className="space-y-8 animate-in slide-in-from-bottom duration-700">
        {(totalSummaryZh || totalSummaryEn) && (
          <div className="group relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-3xl blur opacity-20"></div>
            <div className="relative glass p-8 rounded-3xl bg-slate-900 border border-amber-900/30 shadow-2xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center"><Icons.Translate /></div>
                  <h3 className="text-xl font-bold text-amber-100">AI 电影感提示词方案 (Prompt Suite)</h3>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                    <button 
                      onClick={() => setDisplayLanguage('zh')}
                      className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${displayLanguage === 'zh' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      ZH
                    </button>
                    <button 
                      onClick={() => setDisplayLanguage('en')}
                      className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${displayLanguage === 'en' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      EN
                    </button>
                  </div>
                  <button 
                    onClick={() => copyToClipboard(displayLanguage === 'zh' ? totalSummaryZh : totalSummaryEn)} 
                    className="px-6 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-xl text-xs font-bold border border-amber-600/30 flex items-center gap-2 transition-all active:scale-95"
                  >
                    <Icons.Copy /> 复制全案
                  </button>
                </div>
              </div>
              
              <div className="relative">
                <div className={`p-6 rounded-2xl border bg-slate-950/60 min-h-[350px] transition-all duration-300 ${displayLanguage === 'zh' ? 'border-amber-900/20 text-sm leading-relaxed text-slate-300 whitespace-pre-wrap' : 'border-slate-800 text-xs leading-relaxed text-indigo-200/70 font-mono whitespace-pre-wrap'}`}>
                  {displayLanguage === 'zh' ? totalSummaryZh : totalSummaryEn}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 底部工具：智能拼图拆解 */}
      <section className="mt-16 border-t border-slate-800 pt-16 pb-24 space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">万能拼图智能拆解工具</h2>
          <p className="text-slate-500 text-sm">升级版像素级扫描算法：自动重构边缘、剔除黑边、消除 AI 生成图的边框瑕疵</p>
        </div>

        <div className="glass p-8 rounded-3xl bg-slate-900/40 border border-slate-800">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
            <div className="flex flex-wrap items-center gap-4">
              <button 
                onClick={() => splitterInputRef.current?.click()}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg"
              >
                <Icons.Upload /> 批量上传拼图
              </button>
              <input type="file" multiple hidden ref={splitterInputRef} onChange={handleSplitterUpload} accept="image/*" />
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                {GRID_OPTIONS.map((opt) => (
                  <button
                    key={'split-' + opt.label}
                    onClick={() => setSplitGridSize(opt)}
                    className={`px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      splitGridSize.total === opt.total 
                        ? 'bg-slate-800 text-indigo-400' 
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {splitResults.length > 0 && (
              <button 
                onClick={downloadEverySingleOne}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold flex items-center gap-2 transition-all border border-slate-700"
              >
                一键导出全部分镜 ({splitResults.reduce((acc, r) => acc + r.parts.length, 0)})
              </button>
            )}
          </div>

          <div className="space-y-12">
            {splitResults.length === 0 && !isSplitting && (
              <div className="border-2 border-dashed border-slate-800 rounded-3xl h-48 flex flex-col items-center justify-center text-slate-600 opacity-40">
                <p className="text-sm">支持 2x2 / 3x3 / 4x4 规格，上传后自动修剪边缘</p>
              </div>
            )}
            
            {splitResults.map((result, resIdx) => (
              <div key={resIdx} className="space-y-4 animate-in fade-in slide-in-from-bottom duration-500">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                    <h4 className="font-bold text-slate-300 text-xs truncate max-w-xs">{result.originalName}</h4>
                  </div>
                  <button onClick={() => downloadAllSplit(result)} className="text-indigo-400 hover:text-indigo-300 text-[10px] font-bold">导出此组素材</button>
                </div>
                <div className="grid gap-4 grid-cols-4 md:grid-cols-8 lg:grid-cols-10">
                  {result.parts.map((part, partIdx) => (
                    <div 
                      key={partIdx} 
                      className="group relative aspect-square bg-slate-950 rounded-xl overflow-hidden border border-slate-800/80 hover:border-indigo-500/50 transition-all cursor-zoom-in shadow-xl shadow-black/50"
                      onClick={() => setPreviewImage(part)}
                    >
                      <img src={part} className="w-full h-full object-cover p-[1px] rounded-lg" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all backdrop-blur-[1px]">
                        <Icons.Sparkles />
                      </div>
                      <div className="absolute top-1 left-1 text-[7px] bg-black/60 text-white/50 px-1 rounded font-bold">{partIdx + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 高清预览模态框 */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/98 backdrop-blur-2xl animate-in fade-in duration-300" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-full max-h-full group flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} className="max-w-full max-h-[82vh] rounded-2xl shadow-2xl border border-white/5 object-contain" alt="Preview" />
            <div className="mt-6 flex items-center gap-6">
               <a href={previewImage} download="storygrid_optimized.png" className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-xl shadow-indigo-600/30">下载高清分镜</a>
              <button onClick={() => setPreviewImage(null)} className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-all">关闭预览</button>
            </div>
          </div>
        </div>
      )}

      <footer className="text-center text-slate-600 text-[10px] font-medium tracking-widest pb-12 opacity-40">
        <p>© 2024 STORYGRID AI | 像素级边缘修补算法 V2.1</p>
      </footer>
    </div>
  );
}
