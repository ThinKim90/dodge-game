'use client'

import { useState } from 'react'

interface ScoreSubmissionModalProps {
  isOpen: boolean
  score: number
  gameTime: number
  level: number
  gameSessionId: string | null
  isSubmittingGameSession: boolean
  onClose: () => void
  onSubmitSuccess: () => void
}

const ScoreSubmissionModal = ({
  isOpen,
  score,
  gameTime,
  level,
  gameSessionId,
  isSubmittingGameSession,
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

    if (!gameSessionId) {
      setMessage('게임 세션이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.')
      return
    }

    setIsSubmitting(true)
    setMessage('')

    try {
      console.log('🛡️ UUID 기반 점수 제출:', { nickname: nickname.trim(), sessionId: gameSessionId })
      
      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nickname: nickname.trim(),
          sessionId: gameSessionId
        })
      })

      const data = await response.json()

      if (response.ok) {
        onSubmitSuccess()
        
        // 성공 시 즉시 모달 닫기 (토스트 메시지로 안내)
        handleClose()
      } else {
        setMessage(data.error || '점수 등록에 실패했습니다')
        setIsSuccess(false)
      }
    } catch {
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

        {/* 게임 세션 저장 중이거나 준비되지 않은 경우 */}
        {(isSubmittingGameSession || !gameSessionId) && (
          <div className="text-center space-y-4">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
            <div className="text-yellow-400 text-sm">
              {isSubmittingGameSession ? '🔒 게임 데이터 보안 검증 중...' : '⏳ 게임 세션 준비 중...'}
            </div>
            <div className="text-gray-400 text-xs">
              부정행위 방지를 위해 게임 데이터를 안전하게 저장하고 있습니다
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              닫기
            </button>
          </div>
        )}

        {/* 게임 세션이 준비된 경우 닉네임 입력 폼 */}
        {!isSubmittingGameSession && gameSessionId && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="nickname" className="block text-sm font-medium text-gray-300 mb-2">
                닉네임 (최대 12자)
              </label>
              <input
                type="text"
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="닉네임을 입력하세요"
                maxLength={12}
                disabled={isSubmitting}
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                disabled={isSubmitting}
              >
                취소
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-500"
                disabled={isSubmitting || !nickname.trim()}
              >
                {isSubmitting ? '등록 중...' : '등록하기'}
              </button>
            </div>

            {message && !isSuccess && (
              <div className="text-center text-sm p-3 rounded-md bg-red-900 text-red-300 border border-red-700">
                {message}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

export default ScoreSubmissionModal