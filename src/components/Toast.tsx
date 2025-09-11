'use client'

import { useState, useEffect } from 'react'

interface ToastProps {
  message: string
  type: 'success' | 'error' | 'info'
  duration?: number
  onClose: () => void
}

const Toast = ({ message, type, duration = 3000, onClose }: ToastProps) => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // 토스트 표시 애니메이션
    const showTimer = setTimeout(() => setIsVisible(true), 100)
    
    // 자동 닫기
    const hideTimer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 300) // 애니메이션 완료 후 제거
    }, duration)

    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
    }
  }, [duration, onClose])

  const getToastStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-600 text-white border-green-500'
      case 'error':
        return 'bg-red-600 text-white border-red-500'
      case 'info':
        return 'bg-blue-600 text-white border-blue-500'
      default:
        return 'bg-gray-600 text-white border-gray-500'
    }
  }

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✅'
      case 'error':
        return '❌'
      case 'info':
        return 'ℹ️'
      default:
        return '📢'
    }
  }

  return (
    <div
      className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg border-l-4 transform transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      } ${getToastStyles()}`}
    >
      <div className="flex items-center space-x-2">
        <span className="text-lg">{getIcon()}</span>
        <span className="font-medium">{message}</span>
      </div>
    </div>
  )
}

export default Toast
