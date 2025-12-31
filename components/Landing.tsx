import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from './ui/Icons';

interface LandingProps {
  onEnter: () => void;
}

export const Landing: React.FC<LandingProps> = ({ onEnter }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-background text-foreground">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Grid */}
        <div 
           className="absolute inset-0 opacity-[0.03]" 
           style={{ 
             backgroundImage: 'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)', 
             backgroundSize: '50px 50px',
             maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 100%)'
           }} 
        />
        
        {/* Animated Orbs */}
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.1, 0.2, 0.1], 
            rotate: [0, 90, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-500/20 rounded-full blur-[120px]"
        />
        <motion.div 
          animate={{ 
            scale: [1.2, 1, 1.2],
            opacity: [0.1, 0.15, 0.1],
            x: [0, 50, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px]"
        />
      </div>

      <div className="z-10 max-w-4xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-8"
        >
          <div className="flex items-center justify-center mb-6">
            <motion.div 
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.5 }}
              className="p-3 bg-foreground rounded-full text-background cursor-pointer shadow-xl"
            >
              <Icons.Activity size={32} strokeWidth={2} />
            </motion.div>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-foreground to-accents-4">
            API Check
          </h1>
          <p className="text-xl text-accents-5 max-w-2xl mx-auto leading-relaxed mb-6">
            简单、快速的大模型 API 连通性测试工具。
            <br/>
            纯前端本地运行，隐私安全，数据仅在本地存储。
          </p>
          
          <div className="flex justify-center gap-2 mb-8">
             <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accents-1 border border-accents-2 text-xs text-accents-5 font-mono">
                <Icons.CheckCircle size={12} className="text-success"/> Pure Frontend
             </span>
             <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accents-1 border border-accents-2 text-xs text-accents-5 font-mono">
                <Icons.CheckCircle size={12} className="text-success"/> Local Storage
             </span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="flex justify-center gap-4"
        >
          <button
            onClick={onEnter}
            className="group relative inline-flex items-center justify-center px-8 py-3 text-base font-medium text-background bg-foreground rounded-full overflow-hidden transition-all hover:bg-accents-7 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-foreground shadow-lg hover:shadow-xl"
          >
            <span className="relative flex items-center gap-2">
              开始检测 <Icons.ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
        </motion.div>
      </div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-10 flex flex-col items-center gap-2"
      >
         <div className="text-accents-4 text-sm font-mono flex items-center gap-2 mb-1">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            System Operational
         </div>
         <a 
            href="https://linux.do/u/462642146/summary" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs text-accents-5 hover:text-foreground transition-colors border-b border-transparent hover:border-foreground pb-0.5"
         >
            Developed by Linux Do 三文鱼
         </a>
      </motion.div>
    </div>
  );
};