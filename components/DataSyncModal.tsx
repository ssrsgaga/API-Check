import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Icons } from './ui/Icons';
import { Peer } from 'peerjs';
import QRCode from 'qrcode';

interface DataSyncModalProps {
  onClose: () => void;
  getDataToExport: () => any;
  onImportData: (data: any) => void;
  showToast: (type: 'success' | 'error' | 'info', msg: string) => void;
  initialMode?: 'select' | 'send' | 'receive';
  initialPeerId?: string; // For auto-connecting
}

type SyncState = 'idle' | 'generating' | 'waiting' | 'connecting' | 'transferring' | 'success' | 'error';

export const DataSyncModal: React.FC<DataSyncModalProps> = ({ 
  onClose, 
  getDataToExport, 
  onImportData, 
  showToast,
  initialMode = 'select',
  initialPeerId = ''
}) => {
  const [mode, setMode] = useState<'select' | 'send' | 'receive'>(initialMode);
  const [status, setStatus] = useState<SyncState>('idle');
  const [peerId, setPeerId] = useState('');
  const [targetId, setTargetId] = useState(initialPeerId);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  
  // Custom Host logic for Localhost/LAN support
  const [hostAddress, setHostAddress] = useState(window.location.host);
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  const peerRef = useRef<Peer | null>(null);
  const connRef = useRef<any>(null);

  useEffect(() => {
    // If we start in receive mode with an ID (from URL), start connecting immediately
    if (initialMode === 'receive' && initialPeerId) {
        startReceive(initialPeerId);
    }

    return () => {
      destroyPeer();
    };
  }, []);

  // Regenerate QR when host address changes (only if already waiting)
  useEffect(() => {
      if (status === 'waiting' && peerId) {
          generateQr(peerId);
      }
  }, [hostAddress]);

  const destroyPeer = () => {
    if (connRef.current) {
        connRef.current.close();
        connRef.current = null;
    }
    if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
    }
  };

  const generateQr = (id: string) => {
      const protocol = window.location.protocol;
      const path = window.location.pathname;
      // Use configured host address
      const url = `${protocol}//${hostAddress}${path}?sync_id=${id}`;
      
      QRCode.toDataURL(url, { width: 256, margin: 2 }, (err, url) => {
          if (!err) setQrCodeUrl(url);
      });
  };

  // --- Sender Logic ---
  const startSend = async () => {
    setMode('send');
    setStatus('generating');
    setProgressMsg('正在初始化 P2P 通道...');

    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
        setPeerId(id);
        setStatus('waiting');
        setProgressMsg('等待接收端扫描...');
        generateQr(id);
    });

    peer.on('connection', (conn) => {
        connRef.current = conn;
        setStatus('transferring');
        setProgressMsg('接收端已连接，正在发送数据...');

        conn.on('open', () => {
            // Send data
            const data = getDataToExport();
            conn.send(data);
            showToast('success', '数据发送成功');
            setStatus('success');
            setProgressMsg('数据已发送！');
        });
    });

    peer.on('error', (err) => {
        console.error(err);
        setStatus('error');
        setProgressMsg(`连接错误: ${err.message}`);
    });
  };

  // --- Receiver Logic ---
  const startReceive = (target: string = targetId) => {
    if (!target.trim()) {
        showToast('error', '请输入连接码');
        return;
    }

    setMode('receive');
    setStatus('connecting');
    setProgressMsg('正在连接发送端...');

    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', () => {
        const conn = peer.connect(target);
        connRef.current = conn;

        conn.on('open', () => {
            setStatus('transferring');
            setProgressMsg('连接成功，等待数据传输...');
        });

        conn.on('data', (data: any) => {
            try {
                onImportData(data);
                setStatus('success');
                setProgressMsg('数据接收并导入成功！');
                showToast('success', '导入成功');
            } catch (e) {
                setStatus('error');
                setProgressMsg('数据解析失败');
            }
        });
        
        // Auto-close after 10s on error if connection fails silently
        setTimeout(() => {
            if (peerRef.current && status === 'connecting') {
                 // Check connection state manually if possible or just timeout
            }
        }, 10000);
    });

    peer.on('error', (err) => {
        console.error(err);
        setStatus('error');
        setProgressMsg(`连接错误: ${err.type === 'peer-unavailable' ? '找不到发送端，请检查连接码或网络' : err.message}`);
    });
  };

  const copyLink = () => {
      const protocol = window.location.protocol;
      const path = window.location.pathname;
      const url = `${protocol}//${hostAddress}${path}?sync_id=${peerId}`;
      navigator.clipboard.writeText(url);
      showToast('success', '连接已复制');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.95, opacity: 0 }} 
        className="bg-background w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-accents-2 flex flex-col"
      >
        {/* Header */}
        <div className="p-4 border-b border-accents-2 bg-accents-1 flex justify-between items-center">
            <h3 className="font-bold text-lg flex items-center gap-2">
                <Icons.Wifi size={20} className="text-success"/> 局域网互传
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-accents-2 rounded"><Icons.X size={20}/></button>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[300px] flex flex-col">
            {mode === 'select' && (
                <div className="flex flex-col gap-4 flex-1 justify-center">
                    <p className="text-sm text-accents-5 text-center mb-4">
                        通过 P2P 技术在不同设备间快速同步所有配置和数据。<br/>
                        <span className="text-xs opacity-70">请确保两台设备处于同一网络下，或公网可访问。</span>
                    </p>
                    <button 
                        onClick={startSend}
                        className="flex items-center gap-4 p-4 border border-accents-2 rounded-xl hover:border-success hover:bg-green-50/50 transition-all group text-left"
                    >
                        <div className="p-3 bg-green-100 text-green-600 rounded-full group-hover:scale-110 transition-transform">
                            <Icons.QrCode size={24}/>
                        </div>
                        <div>
                            <div className="font-bold text-base">我要发送</div>
                            <div className="text-xs text-accents-5">生成二维码，供另一台设备扫描</div>
                        </div>
                    </button>

                    <button 
                        onClick={() => setMode('receive')}
                        className="flex items-center gap-4 p-4 border border-accents-2 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all group text-left"
                    >
                         <div className="p-3 bg-blue-100 text-blue-600 rounded-full group-hover:scale-110 transition-transform">
                            <Icons.Scan size={24}/>
                        </div>
                        <div>
                            <div className="font-bold text-base">我要接收</div>
                            <div className="text-xs text-accents-5">扫描二维码或输入连接码接收数据</div>
                        </div>
                    </button>
                </div>
            )}

            {mode === 'send' && (
                <div className="flex flex-col items-center flex-1 justify-center gap-4 text-center">
                    {status === 'generating' && <Icons.Loading className="animate-spin text-accents-4" size={32}/>}
                    
                    {status === 'waiting' && qrCodeUrl && (
                        <>
                            <div className="bg-white p-2 rounded-lg border border-accents-2 shadow-sm">
                                <img src={qrCodeUrl} alt="Scan to sync" className="w-48 h-48" />
                            </div>
                            
                            {/* Localhost Warning & Input */}
                            {isLocalhost && (
                                <div className="w-full text-left bg-orange-50 border border-orange-100 p-3 rounded-lg text-xs text-orange-800">
                                    <div className="font-bold mb-1 flex items-center gap-1"><Icons.Info size={12}/> 注意</div>
                                    检测到您正在使用 Localhost。如需手机扫码，请将下方地址修改为您的局域网 IP (如 192.168.x.x:5173)。
                                    <input 
                                        className="w-full mt-2 p-1 border border-orange-200 rounded bg-white font-mono text-center"
                                        value={hostAddress}
                                        onChange={e => setHostAddress(e.target.value)}
                                    />
                                </div>
                            )}

                            <div className="space-y-2 w-full">
                                <p className="text-sm font-medium">请使用接收端(如手机)扫描二维码</p>
                                <div className="text-xs text-accents-5 flex items-center justify-center gap-2">
                                    <span>或手动输入连接码:</span>
                                    <code className="font-mono font-bold bg-accents-2 px-1 rounded select-all">{peerId}</code>
                                    <button onClick={() => {navigator.clipboard.writeText(peerId); showToast('success', '已复制')}}><Icons.Copy size={12}/></button>
                                </div>
                                <div className="mt-2 text-xs text-accents-4">
                                     确保两台设备在同一局域网 (Wi-Fi) 下。
                                </div>
                                <div>
                                     <button onClick={copyLink} className="text-xs text-success hover:underline">复制完整连接链接</button>
                                </div>
                            </div>
                        </>
                    )}

                    {(status === 'transferring' || status === 'success') && (
                        <div className="flex flex-col items-center gap-3 animate-fade-in">
                            <div className={`p-4 rounded-full ${status === 'success' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                                {status === 'success' ? <Icons.Check size={32}/> : <Icons.Activity size={32} className="animate-pulse"/>}
                            </div>
                            <div className="font-bold">{progressMsg}</div>
                        </div>
                    )}
                </div>
            )}

            {mode === 'receive' && (
                <div className="flex flex-col flex-1 justify-center gap-6">
                     {(status === 'transferring' || status === 'success') ? (
                         <div className="flex flex-col items-center gap-3 animate-fade-in text-center">
                            <div className={`p-4 rounded-full ${status === 'success' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                                {status === 'success' ? <Icons.Check size={32}/> : <Icons.Download size={32} className="animate-bounce"/>}
                            </div>
                            <div className="font-bold">{progressMsg}</div>
                        </div>
                     ) : status === 'connecting' ? (
                        <div className="flex flex-col items-center gap-3 text-center">
                            <Icons.Loading className="animate-spin text-accents-4" size={32}/>
                            <div className="text-sm text-accents-5">{progressMsg}</div>
                        </div>
                     ) : (
                         <div className="space-y-4">
                             <div className="p-4 bg-accents-1 rounded-lg border border-accents-2 text-center">
                                 <Icons.Smartphone size={48} className="mx-auto text-accents-4 mb-2"/>
                                 <p className="text-sm text-accents-6">推荐使用手机系统相机扫描发送端的二维码，即可自动连接。</p>
                                 <p className="text-xs text-accents-4 mt-2">请确保手机与发送端在同一 Wi-Fi 网络下。</p>
                             </div>
                             
                             <div className="relative flex items-center">
                                <div className="flex-grow border-t border-accents-2"></div>
                                <span className="flex-shrink-0 mx-4 text-xs text-accents-4">或</span>
                                <div className="flex-grow border-t border-accents-2"></div>
                             </div>

                             <div>
                                 <label className="text-xs font-bold uppercase text-accents-5 mb-1 block">手动输入连接码</label>
                                 <div className="flex gap-2">
                                     <input 
                                        className="flex-1 px-3 py-2 bg-accents-1 border border-accents-2 rounded-md focus:outline-none focus:ring-1 focus:ring-foreground font-mono"
                                        placeholder="例如：6d8a-..."
                                        value={targetId}
                                        onChange={e => setTargetId(e.target.value)}
                                     />
                                     <button 
                                        onClick={() => startReceive()}
                                        disabled={!targetId}
                                        className="px-4 py-2 bg-foreground text-background rounded-md font-bold text-sm disabled:opacity-50"
                                     >
                                        连接
                                     </button>
                                 </div>
                             </div>
                         </div>
                     )}

                     {status === 'error' && (
                         <div className="p-3 bg-red-50 border border-red-100 rounded text-red-600 text-sm text-center">
                             {progressMsg}
                             <button onClick={() => setStatus('idle')} className="block mx-auto mt-2 text-xs underline">重试</button>
                         </div>
                     )}
                </div>
            )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-accents-2 bg-accents-1 flex justify-between items-center">
             <div className="text-xs text-accents-4">
                {mode === 'send' ? '保持此窗口打开直到传输完成' : mode === 'receive' ? 'P2P 连接需要网络环境支持' : ''}
             </div>
             {mode !== 'select' && status !== 'success' && (
                 <button onClick={() => { setMode('select'); setStatus('idle'); }} className="text-sm text-accents-5 hover:text-foreground">返回</button>
             )}
             {status === 'success' && (
                 <button onClick={onClose} className="px-4 py-2 bg-foreground text-background rounded text-sm font-bold">完成</button>
             )}
        </div>
      </motion.div>
    </div>
  );
};