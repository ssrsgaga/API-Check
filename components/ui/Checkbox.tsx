import React from 'react';
import { Icons } from './Icons';

interface CheckboxProps {
  checked: boolean;
  onChange: () => void;
  className?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({ checked, onChange, className = '' }) => {
  return (
    <div 
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`w-4 h-4 rounded-[4px] border flex items-center justify-center cursor-pointer transition-all duration-200 ${
        checked 
          ? 'bg-foreground border-foreground' 
          : 'bg-transparent border-accents-3 hover:border-accents-5'
      } ${className}`}
    >
      {checked && <Icons.Check size={10} className="text-background stroke-[3px]" />}
    </div>
  );
};