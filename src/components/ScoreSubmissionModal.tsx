'use client'

import { useState } from 'react'

interface ScoreSubmissionModalProps {
  isOpen: boolean
  score: number
  gameTime: number
  level: number
  onClose: () => void
  onSubmitSuccess: () => void
}

const ScoreSubmissionModal = ({
  isOpen,
  score,
  gameTime,
  level,
  onClose,
  onSubmitSuccess
}: ScoreSubmissionModalProps) => {
  const [nickname, setNickname] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!nickname.trim()) {
      setMessage('닉네임을 입력해주세요')
      return
    }

    setIsSubmitting(true)
    setMessage('')

    try {
      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nickname: nickname.trim(),
          score,
          duration: gameTime,
          level
        })
      })

      const data = await response.json()

      if (response.ok) {
        setMessage('점수가 성공적으로 등록되었습니다!')
        setIsSuccess(true)
        onSubmitSuccess()
        
        // 2초 후 모달 닫기
        setTimeout(() => {
          handleClose()
        }, 2000)
      } else {
        setMessage(data.error || '점수 등록에 실패했습니다')
        setIsSuccess(false)
      }
    } catch (error) {
      setMessage('네트워크 오류가 발생했습니다')
      setIsSuccess(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setNickname('')
    setMessage('')
    setIsSuccess(false)
    setIsSubmitting(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-white mb-4 text-center">
          🎯 점수 등록
        </h2>
        
        <div className="mb-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-gray-700 rounded-lg p-3">
              <div className="text-sm text-gray-400">점수</div>
              <div className="text-lg font-bold text-yellow-400">{score}</div>
            </div>
            <div className="bg-gray-700 rounded-lg p-3">
              <div className="text-sm text-gray-400">시간</div>
              <div className="text-lg font-bold text-blue-400">{gameTime}초</div>
            </div>
            <div className="bg-gray-700 rounded-lg p-3">
              <div className="text-sm text-gray-400">레벨</div>
              <div className="text-lg font-bold text-green-400">{level}</div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="nickname" className="block text-sm font-medium text-gray-300 mb-2">
              닉네임
            </label>
            <input
              type="text"
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              placeholder="닉네임을 입력하세요"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isSubmitting || isSuccess}
            />
            <div className="text-xs text-gray-500 mt-1">
              최대 20자까지 입력 가능합니다
            </div>
          </div>

          {message && (
            <div className={`text-sm text-center p-2 rounded ${
              isSuccess ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20'
            }`}>
              {message}
            </div>
          )}

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
              disabled={isSubmitting}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isSuccess}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? '등록 중...' : isSuccess ? '등록 완료!' : '등록하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ScoreSubmissionModal