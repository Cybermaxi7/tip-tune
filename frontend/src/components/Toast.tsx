import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration?: number;
  onClose: (id: string) => void;
}

const icons = {
  success: <CheckCircle className="w-5 h-5 text-green-500" />,
  error: <AlertCircle className="w-5 h-5 text-red-500" />,
  warning: <AlertCircle className="w-5 h-5 text-yellow-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
};

export const Toast: React.FC<ToastProps> = ({
  id,
  type,
  title,
  message,
  duration = 5000,
  onClose,
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, id, onClose]);

  return (
    <div className="flex items-start w-full max-w-sm p-4 bg-white rounded-lg shadow-lg border border-gray-200 animate-slide-in-right">
      <div className="flex-shrink-0">{icons[type]}</div>
      <div className="ml-3 w-0 flex-1 pt-0.5">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="mt-1 text-sm text-gray-500">{message}</p>
      </div>
      <div className="ml-4 flex-shrink-0 flex">
        <button
          className="bg-white rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none"
          onClick={() => onClose(id)}
        >
          <span className="sr-only">Close</span>
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
