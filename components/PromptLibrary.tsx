import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icons } from './ui/Icons';
import { Prompt } from '../types';

interface PromptLibraryProps {
  isModal?: boolean; // Determines layout style
  onClose?: () => void;
  onSelect?: (content: string) => void; 
  showToast: (type: 'success' | 'error', msg: string) => void;
}

export const PromptLibrary: React.FC<PromptLibraryProps> = ({ isModal = false, onClose, onSelect, showToast }) => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('omni_prompts');
    if (saved) {
      setPrompts(JSON.parse(saved));
    }
  }, []);

  const savePrompts = (newPrompts: Prompt[]) => {
    setPrompts(newPrompts);
    localStorage.setItem('omni_prompts', JSON.stringify(newPrompts));
  };

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) {
      showToast('error', '标题和内容不能为空');
      return;
    }

    if (editId) {
      const updated = prompts.map(p => p.id === editId ? { ...p, title, content } : p);
      savePrompts(updated);
      showToast('success', '提示词已更新');
    } else {
      const newPrompt: Prompt = {
        id: crypto.randomUUID(),
        title,
        content,
        createdAt: Date.now()
      };
      savePrompts([newPrompt, ...prompts]);
      showToast('success', '提示词已创建');
    }
    resetForm();
  };

  const handleDelete = (id: string) => {
    if (confirm('确定删除此提示词吗？')) {
      const updated = prompts.filter(p => p.id !== id);
      savePrompts(updated);
      showToast('success', '提示词已删除');
    }
  };

  const startEdit = (p: Prompt) => {
    setEditId(p.id);
    setTitle(p.title);
    setContent(p.content);
    setIsEditing(true);
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditId(null);
    setTitle('');
    setContent('');
  };

  // Content render logic
  const renderContent = () => (
    <div className="flex h-full flex-col md:flex-row overflow-hidden bg-background">
      {/* List Column */}
      <div className={`flex-1 flex flex-col min-h-0 ${isEditing ? 'hidden md:flex md:w-1/2 md:border-r border-accents-2' : 'w-full'}`}>
         {!isModal && (
           <div className="p-4 border-b border-accents-2 flex justify-between items-center bg-background">
             <div className="font-bold text-lg flex items-center gap-2"><Icons.Library size={20}/> 提示词库</div>
             <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-3 py-1.5 bg-foreground text-background rounded-md text-sm hover:opacity-90">
               <Icons.Plus size={14} /> 新建
             </button>
           </div>
         )}
         {isModal && (
            <div className="p-4 border-b border-accents-2 flex justify-between items-center bg-accents-1">
               <div className="font-semibold flex items-center gap-2"><Icons.Library size={18}/> 选择提示词</div>
               <div className="flex gap-2">
                 <button onClick={() => setIsEditing(true)} className="p-1.5 hover:bg-accents-2 rounded"><Icons.Plus size={16}/></button>
                 {onClose && <button onClick={onClose} className="p-1.5 hover:bg-accents-2 rounded"><Icons.X size={16}/></button>}
               </div>
            </div>
         )}
         
         <div className="flex-1 overflow-y-auto p-4 space-y-3">
             {prompts.length === 0 && (
               <div className="text-center text-accents-4 text-sm mt-8 flex flex-col items-center">
                 <Icons.Book size={32} className="opacity-20 mb-2"/>
                 库中暂无提示词
               </div>
             )}
             {prompts.map(p => (
               <div key={p.id} className="group p-3 border border-accents-2 rounded-md hover:bg-accents-1 transition-colors flex flex-col gap-2 relative">
                  <div className="flex justify-between items-start">
                    <h5 className="font-medium truncate pr-10">{p.title}</h5>
                    <div className="flex gap-1 absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity bg-accents-1 rounded">
                      <button onClick={(e) => {e.stopPropagation(); startEdit(p);}} className="p-1.5 hover:text-success"><Icons.Settings size={14} /></button>
                      <button onClick={(e) => {e.stopPropagation(); handleDelete(p.id);}} className="p-1.5 hover:text-error"><Icons.Trash size={14} /></button>
                    </div>
                  </div>
                  <p className="text-xs text-accents-5 line-clamp-3 font-mono bg-accents-1/50 p-2 rounded">
                    {p.content}
                  </p>
                  {onSelect && (
                    <button 
                      onClick={() => onSelect(p.content)}
                      className="mt-1 w-full py-1.5 border border-accents-2 hover:bg-foreground hover:text-background text-xs rounded font-medium transition-colors"
                    >
                      使用
                    </button>
                  )}
               </div>
             ))}
         </div>
      </div>

      {/* Editor Column / Overlay */}
      <AnimatePresence>
        {isEditing && (
          <motion.div 
            initial={isModal ? { x: '100%' } : { opacity: 0 }}
            animate={isModal ? { x: 0 } : { opacity: 1 }}
            exit={isModal ? { x: '100%' } : { opacity: 0 }}
            className={`${isModal ? 'absolute inset-0 bg-background z-10' : 'flex-1 md:w-1/2 bg-background flex flex-col'} flex flex-col border-l border-accents-2`}
          >
            <div className="p-4 border-b border-accents-2 flex justify-between items-center bg-accents-1">
              <span className="font-semibold">{editId ? '编辑提示词' : '新建提示词'}</span>
              <button onClick={resetForm}><Icons.X size={18} /></button>
            </div>
            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
               <div>
                 <label className="block text-xs font-medium text-accents-5 mb-1 uppercase">标题</label>
                 <input 
                   className="w-full px-3 py-2 bg-accents-1 border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground"
                   placeholder="例如：Python 专家"
                   value={title}
                   onChange={e => setTitle(e.target.value)}
                 />
               </div>
               <div className="flex-1 flex flex-col h-[300px] md:h-auto">
                 <label className="block text-xs font-medium text-accents-5 mb-1 uppercase">Prompt 内容</label>
                 <textarea 
                   className="flex-1 w-full px-3 py-2 bg-accents-1 border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground font-mono text-sm resize-none"
                   placeholder="输入提示词内容..."
                   value={content}
                   onChange={e => setContent(e.target.value)}
                 />
               </div>
            </div>
            <div className="p-4 border-t border-accents-2 flex justify-end gap-2 bg-background">
               <button onClick={resetForm} className="px-4 py-2 text-sm text-accents-5 hover:text-foreground">取消</button>
               <button onClick={handleSubmit} className="px-4 py-2 text-sm bg-foreground text-background rounded-md font-medium hover:opacity-90">保存</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-background w-full max-w-3xl h-[70vh] rounded-xl shadow-2xl overflow-hidden border border-accents-2 relative"
        >
          {renderContent()}
        </motion.div>
      </div>
    );
  }

  return <div className="h-full animate-fade-in">{renderContent()}</div>;
};